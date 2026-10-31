import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  placementJob,
  scheduleJob,
  JOB_KEY,
} from "../../src/lib/automation/jobs";
const api = vi.hoisted(() => ({
  text: "",
  revision: 0,
  fail: 0,
  writes: 0,
  loseAck: false,
}));
vi.mock("./google", () => ({
  extensionGoogleTransport: {
    request: async (action: string, body: Record<string, unknown>) => {
      if (api.fail) throw new Error("Authentication or API error");
      if (action === "batch") {
        expect(body.revision).toBe(`r${api.revision}`);
        for (const req of body.requests as {
          insertText?: { text: string; location: { index: number } };
          deleteContentRange?: {
            range: { startIndex: number; endIndex: number };
          };
        }[]) {
          if (req.deleteContentRange) {
            const r = req.deleteContentRange.range;
            api.text =
              api.text.slice(0, r.startIndex - 1) +
              api.text.slice(r.endIndex - 1);
          }
          if (req.insertText) {
            const { text, location } = req.insertText;
            api.text =
              api.text.slice(0, location.index - 1) +
              text +
              api.text.slice(location.index - 1);
          }
        }
        api.writes++;
        api.revision++;
        if (api.loseAck) {
          api.loseAck = false;
          throw new Error("Network outcome uncertain");
        }
        return {};
      }
      return {
        documentId: "doc",
        revisionId: `r${api.revision}`,
        body: {
          content: [
            {
              startIndex: 1,
              endIndex: api.text.length + 2,
              paragraph: {
                elements: [
                  {
                    startIndex: 1,
                    endIndex: api.text.length + 2,
                    textRun: { content: api.text + "\n" },
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
import {
  tickJob,
  readJob,
  saveJob,
  controlJob,
  interruptRunningJob,
} from "./jobs";
let values: Record<string, string>;
beforeEach(() => {
  values = {};
  api.text = "Question\n";
  api.revision = 0;
  api.fail = 0;
  api.writes = 0;
  api.loseAck = false;
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (k: string) => ({ [k]: values[k] }),
        set: async (v: Record<string, string>) => Object.assign(values, v),
      },
    },
    action: { setBadgeText: vi.fn() },
    runtime: { sendMessage: async () => true },
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        _k: string,
        opts: unknown,
        fn?: (lock: object) => unknown,
      ) => (fn ? fn({}) : (opts as () => unknown)()),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
async function seed() {
  const j = placementJob(
    "doc",
    "Answers",
    api.text,
    [{ id: "a", name: "Answer", text: "Answer\n", index: 9 }],
    10000,
  );
  await saveJob(j);
  return j;
}
it("persists confirmed checkpoints, survives worker recreation, prevents duplicates and verifies final content", async () => {
  await seed();
  await tickJob(10000);
  expect(api.text).toBe("Question\nAnswer\n");
  expect((await readJob())?.cursor).toBe(1);
  await tickJob(10000);
  expect(api.writes).toBe(1);
  await tickJob(40000);
  expect((await readJob())?.status).toBe("complete");
  expect(api.writes).toBe(1);
});
it("protects collaborator changes, then requires attention without overwriting", async () => {
  await seed();
  api.text = "Other writer";
  await tickJob(10000);
  expect((await readJob())?.status).toBe("attention");
  expect(api.writes).toBe(0);
});
it("missed alarms and sleep/wake never compress pending work", async () => {
  await seed();
  await tickJob(200000);
  expect((await readJob())?.status).toBe("missed");
  expect(api.writes).toBe(0);
});
it("auth failure persists attention and does not endlessly retry", async () => {
  await seed();
  api.fail = 401;
  await tickJob(10000);
  expect((await readJob())?.status).toBe("attention");
  api.fail = 0;
  await tickJob(40000);
  expect(api.writes).toBe(0);
});
it("pause and emergency cancellation prevent later writes", async () => {
  await seed();
  await controlJob("pause");
  await tickJob(10000);
  expect(api.writes).toBe(0);
  await controlJob("cancel");
  expect(JSON.parse(values[JOB_KEY]).status).toBe("cancelled");
});

it("reconciles a committed write after a lost acknowledgement without duplication", async () => {
  const job = await seed();
  api.loseAck = true;
  await tickJob(10000);
  expect((await readJob())?.status).toBe("attention");
  expect(api.writes).toBe(1);
  const start = Date.now() + 300000;
  await controlJob("resume", start, start + 300000);
  await tickJob(start);
  expect((await readJob())?.cursor).toBe(1);
  expect(api.writes).toBe(1);
  expect(api.text).toBe("Question\nAnswer\n");
  expect(job.cursor).toBe(0);
});

it("browser startup requires review of running work before any later checkpoint", async () => {
  await seed();
  await tickJob(10000);
  await interruptRunningJob();
  expect((await readJob())?.status).toBe("interrupted");
  await tickJob(40000);
  expect(api.writes).toBe(1);
});

it("executes separate draft windows with a preserved break and in-place final revision", async () => {
  api.text = "";
  const stage = (name: string, text: string, start: number, end: number) => ({
    name,
    text,
    start,
    end,
    wpm: 45,
    pauseSeconds: 5,
  });
  const job = scheduleJob(
    "doc",
    "Two windows",
    "",
    [
      stage("First", "Draft one.", 10000, 200000),
      stage("Second", "Final copy.", 300000, 600000),
    ],
    0,
  );
  await saveJob(job);
  await tickJob(job.checkpoints[0].at);
  await tickJob(job.checkpoints[1].at);
  expect(api.text).toBe("Draft one.");
  await tickJob(250000);
  expect(api.text).toBe("Draft one.");
  for (const checkpoint of job.checkpoints.slice(2))
    await tickJob(checkpoint.at);
  expect(api.text).toBe("Final copy.");
  expect((await readJob())?.status).toBe("complete");
  expect(api.writes).toBe(
    job.checkpoints.filter((c) => c.operation.type !== "verify").length,
  );
});
