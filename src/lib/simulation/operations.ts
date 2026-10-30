/** All positions are current-document UTF-16 offsets (compatible with Docs).
 * Segmentation is separate: typing emits whole graphemes, never half an emoji.
 * Adapters must reject a stale expected range rather than guessing its location.
 */
export type EditingOperation =
  | { type: "insert"; index: number; text: string }
  | { type: "delete"; index: number; expected: string }
  | { type: "replace"; index: number; expected: string; text: string }
  | { type: "move"; index: number }
  | { type: "select"; index: number; end: number; expected: string }
  | { type: "pause"; durationMs: number }
  | { type: "stage"; stage: "draft" | "revision" | "proofreading" }
  | { type: "verify"; expected: string };
export interface OutputAdapter {
  readText(): Promise<string>;
  apply(operation: EditingOperation): Promise<void>;
}
export function applyOperation(text: string, op: EditingOperation): string {
  if (op.type === "verify") {
    if (text !== op.expected)
      throw new Error(
        "Document verification failed: content differs from the approved target.",
      );
    return text;
  }
  if (!("index" in op)) return text;
  const end =
    op.type === "select"
      ? op.end
      : op.index + ("expected" in op ? op.expected.length : 0);
  const boundary = (n: number) =>
    Number.isInteger(n) &&
    n >= 0 &&
    n <= text.length &&
    !(
      n > 0 &&
      /[\uD800-\uDBFF]/u.test(text[n - 1]) &&
      /[\uDC00-\uDFFF]/u.test(text[n] ?? "")
    );
  if (!boundary(op.index) || !boundary(end) || end < op.index)
    throw new Error("Invalid UTF-16 editing range.");
  if ("expected" in op && text.slice(op.index, end) !== op.expected)
    throw new Error("Stale editing range: expected content does not match.");
  if (op.type === "move" || op.type === "select") return text;
  return (
    text.slice(0, op.index) +
    (op.type === "delete" ? "" : op.text) +
    text.slice(end)
  );
}
export class MemoryAdapter implements OutputAdapter {
  constructor(private text = "") {}
  async readText() {
    return this.text;
  }
  async apply(operation: EditingOperation) {
    this.text = applyOperation(this.text, operation);
  }
}

/** Bridge the portable schedule to adapters. The caller owns elapsed-time scheduling. */
export function eventOperation(
  event: import("./plan").PlanEvent,
  pauseMs = 0,
): EditingOperation {
  switch (event.type) {
    case "insert":
      return { type: "insert", index: event.index!, text: event.text ?? "" };
    case "delete":
      return {
        type: "delete",
        index: event.index!,
        expected: event.expected ?? event.text ?? "",
      };
    case "replace":
      return {
        type: "replace",
        index: event.index!,
        expected: event.expected!,
        text: event.text ?? "",
      };
    case "verify":
      return { type: "verify", expected: event.expected! };
    case "stage":
      return { type: "stage", stage: event.stage! };
    case "thinking":
      return { type: "pause", durationMs: pauseMs };
  }
}
