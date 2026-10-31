import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_ADVANCED, DEFAULT_SETTINGS } from "../types";
import { SimulationEngine, applyEvent } from "./engine";
import {
  AdapterExecutor,
  PreviewAdapter,
  type WriteAhead,
  type OperationJournal,
} from "./adapters";
import {
  BrowserSessionStorage,
  decodeCheckpoint,
  type SessionCheckpoint,
} from "./session";
import { applyOperation } from "./operations";

const settings = {
  ...DEFAULT_SETTINGS,
  wpm: 300,
  variation: false,
  pauses: "off" as const,
  typos: "off" as const,
};
afterEach(() => vi.useRealTimers());
function journal() {
  const records = new Map<string, WriteAhead>();
  const port: OperationJournal = {
    async load(id) {
      return structuredClone(records.get(id) ?? null);
    },
    async save(record) {
      records.set(record.id, structuredClone(record));
    },
  };
  return { records, port };
}
function storage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (n: number) => [...values.keys()][n] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  } satisfies Storage;
}
it("recovers a saved insert-first revision, retaining actual audit times and approved Unicode text", () => {
  vi.useFakeTimers();
  const store = new BrowserSessionStorage(storage());
  const engine = new SimulationEngine();
  engine.setCheckpointWriter((s) => store.save(s));
  const before =
    "🌿 café. The old sentence has several ordinary words.\n\nRepeated. Repeated.";
  const target =
    "🌿 café. A completely different thought unfolds here!\n\nRepeated. Repeated.";
  engine.start(before, settings, "Recovery", {
    finalText: target,
    finalSettings: {
      ...settings,
      advanced: { ...DEFAULT_ADVANCED, majorRewrite: "insert-first" },
    },
  });
  vi.advanceTimersByTime(4000);
  engine.pause();
  const saved = store.list()[0];
  expect(saved.snapshot.stage).toBe("revision");
  expect(saved.operationIndex).toBeGreaterThan(0);
  const originalAudit = structuredClone(saved.audit);
  engine.dispose();
  vi.advanceTimersByTime(100_000);
  const recovered = new SimulationEngine();
  recovered.recover(store.load(saved.id)!);
  expect(recovered.getSnapshot().text).toBe(saved.snapshot.text);
  expect(recovered.getSnapshot().status).toBe("paused");
  expect(recovered.getLog()!.events.map((e) => e.timestamp)).toEqual(
    originalAudit.map((e) => e.timestamp),
  );
  recovered.resume();
  vi.advanceTimersByTime(60_000);
  expect(recovered.getSnapshot().status).toBe("completed");
  expect(recovered.getSnapshot().text).toBe(target);
  expect(recovered.getLog()!.events.reduce(applyEvent, "")).toBe(target);
});
it("pauses without output loss, and emergency stop cancels the next scheduled edit", () => {
  vi.useFakeTimers();
  const engine = new SimulationEngine();
  engine.start("Hello 🌿 café. More words.", settings);
  vi.advanceTimersByTime(200);
  engine.pause();
  const paused = engine.getSnapshot();
  vi.advanceTimersByTime(60_000);
  expect(engine.getSnapshot()).toEqual(paused);
  engine.resume();
  vi.advanceTimersByTime(100);
  engine.emergencyStop();
  const stopped = engine.getSnapshot();
  vi.advanceTimersByTime(60_000);
  expect(engine.getSnapshot()).toEqual(stopped);
  expect(vi.getTimerCount()).toBe(0);
});
it("reconciles an acknowledged-lost insertion without inserting it twice, including after executor restart", async () => {
  const adapter = new PreviewAdapter();
  await adapter.initialize({});
  const original = adapter.execute.bind(adapter);
  const write = vi
    .spyOn(adapter, "execute")
    .mockImplementationOnce(async (op, ctx) => {
      await original(op, ctx);
      throw new Error("Lost acknowledgement");
    });
  const { port, records } = journal();
  const executor = new AdapterExecutor(adapter, port);
  const op = { type: "insert" as const, index: 0, text: "🌿 café" };
  await expect(executor.execute("session:0", op, 0)).rejects.toThrow("Lost");
  expect(records.get("session:0")!.state).toBe("requires-reconciliation");
  const restarted = new AdapterExecutor(adapter, port);
  expect((await restarted.execute("session:0", op, 0)).state).toBe("confirmed");
  await restarted.execute("session:0", op, 0);
  expect(write).toHaveBeenCalledTimes(1);
  expect(await adapter.readText()).toBe("🌿 café");
});
it("blocks new writes on stop while reporting and reconciling a late remote write", async () => {
  const adapter = new PreviewAdapter();
  const original = adapter.execute.bind(adapter);
  let complete!: () => void;
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.spyOn(adapter, "execute").mockImplementation(async (op, ctx) => {
    started();
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
    // Simulate a service which committed despite a cancellation request.
    return original(op, { ...ctx, signal: new AbortController().signal });
  });
  const { port } = journal();
  const executor = new AdapterExecutor(adapter, port);
  const pending = executor.execute(
    "s:0",
    { type: "insert", index: 0, text: "Late" },
    0,
  );
  await begun;
  executor.stop();
  await expect(
    executor.execute("s:1", { type: "insert", index: 0, text: "No" }, 0),
  ).rejects.toThrow("stopped");
  complete();
  expect((await pending).state).toBe("confirmed");
  expect(await adapter.readText()).toBe("Late");
});
it("retains confirmed operations while changing future WPM and typo groups independently", () => {
  vi.useFakeTimers();
  const engine = new SimulationEngine();
  let checkpoint!: SessionCheckpoint;
  engine.setCheckpointWriter((s) => {
    checkpoint = structuredClone(s);
  });
  const source = "Thoughtful words and many ordinary sentences. ".repeat(5);
  engine.start(source, { ...settings, wpm: 100 }, "Live", {
    finalText: source + " 🌿",
    finalSettings: settings,
  });
  vi.advanceTimersByTime(250);
  const history = engine.getLog()!.events;
  engine.updateLiveSettings("draft", { ...settings, typos: "high" });
  expect(engine.getLog()!.events).toEqual(history);
  expect(checkpoint.log.options!.finalSettings!.typos).toBe("off");
  expect(() => decodeCheckpoint(JSON.stringify(checkpoint))).not.toThrow();
  vi.advanceTimersByTime(60_000);
  expect(engine.getSnapshot().text).toBe(source + " 🌿");
  expect(engine.getSnapshot().status).toBe("completed");
  expect(engine.getLog()!.events.reduce(applyEvent, "")).toBe(source + " 🌿");
});
it("rejects corrupt/version-incompatible checkpoints, storage failure and unsafe UTF-16 ranges", () => {
  expect(() => decodeCheckpoint('{"schemaVersion":99}')).toThrow(
    "Incompatible",
  );
  expect(() => decodeCheckpoint('{"schemaVersion":1}')).toThrow("Corrupted");
  const broken = storage();
  broken.setItem = () => {
    throw new Error("Quota exceeded");
  };
  const store = new BrowserSessionStorage(broken);
  const engine = new SimulationEngine();
  engine.setCheckpointWriter((s) => store.save(s));
  engine.start("🌿 café", settings);
  expect(engine.getSnapshot().storageError).toContain("not safely recoverable");
  engine.dispose();
  expect(() =>
    applyOperation("🌿 café", { type: "delete", index: 1, expected: "\udf3f" }),
  ).toThrow("UTF-16");
  expect(() =>
    applyOperation("Repeated. Repeated.", {
      type: "delete",
      index: 10,
      expected: "wrong",
    }),
  ).toThrow("Stale");
});
it("times out uncertain writes and refuses retries without enforced revision tokens", async () => {
  vi.useFakeTimers();
  const adapter = new PreviewAdapter();
  adapter.capabilities.revisionTokens = false;
  vi.spyOn(adapter, "execute").mockImplementation(() => new Promise(() => {}));
  const { port, records } = journal();
  const executor = new AdapterExecutor(adapter, port, 100);
  const pending = executor.execute(
    "s:0",
    { type: "insert", index: 0, text: "Maybe" },
    Date.now(),
  );
  const rejected = expect(pending).rejects.toThrow("uncertain");
  await vi.advanceTimersByTimeAsync(101);
  await rejected;
  const record = records.get("s:0")!;
  expect(record.state).toBe("requires-reconciliation");
  await expect(executor.reconcile(record)).rejects.toThrow(
    "may still complete",
  );
  expect(() => executor.resume()).toThrow("Reconcile");
});
it("rejects unsupported edits before sending a write, and isolates corrupt saved entries", async () => {
  const adapter = new PreviewAdapter();
  adapter.capabilities.operations = ["insert"];
  const write = vi.spyOn(adapter, "execute");
  const { port } = journal();
  await expect(
    new AdapterExecutor(adapter, port).execute(
      "s:0",
      { type: "replace", index: 0, expected: "", text: "No" },
      0,
    ),
  ).rejects.toThrow("does not support");
  expect(write).not.toHaveBeenCalled();
  const browser = storage();
  browser.setItem("typeflow-checkpoint-v1:broken", "not json");
  const store = new BrowserSessionStorage(browser);
  expect(store.list()).toEqual([]);
  expect(store.issues).toHaveLength(1);
  store.clear();
  expect(store.list()).toEqual([]);
  expect(store.issues).toEqual([]);
});
