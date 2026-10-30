import { describe, expect, it } from "vitest";
import { validateDraft } from "./use-draft";
import { completedWordCount, MAX_TEXT_LENGTH } from "./types";
import { safeFilename } from "./export";
describe("draft validation", () => {
  it("restores safe defaults from corrupt or outdated preferences", () => {
    const draft = validateDraft({
      title: 5,
      text: null,
      settings: {
        wpm: Infinity,
        pauses: "constructor",
        typos: false,
        durationSeconds: -10,
      },
    });
    expect(draft.settings.wpm).toBe(45);
    expect(draft.settings.pauses).toBe("medium");
    expect(draft.settings.typos).toBe("low");
    expect(draft.settings.durationSeconds).toBeNull();
    expect(typeof draft.title).toBe("string");
    expect(() => validateDraft(null)).not.toThrow();
  });
  it("caps text/title lengths and normalizes newlines", () => {
    expect(
      validateDraft({ title: "a".repeat(500), text: "a".repeat(200000) }).text
        .length,
    ).toBe(MAX_TEXT_LENGTH);
    expect(validateDraft({ title: "a".repeat(500) }).title.length).toBe(120);
    expect(validateDraft({ text: "a\r\nb" }).text).toBe("a\nb");
  });
  it("counts completed words without counting an incomplete last word", () => {
    expect(completedWordCount("Hello world", 3)).toBe(0);
    expect(completedWordCount("Hello world", 6)).toBe(1);
    expect(completedWordCount("Hello world", 11)).toBe(2);
  });
  it("produces safe download filenames", () => {
    expect(safeFilename("../a:b/c?")).toBe("..abc");
    expect(safeFilename("   ")).toBe("typeflow-document");
    expect(safeFilename("hello\u0000.txt")).toBe("hello.txt");
  });
});
