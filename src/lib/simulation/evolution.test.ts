import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADVANCED,
  DEFAULT_PROOFREADING,
  DEFAULT_SETTINGS,
  TYPO_CATEGORIES,
  type CorrectionTiming,
  type RevisionMode,
  type SimulationSettings,
} from "../types";
import { diffText } from "./diff";
import { applyEvent } from "./engine";
import { createPlan } from "./plan";
import { approvedText, suggestProofreading } from "./proofreading";
import { randomGenerator, typoGenerator } from "./typos";
const simple: SimulationSettings = {
  ...DEFAULT_SETTINGS,
  pauses: "off",
  typos: "off",
  variation: false,
  wpm: 200,
};
const replay = (plan: ReturnType<typeof createPlan>) =>
  plan.events.reduce(applyEvent, "");

describe("draft evolution", () => {
  it("applies word, punctuation, paragraph and Unicode differences in all revision modes", () => {
    const pairs = [
      [
        "The great draft.\n\nKeep this paragraph.",
        "A better draft!\n\nKeep this paragraph.\n\nAdded 🌿.",
      ],
      ["👩🏽‍💻 café e\u0301\n\n中文", "👨‍💻 café é\n\n中文!"],
      ["old old middle end", "new old middle ending"],
      ["☀️ 👩🏽‍💻", "☀ 👨‍💻"],
      ["abc", ""],
      ["", "word"],
    ];
    for (const mode of ["targeted", "paragraph", "full"] as RevisionMode[]) {
      for (const [before, after] of pairs) {
        let text = before;
        for (const change of diffText(before, after, mode)) {
          expect(
            text.slice(change.index, change.index + change.removed.length),
          ).toBe(change.removed);
          text =
            text.slice(0, change.index) +
            change.inserted +
            text.slice(change.index + change.removed.length);
        }
        expect(text).toBe(after);
      }
    }
    const changes = diffText(
      "Keep all these words. Old ending.",
      "Keep all these words. New ending.",
    );
    expect(
      changes.every((c) => c.index >= "Keep all these words. ".length),
    ).toBe(true);
  });
  it("restores every typo category under every correction timing and method", () => {
    const source =
      "The great friend believes writing is definitely worthwhile.\n\nA separate paragraph receives words. 👩🏽‍💻 e\u0301";
    for (const category of TYPO_CATEGORIES) {
      for (const timing of [
        "immediate",
        "word",
        "sentence",
        "proofreading",
      ] as CorrectionTiming[]) {
        for (const method of ["backspace", "replace"] as const) {
          const plan = createPlan(source, {
            ...simple,
            typos: "high",
            advanced: {
              ...DEFAULT_ADVANCED,
              typoProbability: 1,
              correctionTiming: timing,
              correctionMethod: method,
              categories: Object.fromEntries(
                TYPO_CATEGORIES.map((c) => [c, c === category]),
              ) as typeof DEFAULT_ADVANCED.categories,
            },
          });
          expect(plan.events.some((e) => e.typoCategory === category)).toBe(
            true,
          );
          expect(replay(plan)).toBe(source);
        }
      }
    }
  });
  it("finishes Type 1 before revising and uses independent revision settings", () => {
    const initial = "A great draft.\n\nKeep this.";
    const final =
      "A wonderful final draft!\n\nKeep this.\n\nThe great friend receives writing.";
    const config = {
      ...simple,
      typos: "high" as const,
      advanced: {
        ...DEFAULT_ADVANCED,
        typoProbability: 1,
        correctionTiming: "proofreading" as const,
      },
    };
    const graphemePlan = createPlan("☀️ 👩🏽‍💻 e\u0301", simple);
    expect(
      graphemePlan.events.filter((e) => e.type === "insert").map((e) => e.text),
    ).toEqual(["☀️", " ", "👩🏽‍💻", " ", "e\u0301"]);
    const plan = createPlan(initial, simple, undefined, {
      finalText: final,
      finalSettings: config,
    });
    const boundary = plan.events.findIndex(
      (e) => e.type === "stage" && e.stage === "revision",
    );
    expect(plan.events.slice(0, boundary).reduce(applyEvent, "")).toBe(initial);
    expect(plan.events.slice(boundary).some((e) => e.typoCategory)).toBe(true);
    expect(replay(plan)).toBe(final);
    expect(
      createPlan(initial, simple, undefined, { finalText: "" }).source,
    ).toBe(initial);
  });
  it("matches custom stage durations with pauses and rejects infeasible targets", () => {
    const initial = "A great draft. A second sentence.\n\nAnother paragraph.";
    const final =
      initial + " The great friend writes another sentence. A final thought.";
    const config = { ...DEFAULT_SETTINGS, wpm: 140, typos: "high" as const };
    const natural = createPlan(initial, config);
    const requested = natural.durationMs / 1000 + 1;
    const custom = createPlan(initial, {
      ...config,
      durationSeconds: requested,
    });
    expect(custom.durationMs).toBeCloseTo(requested * 1000);
    expect(custom.events.at(-1)!.scheduledMs).toBeCloseTo(custom.durationMs);
    const revisionBase = createPlan(initial, config, undefined, {
      finalText: final,
      finalSettings: config,
    });
    const revisionDuration = revisionBase.durationMs - natural.durationMs;
    const combined = createPlan(initial, config, undefined, {
      finalText: final,
      finalSettings: {
        ...config,
        durationSeconds: revisionDuration / 1000 + 1,
      },
    });
    expect(combined.durationMs).toBeCloseTo(
      natural.durationMs + revisionDuration + 1000,
    );
    expect(combined.events.at(-1)!.scheduledMs).toBeCloseTo(
      combined.durationMs,
    );
    expect(replay(combined)).toBe(final);
    expect(() =>
      createPlan(initial, { ...config, durationSeconds: 1 }),
    ).toThrow(/20–200/);
  });
  it("generates repeatable varied slips, with physical keyboard neighbors", () => {
    const config = {
      ...DEFAULT_ADVANCED,
      categories: {
        nearby: true,
        missing: false,
        repeated: false,
        transposed: false,
        additional: false,
        spelling: false,
      },
    };
    const typo = typoGenerator(randomGenerator(42), config);
    const slips = Array.from({ length: 20 }, () => typo("great")!.text);
    expect(new Set(slips).size).toBeGreaterThan(4);
    expect(slips.every((s, i) => i === 0 || s !== slips[i - 1])).toBe(true);
    const plan = createPlan(
      "The great friend writes a separate draft.".repeat(5),
      { ...DEFAULT_SETTINGS, typos: "high" },
    );
    expect(plan).toEqual(
      createPlan(plan.source, { ...DEFAULT_SETTINGS, typos: "high" }),
    );
  });
  it("applies only approved proofreading suggestions and ignores stale approval", () => {
    const source = "teh idea , in order to help i think.";
    const config = { ...DEFAULT_PROOFREADING, enabled: true, style: true };
    const suggestions = suggestProofreading(source, config);
    expect(suggestions.length).toBeGreaterThan(2);
    expect(
      replay(createPlan(source, simple, undefined, { proofreading: config })),
    ).toBe(source);
    const approved = { ...config, approvedIds: [suggestions[0].id] };
    expect(approvedText(source, approved)).toBe(
      "the idea , in order to help i think.",
    );
    const plan = createPlan("An initial draft.", simple, undefined, {
      finalText: source,
      proofreading: approved,
    });
    expect(replay(plan)).toBe(plan.source);
    expect(plan.source).toBe(approvedText(source, approved));
    expect(approvedText(source + " Changed.", approved)).toBe(
      source + " Changed.",
    );
  });
});
