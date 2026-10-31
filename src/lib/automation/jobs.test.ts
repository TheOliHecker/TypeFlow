import { expect, it } from "vitest";
import { placementPlan, scheduleJob, wakeDecision } from "./jobs";
import { applyOperation } from "../simulation/operations";
const w = (text: string, start = 10000, end = 610000) => ({
  name: "Draft",
  text,
  start,
  end,
  wpm: 45,
  pauseSeconds: 5,
});
it("places multiple answers bottom-up, preserves surrounding content and same-index order", () => {
  const initial = "Question 1\n\nQuestion 2\n";
  const p = placementPlan(initial, [
    { id: "a", name: "First", text: "Answer 🧑🏽‍💻\n", index: 11 },
    { id: "b", name: "Second", text: "Oui — café.\n", index: initial.length },
    { id: "c", name: "Third", text: "More\n", index: 11 },
  ]);
  expect(p.text).toBe(
    "Question 1\nAnswer 🧑🏽‍💻\nMore\n\nQuestion 2\nOui — café.\n",
  );
  expect(p.operations.reduce(applyOperation, initial)).toBe(p.text);
});
it("rejects duplicate blocks, stale positions and surrogate splits", () => {
  const b = { id: "a", name: "A", text: "X", index: 1 };
  expect(() => placementPlan("ab", [b, b])).toThrow();
  expect(() => placementPlan("", [b])).toThrow();
  expect(() => placementPlan("😀", [b])).toThrow();
});
it("revises existing stage content in place during a separate window", () => {
  const job = scheduleJob(
    "doc",
    "Title",
    "",
    [w("First draft."), w("Final draft.", 700000, 1300000)],
    0,
  );
  let text = "";
  const states: string[] = [];
  for (const c of job.checkpoints) {
    text = applyOperation(text, c.operation);
    states.push(text);
  }
  expect(text).toBe("Final draft.");
  expect(states).not.toContain("First draft.Final draft.");
  expect(job.checkpoints.some((c) => c.operation.type === "replace")).toBe(
    true,
  );
  expect(wakeDecision(job, job.checkpoints[0].at - 1)).toBe("wait");
  expect(wakeDecision(job, job.checkpoints[0].at + 91000)).toBe("missed");
});
it("validates overlaps, pace and impossible windows", () => {
  expect(() =>
    scheduleJob("doc", "", "", [w("Hello", 10000, 11000)], 0),
  ).toThrow(/needs at least/);
  expect(() => scheduleJob("doc", "", "", [w("Hello"), w("Bye")], 0)).toThrow(
    /non-overlapping/,
  );
  expect(() =>
    scheduleJob("doc", "", "", [{ ...w("Hello"), wpm: NaN }], 0),
  ).toThrow();
});
it("does not run paused, cancelled, completed or delayed work", () => {
  const job = scheduleJob("doc", "", "", [w("Hello")], 0);
  for (const status of [
    "paused",
    "cancelled",
    "complete",
    "attention",
  ] as const)
    expect(wakeDecision({ ...job, status }, 10000)).toBe("wait");
  expect(
    wakeDecision({ ...job, status: "running", lastWake: 10000 }, 120000),
  ).toBe("missed");
});

it("allows intentionally spaced checkpoints and keeps absolute instants through DST", () => {
  const job = scheduleJob(
    "doc",
    "",
    "",
    [
      w(
        "One.\nTwo.",
        Date.parse("2026-11-01T01:00:00-04:00"),
        Date.parse("2026-11-01T02:00:00-05:00"),
      ),
    ],
    0,
  );
  expect(job.stages[0].end - job.stages[0].start).toBe(7200000);
  const later = job.checkpoints[1].at;
  expect(
    wakeDecision(
      { ...job, status: "running", cursor: 1, lastWake: job.checkpoints[0].at },
      later,
    ),
  ).toBe("run");
});
