import { describe, it, expect, vi } from "vitest";
import {
  compileBatch,
  compareFinalText,
  extractDocument,
  GoogleDocsOutputAdapter,
  GoogleApiError,
  type GoogleTransport,
  type GoogleDocument,
} from "./adapter";
import { AdapterExecutor, type WriteAhead } from "../simulation/adapters";

function document(text: string, revisionId = "r1"): GoogleDocument {
  return {
    documentId: "doc",
    revisionId,
    tabs: [
      {
        tabProperties: { tabId: "t.0" },
        documentTab: {
          body: {
            content: [
              { startIndex: 0, endIndex: 1, sectionBreak: {} },
              {
                startIndex: 1,
                endIndex: text.length + 2,
                paragraph: {
                  elements: [
                    {
                      startIndex: 1,
                      endIndex: text.length + 2,
                      textRun: { content: text + "\n" },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  };
}
function mockGoogle(initial = "") {
  let text = initial,
    rev = 1;
  const request = vi.fn(
    async (action: string, body: Record<string, unknown>) => {
      if (action === "read") return document(text, `r${rev}`);
      if (action === "batch") {
        if (body.revision !== `r${rev}`)
          throw new GoogleApiError("Revision conflict", 400);
        for (const item of body.requests as {
          insertText?: { location: { index: number }; text: string };
          deleteContentRange?: {
            range: { startIndex: number; endIndex: number };
          };
        }[]) {
          if (item.deleteContentRange) {
            const r = item.deleteContentRange.range;
            text = text.slice(0, r.startIndex - 1) + text.slice(r.endIndex - 1);
          }
          if (item.insertText) {
            const i = item.insertText;
            text =
              text.slice(0, i.location.index - 1) +
              i.text +
              text.slice(i.location.index - 1);
          }
        }
        rev++;
        return {};
      }
      return document(text);
    },
  );
  return {
    request,
    change: (value: string) => {
      text = value;
      rev++;
    },
  };
}
describe("Google document adapter", () => {
  it("orders destructive and inserted ranges in current UTF-16 coordinates, with a tab ID", () => {
    const result = compileBatch(
      "A😀 café\nend",
      [
        { type: "replace", index: 1, expected: "😀", text: "é" },
        { type: "insert", index: 2, text: "\n" },
        { type: "delete", index: 3, expected: " café" },
      ],
      "t.0",
    );
    expect(result.text).toBe("Aé\n\nend");
    expect(result.requests[0]).toEqual({
      deleteContentRange: {
        range: { startIndex: 2, endIndex: 4, tabId: "t.0" },
      },
    });
    expect(result.requests[1]).toEqual({
      insertText: { location: { index: 2, tabId: "t.0" }, text: "é" },
    });
    expect(() =>
      compileBatch("😀", [{ type: "delete", index: 1, expected: "\ude00" }]),
    ).toThrow("UTF-16");
    expect(() =>
      compileBatch("same same", [
        { type: "delete", index: 4, expected: "same" },
      ]),
    ).toThrow("Stale");
  });
  it("extracts user newlines exactly and rejects ambiguous tabs/structures", () => {
    expect(extractDocument(document("é😀\n\n")).text).toBe("é😀\n\n");
    const multiple = document("x");
    multiple.tabs!.push(multiple.tabs![0]);
    expect(() => extractDocument(multiple)).toThrow("tabs");
    const table = document("x");
    table.tabs![0].documentTab!.body!.content![1] = {
      startIndex: 1,
      table: {},
    };
    expect(() => extractDocument(table)).toThrow("Unsupported");
  });
  it("confirms an ordered batch and verifies punctuation, whitespace and ordering exactly", async () => {
    const google = mockGoogle();
    const adapter = new GoogleDocsOutputAdapter(google, {
      minWriteIntervalMs: 0,
    });
    await adapter.initialize({ documentId: "doc", text: "" });
    const receipts = await adapter.applyBatch(
      [
        {
          id: "s:1",
          operation: { type: "insert", index: 0, text: "Hello 😀\nDraft." },
        },
        {
          id: "s:2",
          operation: {
            type: "replace",
            index: 9,
            expected: "Draft.",
            text: "Final!",
          },
        },
      ],
      new AbortController().signal,
    );
    expect(receipts.at(-1)?.state.text).toBe("Hello 😀\nFinal!");
    expect(await adapter.verify("Hello 😀\nFinal!")).toBe(true);
    expect(await adapter.verify("Hello 😀\nFinal! ")).toBe(false);
    expect(await adapter.verify("Final!\nHello 😀")).toBe(false);
  });
  it("reconciles a committed but timed-out write without duplicating it", async () => {
    const google = mockGoogle();
    const transport: GoogleTransport = {
      async request(action, body) {
        const result = await google.request(action, body);
        if (action === "batch") throw new Error("Lost response");
        return result;
      },
    };
    const adapter = new GoogleDocsOutputAdapter(transport, {
      minWriteIntervalMs: 0,
    });
    await adapter.initialize({ documentId: "doc", text: "" });
    const records = new Map<string, WriteAhead>();
    const executor = new AdapterExecutor(adapter, {
      load: async (id) => records.get(id) ?? null,
      save: async (record) => {
        records.set(record.id, record);
      },
    });
    await expect(
      executor.execute(
        "s:1",
        { type: "insert", index: 0, text: "Only once" },
        Date.now(),
      ),
    ).rejects.toThrow("Lost response");
    expect(records.get("s:1")!.state).toBe("requires-reconciliation");
    expect((await executor.reconcile(records.get("s:1")!)).state).toBe(
      "confirmed",
    );
    executor.resume();
    await executor.execute(
      "s:1",
      { type: "insert", index: 0, text: "Only once" },
      Date.now(),
    );
    expect(
      google.request.mock.calls.filter(([action]) => action === "batch"),
    ).toHaveLength(1);
    expect(await adapter.readText()).toBe("Only once");
  });
  it("does not overwrite unexpected collaborator content", async () => {
    const google = mockGoogle("approved");
    const adapter = new GoogleDocsOutputAdapter(google);
    await adapter.initialize({ documentId: "doc", text: "approved" });
    google.change("collaborator text");
    await expect(
      adapter.apply({
        type: "replace",
        index: 0,
        expected: "approved",
        text: "target",
      }),
    ).rejects.toThrow("conflict");
    expect(
      google.request.mock.calls.some(([action]) => action === "batch"),
    ).toBe(false);
  });
  it("surfaces authorization expiry without retrying a write", async () => {
    const google = mockGoogle();
    const adapter = new GoogleDocsOutputAdapter(google);
    await adapter.initialize({ documentId: "doc" });
    google.request.mockRejectedValueOnce(
      new GoogleApiError("Connect Google again", 401),
    );
    await expect(
      adapter.apply({ type: "insert", index: 0, text: "x" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      google.request.mock.calls.some(([action]) => action === "batch"),
    ).toBe(false);
  });
});

// Exercise the real engine's revision operations through Google's range mapping.
import { createPlan } from "../simulation/plan";
import { DEFAULT_SETTINGS, DEFAULT_ADVANCED } from "../types";
import { eventOperation } from "../simulation/operations";
import { IDLE_SNAPSHOT, type SimulationEngine } from "../simulation/engine";
import {
  GoogleSyncCoordinator,
  newBinding,
  loadBinding,
  type SyncView,
} from "./sync";
import type { Scheduler } from "../simulation/scheduler";
it("runs all revision modes and edit strategies through ordered Google ranges", () => {
  for (const revisionMode of [
    "smart",
    "targeted",
    "paragraph",
    "full",
  ] as const) {
    for (const majorRewrite of [
      "insert-first",
      "delete-first",
      "replace",
    ] as const) {
      const settings = {
        ...DEFAULT_SETTINGS,
        typos: "off" as const,
        advanced: { ...DEFAULT_ADVANCED, majorRewrite },
      };
      const plan = createPlan(
        "🌿 café. Old words stay here.\n\nRepeat. Repeat.",
        settings,
        1,
        {
          finalText:
            "🌿 café. New approved words stay here!\n\nRepeat. Repeat.",
          finalSettings: settings,
          revisionMode,
        },
      );
      let text = "";
      for (let i = 0; i < plan.events.length; i += 100)
        text = compileBatch(
          text,
          plan.events.slice(i, i + 100).map(eventOperation),
          "t.0",
        ).text;
      expect(text).toBe(plan.source);
    }
  }
});
it("schedules progressive sync, honors pause and verifies before remote completion", async () => {
  const google = mockGoogle();
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    key: (n) => [...values.keys()][n] ?? null,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      values.set(k, v);
    },
    removeItem: (k) => {
      values.delete(k);
    },
    clear: () => values.clear(),
  };
  const plan = createPlan(
    "Approved 😀.",
    { ...DEFAULT_SETTINGS, typos: "off" },
    1,
  );
  let snapshot = {
    ...IDLE_SNAPSHOT,
    status: "running" as "running" | "paused" | "completed",
    text: plan.source,
  };
  let listener = () => {};
  const checkpoint = vi.fn();
  const host = {
    subscribe: (cb: () => void) => {
      listener = cb;
      return () => {};
    },
    getSnapshot: () => snapshot,
    getOutputProgress: () => ({ index: plan.events.length, sessionId: "s" }),
    getOutputCheckpoint: () => ({
      sessionId: "s",
      index: plan.events.length,
      events: plan.events,
      target: plan.source,
      snapshot,
    }),
    checkpoint,
    pause: () => {
      snapshot = { ...snapshot, status: "paused" };
      listener();
    },
  } as unknown as SimulationEngine;
  let wake: (() => void) | undefined;
  const schedule = vi.fn((at: number, fn: () => void) => {
    wake = fn;
  });
  const scheduler: Scheduler = {
    environment: "foreground",
    now: () => 1000,
    schedule,
    cancel: () => {
      wake = undefined;
    },
  };
  let view: SyncView | undefined;
  const coordinator = new GoogleSyncCoordinator(
    host,
    storage,
    google,
    newBinding("s", "doc"),
    (value) => {
      view = value;
    },
    scheduler,
  );
  await coordinator.initialize();
  listener();
  expect(schedule.mock.calls[0][0]).toBe(31_000);
  expect(google.request.mock.calls.some(([action]) => action === "batch")).toBe(
    false,
  );
  host.pause();
  expect(wake).toBeUndefined();
  snapshot = { ...snapshot, status: "running" };
  listener();
  wake!();
  await vi.waitFor(() =>
    expect(loadBinding(storage, "s")?.confirmedText).toBe(plan.source),
  );
  expect(checkpoint).toHaveBeenCalled();
  expect(view?.status).not.toContain("Complete");
  snapshot = { ...snapshot, status: "completed" };
  listener();
  await vi.waitFor(() =>
    expect(view?.status).toBe("Complete · exact match verified"),
  );
  expect(loadBinding(storage, "s")?.complete).toBe(true);
  coordinator.dispose();
});

it("explains final whitespace, punctuation, missing/extra content and paragraph-order mismatches without text excerpts", () => {
  expect(compareFinalText("a ", "a").explanation).toContain("Whitespace");
  expect(compareFinalText("a!", "a.").explanation).toContain("Punctuation");
  expect(compareFinalText("B\nA", "A\nB").explanation).toContain(
    "Paragraph ordering",
  );
  expect(compareFinalText("a", "abc").explanation).toContain("missing");
  expect(compareFinalText("abcabc", "abc").explanation).toContain("duplicated");
});

function checkpointHost(text: string) {
  const plan = createPlan(text, { ...DEFAULT_SETTINGS, typos: "off" }, 1);
  const snapshot = { ...IDLE_SNAPSHOT, status: "paused", text, progress: 100 };
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    getOutputProgress: () => ({
      index: plan.events.length,
      sessionId: "saved",
    }),
    getOutputCheckpoint: () => ({
      sessionId: "saved",
      index: plan.events.length,
      events: plan.events,
      target: plan.source,
      snapshot,
    }),
    checkpoint: () => {},
    pause: () => {},
  } as unknown as SimulationEngine;
}
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (n: number) => [...values.keys()][n] ?? null,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
    clear: () => values.clear(),
  } satisfies Storage;
}
it("drains a saved completed checkpoint while the writing clock stays paused", async () => {
  const google = mockGoogle();
  const host = checkpointHost("Saved 😀 checkpoint.");
  const storage = memoryStorage();
  let view: SyncView | undefined;
  const durable = vi.fn(async () => {});
  const sync = new GoogleSyncCoordinator(
    host,
    storage,
    google,
    newBinding("saved", "doc"),
    (value) => {
      view = value;
    },
    undefined,
    30_000,
    durable,
  );
  await sync.initialize();
  expect(await sync.synchronizeCheckpoint()).toBe(true);
  expect(host.getSnapshot().status).toBe("paused");
  expect(loadBinding(storage, "saved")?.complete).toBe(true);
  expect(view?.status).toBe("Complete · exact match verified");
  expect(durable.mock.calls.length).toBeGreaterThan(3);
  sync.dispose();
});
it("prevents all remote writes if the write-ahead journal cannot become durable", async () => {
  const google = mockGoogle();
  const storage = memoryStorage();
  const durable = vi.fn(async () => {});
  const sync = new GoogleSyncCoordinator(
    checkpointHost("Must not write"),
    storage,
    google,
    newBinding("saved", "doc"),
    () => {},
    undefined,
    30_000,
    durable,
  );
  await sync.initialize();
  durable
    .mockImplementationOnce(async () => {})
    .mockImplementationOnce(async () => {})
    .mockRejectedValueOnce(new Error("Disk failed"));
  await expect(sync.synchronizeCheckpoint()).rejects.toThrow("attention");
  expect(
    google.request.mock.calls.filter(([action]) => action === "batch"),
  ).toHaveLength(0);
  expect(loadBinding(storage, "saved")?.pending).toBeDefined();
  sync.dispose();
});
it("a recovered uncertain checkpoint confirms a committed write without submitting it again", async () => {
  const google = mockGoogle();
  let lost = true;
  const transport: GoogleTransport = {
    async request(action, body) {
      const result = await google.request(action, body);
      if (action === "batch" && lost) {
        lost = false;
        throw new Error("Lost acknowledgement");
      }
      return result;
    },
  };
  const storage = memoryStorage();
  const host = checkpointHost("Write this only once.");
  const first = new GoogleSyncCoordinator(
    host,
    storage,
    transport,
    newBinding("saved", "doc"),
    () => {},
  );
  await first.initialize();
  await expect(first.synchronizeCheckpoint()).rejects.toThrow();
  first.dispose();
  const restored = new GoogleSyncCoordinator(
    host,
    storage,
    transport,
    loadBinding(storage, "saved")!,
    () => {},
  );
  await restored.initialize();
  await restored.synchronizeCheckpoint();
  expect(
    google.request.mock.calls.filter(([action]) => action === "batch"),
  ).toHaveLength(1);
  expect(loadBinding(storage, "saved")?.complete).toBe(true);
  restored.dispose();
});

it("retries explicit quota rejection with bounded backoff and writes the approved text only once", async () => {
  vi.useFakeTimers();
  try {
    const google = mockGoogle();
    let attempts = 0;
    const transport: GoogleTransport = {
      async request(action, body) {
        if (action === "batch" && ++attempts < 3)
          throw new GoogleApiError("Quota", 429, 1000);
        return google.request(action, body);
      },
    };
    const adapter = new GoogleDocsOutputAdapter(transport, {
      minWriteIntervalMs: 0,
    });
    await adapter.initialize({ documentId: "doc", text: "" });
    const write = adapter.apply({ type: "insert", index: 0, text: "One copy" });
    await vi.runAllTimersAsync();
    await write;
    expect(attempts).toBe(3);
    expect(await adapter.readText()).toBe("One copy");
    expect(
      google.request.mock.calls.filter(([action]) => action === "batch"),
    ).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});
