import type { ProofreadingSettings } from "../types";
import { SPELLING_CORRECTIONS } from "./typos";
export type Suggestion = {
  id: string;
  index: number;
  before: string;
  after: string;
  category: "spelling" | "grammar" | "punctuation" | "style";
  reason: string;
};
/** Future assistance providers can return the same explicit, approval-required suggestions. */
export interface ProofreadingProvider {
  suggest(
    text: string,
    settings: ProofreadingSettings,
  ): Suggestion[] | Promise<Suggestion[]>;
}
export function suggestProofreading(
  text: string,
  settings: ProofreadingSettings,
): Suggestion[] {
  if (!settings.enabled) return [];
  const suggestions: Suggestion[] = [];
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  const fingerprint = `${text.length}:${hash >>> 0}`;
  const scan = (
    pattern: RegExp,
    category: Suggestion["category"],
    replacement: (s: string) => string,
    reason: string,
  ) => {
    if (!settings[category]) return;
    for (const match of text.matchAll(pattern)) {
      const index = match.index,
        before = match[0],
        after = replacement(before);
      if (
        before === after ||
        suggestions.some(
          (s) =>
            index < s.index + s.before.length &&
            index + before.length > s.index,
        )
      )
        continue;
      suggestions.push({
        id: JSON.stringify([fingerprint, index, before, after]),
        index,
        before,
        after,
        category,
        reason,
      });
    }
  };
  scan(
    /\b(?:teh|thier|recieve|becuase|seperate|definately|graet|writting|beleive|freind)\b/gi,
    "spelling",
    (s) => {
      const fixed = SPELLING_CORRECTIONS[s.toLowerCase()];
      return /^[A-Z]/.test(s) ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
    },
    "Common spelling slip",
  );
  scan(
    /\b([\p{L}]+)(\s+)\1\b/giu,
    "grammar",
    (s) => s.split(/\s/u)[0],
    "Possible repeated word",
  );
  scan(/\bi\b/g, "grammar", () => "I", "Capitalize the pronoun");
  scan(
    / +[,.!?;:]/g,
    "punctuation",
    (s) => s.trimStart(),
    "Remove space before punctuation",
  );
  scan(
    /\b(?:in order to|due to the fact that|at this point in time)\b/gi,
    "style",
    (s) =>
      ({
        "in order to": "to",
        "due to the fact that": "because",
        "at this point in time": "now",
      })[s.toLowerCase()]!,
    "Consider a shorter expression",
  );
  return suggestions.sort((a, b) => a.index - b.index);
}
export function approvedText(text: string, settings: ProofreadingSettings) {
  for (const suggestion of suggestProofreading(text, settings).reverse()) {
    if (settings.approvedIds.includes(suggestion.id))
      text =
        text.slice(0, suggestion.index) +
        suggestion.after +
        text.slice(suggestion.index + suggestion.before.length);
  }
  return text;
}
