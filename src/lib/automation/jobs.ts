import { planRevisions } from "../simulation/revisions";
import {
  applyOperation,
  type EditingOperation,
} from "../simulation/operations";
import { MAX_TEXT_LENGTH } from "../types";

export type Block = { id: string; name: string; text: string; index: number };
export type Checkpoint = {
  operation: EditingOperation;
  at: number;
  minimumMs?: number;
};
export type WindowStage = {
  name: string;
  text: string;
  start: number;
  end: number;
  pauseSeconds: number;
  wpm: number;
};
export type Job = {
  id: string;
  documentId: string;
  title: string;
  timezone: string;
  status:
    | "scheduled"
    | "running"
    | "paused"
    | "interrupted"
    | "missed"
    | "attention"
    | "complete"
    | "cancelled";
  initial: string;
  expected: string;
  target: string;
  checkpoints: Checkpoint[];
  stages: { name: string; start: number; end: number; through: number }[];
  cursor: number;
  lastWake?: number;
  message?: string;
};
export const JOB_KEY = "typeflow-automation-v1";
export const JOB_LOCK = "typeflow-automation-lock-v1";
export function placementPlan(before: string, blocks: Block[]) {
  if (!blocks.length || blocks.length > 62)
    throw new Error("Use 1–62 named blocks.");
  const ids = new Set<string>();
  let text = before;
  const operations: EditingOperation[] = [];
  // Work from the bottom up so earlier document positions remain stable.
  // Same-position blocks retain the user's order in the final document.
  const ordered = blocks
    .map((b, order) => ({ ...b, order }))
    .sort((a, b) => b.index - a.index || b.order - a.order);
  for (const b of ordered) {
    if (
      !b.id ||
      ids.has(b.id) ||
      !b.name.trim() ||
      !b.text ||
      b.text.length > MAX_TEXT_LENGTH
    )
      throw new Error(
        "Each block needs a unique ID, name and text (up to 100,000 characters).",
      );
    ids.add(b.id);
    const op: EditingOperation = {
      type: "insert",
      index: b.index,
      text: b.text,
    };
    // Validate against the original too, so one block cannot target another block.
    applyOperation(before, op);
    text = applyOperation(text, op);
    operations.push(op);
  }
  return { operations, text };
}
export function scheduleJob(
  documentId: string,
  title: string,
  initial: string,
  windows: WindowStage[],
  now = Date.now(),
): Job {
  if (!documentId || !windows.length || windows.length > 12)
    throw new Error("Select a document and 1–12 stages.");
  let before = initial,
    previousEnd = now;
  const checkpoints: Checkpoint[] = [],
    stages: Job["stages"] = [];
  for (const w of windows) {
    if (
      !w.name.trim() ||
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.start < previousEnd ||
      w.end <= w.start ||
      !Number.isFinite(w.pauseSeconds) ||
      w.pauseSeconds < 0 ||
      w.pauseSeconds > 3600 ||
      !Number.isFinite(w.wpm) ||
      w.wpm < 20 ||
      w.wpm > 300 ||
      w.text.length > MAX_TEXT_LENGTH
    )
      throw new Error(
        "Stages need valid future, non-overlapping windows, 20–300 WPM and pauses of 0–3600 seconds.",
      );
    const edits: EditingOperation[] = before
      ? planRevisions(before, w.text).map((c) => ({
          type: "replace",
          index: c.index,
          expected: c.removed,
          text: c.inserted,
        }))
      : [];
    if (!before) {
      let index = 0;
      for (const text of w.text.match(/[^\n]+\n*|\n+/gu) ?? []) {
        edits.push({ type: "insert", index, text });
        index += text.length;
      }
    }
    // Checkpoint pacing is deliberately coarse and quota-friendly, never simulated keystrokes.
    const costs = edits.map((op) =>
      Math.max(
        30_000,
        (("text" in op ? op.text.length : 0) / 5 / w.wpm) * 60_000 +
          w.pauseSeconds * 1000,
      ),
    );
    const minimum = costs.reduce((a, b) => a + b, 0) + 30_000;
    if (w.end - w.start < minimum)
      throw new Error(
        `“${w.name}” needs at least ${Math.ceil(minimum / 60000)} minutes for verified checkpoints and pacing.`,
      );
    let at = w.start;
    const slack = (w.end - w.start - minimum) / Math.max(1, edits.length);
    for (let i = 0; i < edits.length; i++) {
      checkpoints.push({ operation: edits[i], at, minimumMs: costs[i] });
      at += costs[i] + slack;
    }
    checkpoints.push({
      operation: { type: "verify", expected: w.text },
      minimumMs: 30_000,
      at: Math.max(at, w.start),
    });
    stages.push({
      name: w.name,
      start: w.start,
      end: w.end,
      through: checkpoints.length,
    });
    before = w.text;
    previousEnd = w.end;
  }
  return {
    id: crypto.randomUUID(),
    documentId,
    title,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: "scheduled",
    initial,
    expected: initial,
    target: before,
    checkpoints,
    stages,
    cursor: 0,
  };
}
export function placementJob(
  documentId: string,
  title: string,
  initial: string,
  blocks: Block[],
  now = Date.now(),
): Job {
  const plan = placementPlan(initial, blocks);
  const checkpoints = plan.operations.map((operation, i) => ({
    operation,
    at: now + i * 30_000,
  }));
  checkpoints.push({
    operation: { type: "verify", expected: plan.text },
    at: now + plan.operations.length * 30_000,
  });
  return {
    id: crypto.randomUUID(),
    documentId,
    title,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: "scheduled",
    initial,
    expected: initial,
    target: plan.text,
    checkpoints,
    stages: [
      {
        name: "Multi-Block",
        start: now,
        end: now + checkpoints.length * 30_000 + 90_000,
        through: checkpoints.length,
      },
    ],
    cursor: 0,
  };
}
/** No catch-up loop: one due checkpoint per wake, and delayed work requires review. */
export function wakeDecision(
  job: Job,
  now: number,
): "wait" | "run" | "missed" | "interrupted" {
  if (
    !["scheduled", "running"].includes(job.status) ||
    !job.checkpoints[job.cursor]
  )
    return "wait";
  const next = job.checkpoints[job.cursor];
  if (now < next.at) return "wait";
  const stage = job.stages.find((s) => job.cursor < s.through)!;
  if (now > stage.end || now - next.at > 90_000) return "missed";
  return "run";
}
