import type { RevisionMode } from "../types";
import { diffText, type TextChange } from "./diff";

export type RevisionKind =
  | "character"
  | "word"
  | "phrase"
  | "sentence"
  | "paragraph"
  | "added"
  | "removed"
  | "reordered";
export type RevisionChange = TextChange & {
  kind: RevisionKind;
  major: boolean;
};
const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
const paragraphs = (text: string) => text.match(/[^\n]+(?:\n+|$)|\n+/gu) ?? [];
const sentenceParts = (text: string) =>
  Array.from(sentences.segment(text), (s) => s.segment);
const words = (text: string) =>
  text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
function similarity(a: string, b: string) {
  const left = words(a),
    right = words(b),
    counts = new Map<string, number>();
  for (const word of left) counts.set(word, (counts.get(word) ?? 0) + 1);
  let common = 0;
  for (const word of right) {
    const count = counts.get(word) ?? 0;
    if (count) {
      common++;
      counts.set(word, count - 1);
    }
  }
  return (2 * common) / Math.max(1, left.length + right.length);
}

/** Bounded alignment of whole passages, then sentences, then grapheme-safe edits.
 * Offsets describe the document after all preceding changes, in UTF-16 units.
 * Exact anchors preserve repeated content deterministically without an O(n²) matrix.
 */
export function planRevisions(
  before: string,
  after: string,
  mode: RevisionMode = "smart",
): RevisionChange[] {
  if (before === after) return [];
  if (mode === "full")
    return [
      {
        index: 0,
        removed: before,
        inserted: after,
        kind: "paragraph",
        major: true,
      },
    ];
  if (mode === "targeted")
    return diffText(before, after).map((c) => ({
      ...c,
      kind: "phrase",
      major: false,
    }));
  const changes: RevisionChange[] = [];
  const add = (
    old: string,
    next: string,
    index: number,
    level: "paragraph" | "sentence",
  ) => {
    if (old === next) return;
    if (!old || !next) {
      const moved = old ? after.includes(old) : before.includes(next);
      changes.push({
        index,
        removed: old,
        inserted: next,
        kind: moved ? "reordered" : old ? "removed" : "added",
        major: false,
      });
    } else if (level === "paragraph" && mode !== "paragraph") {
      const left = sentenceParts(old),
        right = sentenceParts(next);
      const unchanged = new Set(left.map((s) => s.trim()));
      const substantial =
        left.length > 1 &&
        right.length > 1 &&
        similarity(old, next) < 0.35 &&
        !right.some((s) => unchanged.has(s.trim()));
      if (substantial)
        changes.push({
          index,
          removed: old,
          inserted: next,
          kind: "paragraph",
          major: true,
        });
      else align(left, right, index, "sentence");
    } else if (
      mode === "paragraph" ||
      (words(old).length >= 4 && similarity(old, next) < 0.55)
    ) {
      changes.push({
        index,
        removed: old,
        inserted: next,
        kind: level,
        major: true,
      });
    } else {
      for (const c of diffText(old, next)) {
        const size = Math.max(
          words(c.removed).length,
          words(c.inserted).length,
        );
        changes.push({
          ...c,
          index: index + c.index,
          kind:
            size > 1
              ? "phrase"
              : Math.max(c.removed.length, c.inserted.length) <= 2
                ? "character"
                : "word",
          major: false,
        });
      }
    }
  };
  const align = (
    a: string[],
    b: string[],
    offset: number,
    level: "paragraph" | "sentence",
  ) => {
    let i = 0,
      j = 0,
      index = offset;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        index += a[i++].length;
        j++;
        continue;
      }
      let ai = Math.min(i + 64, a.length),
        bj = Math.min(j + 64, b.length),
        distance = Infinity;
      const positions = new Map<string, number>();
      for (let y = j; y < Math.min(j + 64, b.length); y++)
        if (!positions.has(b[y])) positions.set(b[y], y);
      for (let x = i; x < Math.min(i + 64, a.length); x++) {
        const y = positions.get(a[x]);
        if (y !== undefined && x - i + y - j < distance) {
          ai = x;
          bj = y;
          distance = x - i + y - j;
        }
      }
      // Pair changed units before an anchor, preserving unchanged sentences within paragraphs.
      const count = Math.min(ai - i, bj - j);
      for (let n = 0; n < count; n++) {
        add(a[i], b[j], index, level);
        index += b[j++].length;
        i++;
      }
      const old = a.slice(i, ai).join(""),
        next = b.slice(j, bj).join("");
      add(old, next, index, level);
      index += next.length;
      i = ai;
      j = bj;
    }
  };
  align(paragraphs(before), paragraphs(after), 0, "paragraph");
  let result = before;
  for (const c of changes) {
    if (result.slice(c.index, c.index + c.removed.length) !== c.removed)
      throw new Error("Revision range no longer matches the document.");
    result =
      result.slice(0, c.index) +
      c.inserted +
      result.slice(c.index + c.removed.length);
  }
  if (result !== after)
    throw new Error("Could not produce a reliable revision plan.");
  return changes;
}
