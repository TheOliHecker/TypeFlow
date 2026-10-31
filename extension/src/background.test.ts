import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SimulationEngine } from "../../src/lib/simulation/engine";
import type { SessionCheckpoint } from "../../src/lib/simulation/session";
import { DEFAULT_SETTINGS } from "../../src/lib/types";
import { newBinding } from "../../src/lib/google/sync";
import { BACKGROUND, BACKGROUND_ERROR } from "./storage";
const api = vi.hoisted(() => ({ remote: "", writes: 0 }));
vi.mock("./google", () => ({
  extensionGoogleTransport: {
    request: async (action: string, body: Record<string, unknown>) => {
      if (action === "batch") {
        for (const item of body.requests as {
          insertText?: { location: { index: number }; text: string };
        }[])
          if (item.insertText) {
            const { location, text } = item.insertText;
            api.remote =
              api.remote.slice(0, location.index - 1) +
              text +
              api.remote.slice(location.index - 1);
          }
        api.writes++;
        return {};
      }
      return {
        documentId: "doc",
        revisionId: `r${api.writes}`,
        body: {
          content: [
            {
              startIndex: 1,
              endIndex: api.remote.length + 2,
              paragraph: {
                elements: [
                  {
                    startIndex: 1,
                    endIndex: api.remote.length + 2,
                    textRun: { content: api.remote + "\n" },
                  },
                ],
              },
            },
          ],
        },
      };
    },
  },
}));
let values: Record<string, string>;
let ownerAvailable: boolean;
beforeEach(() => {
  vi.useFakeTimers();
  api.remote = "";
  api.writes = 0;
  values = {};
  ownerAvailable = true;
  const event = { addListener: vi.fn() };
  vi.stubGlobal("chrome", {
    runtime: { onInstalled: event, onStartup: event },
    alarms: { onAlarm: event, create: vi.fn() },
    storage: {
      local: {
        get: async () => ({ ...values }),
        set: async (changes: Record<string, string>) => {
          Object.assign(values, changes);
        },
        remove: async (keys: string[]) => {
          for (const key of keys) delete values[key];
        },
      },
    },
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        callback: (lock: object | null) => Promise<void>,
      ) => callback(ownerAvailable ? {} : null),
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function seed() {
  let saved!: SessionCheckpoint;
  const engine = new SimulationEngine();
  engine.setCheckpointWriter((s) => {
    saved = structuredClone(s);
  });
  engine.start("This writing has not finished yet.", {
    ...DEFAULT_SETTINGS,
    wpm: 300,
    pauses: "off",
    typos: "off",
    variation: false,
  });
  await vi.advanceTimersByTimeAsync(240);
  engine.pause();
  engine.dispose();
  values[`typeflow-checkpoint-v1:${saved.id}`] = JSON.stringify(saved);
  values[`typeflow-google-v1:${saved.id}`] = JSON.stringify(
    newBinding(saved.id, "doc"),
  );
  values[BACKGROUND] = saved.id;
  return saved;
}
it("an alarm drains saved progress without generating any new writing", async () => {
  const saved = await seed();
  const { synchronizeSavedCheckpoint } = await import("./background");
  await synchronizeSavedCheckpoint();
  expect(api.remote).toBe(saved.snapshot.text);
  expect(api.remote).not.toBe(saved.plan.source);
  expect(api.writes).toBe(1);
  expect(values[BACKGROUND]).toBeUndefined();
  expect(
    JSON.parse(values[`typeflow-checkpoint-v1:${saved.id}`]).operationIndex,
  ).toBe(saved.operationIndex);
});
it("does not compete with an open side panel for synchronization ownership", async () => {
  await seed();
  ownerAvailable = false;
  const { synchronizeSavedCheckpoint } = await import("./background");
  await synchronizeSavedCheckpoint();
  expect(api.writes).toBe(0);
  expect(values[BACKGROUND]).toBeDefined();
});
it("preserves conflicting remote content and requires user attention", async () => {
  await seed();
  api.remote = "External collaborator writing";
  const { synchronizeSavedCheckpoint } = await import("./background");
  await synchronizeSavedCheckpoint();
  expect(api.writes).toBe(0);
  expect(api.remote).toBe("External collaborator writing");
  expect(values[BACKGROUND]).toBeUndefined();
  expect(values[BACKGROUND_ERROR]).toContain("outside TypeFlow");
});
