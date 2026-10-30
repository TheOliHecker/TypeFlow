import { afterEach, expect, it, vi } from "vitest";
import {
  DEFAULT_LAB,
  SyncLab,
  csvReport,
  due,
  publicReport,
  validateConfig,
} from "./lab";
import { exerciseFailure } from "./failures";
function storage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("validates scheduling bounds without inventing catch-up slots", () => {
  expect(due(4999, 5000, 120000)).toBe(false);
  expect(due(120000, 150000, 120000)).toBe(true);
  expect(() => validateConfig({ ...DEFAULT_LAB, intervals: [5, 5] })).toThrow();
  expect(() =>
    validateConfig({ ...DEFAULT_LAB, intervals: [5, 10, 15], minutes: 10 }),
  ).toThrow();
});
it("runs actual-time phase transitions through the real adapter and blocks new writes on emergency stop", async () => {
  vi.useFakeTimers({
    toFake: ["Date", "performance", "setTimeout", "clearTimeout"],
  });
  const docs = new Map<string, string>();
  let revision = 1;
  let batches = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const action = url.split("/").at(-1),
        b = JSON.parse(String(init.body));
      let result: unknown = {};
      if (action === "create") {
        const id = `doc${docs.size}`;
        docs.set(id, "");
        result = { documentId: id };
      }
      if (action === "batch") {
        batches++;
        for (const req of b.requests) {
          if (req.insertText) {
            const old = docs.get(b.documentId)!;
            const at = req.insertText.location.index - 1;
            docs.set(
              b.documentId,
              old.slice(0, at) + req.insertText.text + old.slice(at),
            );
          }
        }
        revision++;
      }
      if (action === "read") {
        const text = docs.get(b.documentId)! + "\n";
        result = {
          documentId: b.documentId,
          revisionId: String(revision),
          body: {
            content: [
              {
                startIndex: 1,
                endIndex: 1 + text.length,
                paragraph: {
                  elements: [
                    {
                      startIndex: 1,
                      endIndex: 1 + text.length,
                      textRun: { content: text },
                    },
                  ],
                },
              },
            ],
          },
        };
      }
      return Response.json(result);
    }),
  );
  const checkpointStorage = storage();
  const lab = new SyncLab(
    { ...DEFAULT_LAB, intervals: [60, 120], minutes: 2, wpm: 20 },
    checkpointStorage,
    () => {},
  );
  await lab.start();
  await lab.tick();
  for (let i = 0; i < 24; i++) {
    vi.advanceTimersByTime(5000);
    await lab.tick();
  }
  expect(lab.report.phase).toBe(1);
  expect(lab.report.phases[0].verification?.match).toBe(true);
  vi.advanceTimersByTime(2500);
  await lab.tick();
  const first = docs.get("doc0")!;
  expect(first).toContain("Automated Test 1");
  expect(first).toContain("Automated Test 2");
  expect(docs.size).toBe(1);
  const before = batches;
  await lab.control("emergency");
  vi.advanceTimersByTime(120000);
  await lab.tick();
  expect(batches).toBe(before);
  expect(lab.report.status).toBe("stopped");
  expect(SyncLab.restore(checkpointStorage, () => {})?.report.status).toBe(
    "stopped",
  );
  Object.assign(lab.report.config, { accessToken: "DO_NOT_EXPORT_TOKEN" });
  lab.report.phases[0].observation = {
    visible: 2,
    expanded: 3,
    grouped: true,
    timestamps: "private-credential-string",
    notes: "DO_NOT_EXPORT_PRIVATE_NOTES",
  };
  const json = JSON.stringify(publicReport(lab.report));
  expect(json).not.toContain("DO_NOT_EXPORT");
  expect(json).not.toContain("private-credential-string");
  expect(csvReport(lab.report)).not.toContain("DO_NOT_EXPORT");
  expect(json).not.toContain("changing contours");
  expect(json).not.toContain("confirmedText");
  expect(csvReport(lab.report)).toContain("requests_per_observed_version");
});
it("reconciles uncertain local outcomes and refuses concurrent changes", async () => {
  expect(
    (await exerciseFailure("Uncertain write outcome")).reconciliation,
  ).toBe("confirmed");
  expect(
    (await exerciseFailure("Concurrent changes")).reconciliation,
  ).toContain("Conflict");
});
