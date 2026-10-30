import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANCED, DEFAULT_SETTINGS } from "../types";
import { applyEvent } from "./engine";
import { createPlan } from "./plan";
import { planRevisions } from "./revisions";
import { applyOperation } from "./operations";
const settings = {
  ...DEFAULT_SETTINGS,
  wpm: 300,
  pauses: "off" as const,
  typos: "off" as const,
  variation: false,
};
const rewrite = (before: string, after: string, behavior = "insert-first") =>
  createPlan(before, settings, undefined, {
    finalText: after,
    finalSettings: {
      ...settings,
      advanced: {
        ...DEFAULT_ADVANCED,
        majorRewrite: behavior as typeof DEFAULT_ADVANCED.majorRewrite,
      },
    },
  });
describe("Core Engine 3.0 revisions", () => {
  it("makes the smallest spelling correction and preserves adjacent sentences", () => {
    const changes = planRevisions(
      "Keep this. A gret idea. Keep that.",
      "Keep this. A great idea. Keep that.",
    );
    expect(changes).toEqual([
      {
        index: 16,
        removed: "",
        inserted: "a",
        kind: "character",
        major: false,
      },
    ]);
  });
  it("groups a substantial sentence rewrite and supports all three behaviors", () => {
    const old = "The old approach takes too much time. ",
      next = "Our new design offers a completely different solution. ";
    const before = "Keep this. " + old + "Keep that.",
      after = "Keep this. " + next + "Keep that.";
    expect(planRevisions(before, after)).toEqual([
      {
        index: 11,
        removed: old,
        inserted: next,
        kind: "sentence",
        major: true,
      },
    ]);
    for (const behavior of ["insert-first", "delete-first", "replace"]) {
      const plan = rewrite(before, after, behavior);
      expect(plan.events.reduce(applyEvent, "")).toBe(after);
      const revision = plan.events.filter((e) => e.stage === "revision");
      if (behavior === "replace")
        expect(revision.some((e) => e.type === "replace")).toBe(true);
      else {
        const first = revision.find(
          (e) => e.type === "insert" || e.type === "delete",
        )!;
        expect(first.type).toBe(
          behavior === "insert-first" ? "insert" : "delete",
        );
      }
    }
  });
  it("renders the replacement progressively beside the original, then leaves one replacement", () => {
    const old = "A slow process wastes our effort.",
      next = "Modern tools bring fresh possibilities to everyone.";
    const plan = rewrite(old, next);
    let text = "",
      coexisted = false;
    for (const event of plan.events) {
      text = applyEvent(text, event);
      if (text === old + next) coexisted = true;
      if (event.stage === "revision" && event.type === "insert")
        expect(Array.from(event.text!).length).toBe(1);
    }
    expect(coexisted).toBe(true);
    expect(text).toBe(next);
  });
  it("preserves exact targets across paragraphs, reorderings, empty drafts and Unicode", () => {
    const pairs = [
      ["One.\n\nRemove this.\n\nLast.", "One.\n\nLast.\n\nAdded."],
      ["Same. Same. Other.", "Other. Same. Same."],
      [
        "Dr. Smith said, “Hi.”\n- café 👩🏽‍💻\n- e\u0301",
        "Dr. Smith said, “Hello!”\n\n- e\u0301\n- café 👩🏽‍💻",
      ],
      [" a  b\n\n c ", " a b\n c  "],
      ["", "Added 🌿."],
      ["Remove all.", ""],
      ["", ""],
      [
        "First paragraph.\n\nSecond paragraph.",
        "First paragraph. Second paragraph.",
      ],
    ];
    for (const [before, after] of pairs)
      for (const mode of ["smart", "targeted", "paragraph", "full"] as const) {
        const plan = createPlan(before, settings, undefined, {
          finalText: after,
          revisionMode: mode,
        });
        expect(plan.events.reduce(applyEvent, "")).toBe(after);
        expect(plan.events.at(-1)?.type).toBe("verify");
      }
    expect(createPlan("abcde", settings).durationMs).toBeCloseTo(200);
  });
  it("rejects stale ranges, split surrogate pairs and incorrect final content", () => {
    expect(() =>
      applyOperation("hello", { type: "delete", index: 0, expected: "other" }),
    ).toThrow(/Stale/);
    expect(() =>
      applyOperation("🌿", { type: "insert", index: 1, text: "x" }),
    ).toThrow(/UTF-16/);
    expect(() =>
      applyOperation("wrong", { type: "verify", expected: "approved" }),
    ).toThrow(/verification/);
  });
});
