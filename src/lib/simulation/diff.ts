import type { RevisionMode } from "../types";

export type TextChange = { index: number; removed: string; inserted: string };
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const characters = (text: string) =>
  Array.from(graphemes.segment(text), (s) => s.segment);

/** Sequential UTF-16 edits. Bounded token lookahead avoids quadratic document matrices. */
export function diffText(
  before: string,
  after: string,
  mode: RevisionMode = "targeted",
): TextChange[] {
  if (before === after) return [];
  if (mode === "full") return [{ index: 0, removed: before, inserted: after }];
  const tokenize = (s: string): string[] => {
    if (mode === "paragraph")
      return s.match(/[^\n]*(?:\n+|$)/gu)?.filter(Boolean) ?? [];
    const tokens: string[] = [];
    let previous = "";
    for (const char of characters(s)) {
      const kind = /^[\p{L}\p{N}\p{M}]+$/u.test(char)
        ? "word"
        : /^\s+$/u.test(char)
          ? "space"
          : "symbol";
      if (kind !== "symbol" && kind === previous)
        tokens[tokens.length - 1] += char;
      else tokens.push(char);
      previous = kind;
    }
    return tokens;
  };
  const a = tokenize(before),
    b = tokenize(after);
  const changes: TextChange[] = [];
  let i = 0,
    j = 0,
    index = 0;
  const add = (removed: string, inserted: string) => {
    if (mode === "targeted") {
      const left = characters(removed),
        right = characters(inserted);
      let prefix = 0,
        suffix = 0;
      while (
        prefix < left.length &&
        prefix < right.length &&
        left[prefix] === right[prefix]
      )
        prefix++;
      while (
        suffix < left.length - prefix &&
        suffix < right.length - prefix &&
        left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
      )
        suffix++;
      const leading = left.slice(0, prefix).join("");
      changes.push({
        index: index + leading.length,
        removed: left.slice(prefix, left.length - suffix).join(""),
        inserted: right.slice(prefix, right.length - suffix).join(""),
      });
    } else changes.push({ index, removed, inserted });
    index += inserted.length;
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      index += a[i++].length;
      j++;
      continue;
    }
    let ai = a.length,
      bj = b.length,
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
    // No nearby anchor: advance a bounded chunk and keep searching later text.
    if (distance === Infinity) {
      ai = Math.min(i + 64, a.length);
      bj = Math.min(j + 64, b.length);
    }
    add(a.slice(i, ai).join(""), b.slice(j, bj).join(""));
    i = ai;
    j = bj;
  }
  return changes.filter((c) => c.removed !== c.inserted);
}
