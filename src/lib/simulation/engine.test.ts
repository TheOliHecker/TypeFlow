import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, MAX_TEXT_LENGTH } from "../types";
import { applyEvent, SimulationEngine, type Clock } from "./engine";
import { createPlan } from "./plan";

function harness() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    date: () => new Date(Date.UTC(2026, 9, 30) + now),
    set: (fn, delay) => {
      const key = ++id;
      timers.set(key, { at: now + delay, fn });
      return key as unknown as ReturnType<typeof setTimeout>;
    },
    clear: (key) => {
      timers.delete(key as unknown as number);
    },
  };
  const engine = new SimulationEngine(clock);
  const advance = (ms: number) => {
    now += ms;
    for (const [key, timer] of [...timers])
      if (timer.at <= now) {
        timers.delete(key);
        timer.fn();
      }
  };
  const finish = () => {
    let n = 0;
    while (engine.getSnapshot().status === "running" && n++ < 1000)
      advance(1e9);
    expect(engine.getSnapshot().status).toBe("completed");
  };
  return { engine, advance, finish, timers };
}
const simple = {
  ...DEFAULT_SETTINGS,
  variation: false,
  pauses: "off" as const,
  typos: "off" as const,
};

describe("simulation engine", () => {
  it("finishes with exact text, Unicode and paragraph breaks", () => {
    const { engine, finish } = harness();
    const text = "Hello 🌿 café.\n\n中文 and e\u0301 — accurate.";
    engine.start(text, DEFAULT_SETTINGS);
    finish();
    expect(engine.getSnapshot().text).toBe(text);
    expect(engine.getSnapshot().progress).toBe(100);
  });
  it("pauses during revision and reconstructs the complete staged session", () => {
    const { engine, advance, finish } = harness();
    const initial = "An initial draft.",
      final = "A revised initial draft!";
    const options = {
      finalText: final,
      finalSettings: { ...simple, wpm: 200 },
    };
    const plan = createPlan(initial, simple, undefined, options);
    const boundary = plan.events.find(
      (e) => e.type === "stage" && e.stage === "revision",
    )!;
    engine.start(initial, simple, "Evolution", options);
    advance(boundary.scheduledMs + 100);
    expect(engine.getSnapshot().stage).toBe("revision");
    engine.pause();
    const paused = engine.getSnapshot();
    advance(10000);
    expect(engine.getSnapshot()).toEqual(paused);
    engine.resume();
    finish();
    const log = engine.getLog()!;
    expect(log.events.reduce(applyEvent, "")).toBe(final);
    expect(log.source).toBe(final);
    expect(log.initialSource).toBe(initial);
    expect(log.schemaVersion).toBe(3);
  });
  it("rejects empty and whitespace input without creating a timer", () => {
    const { engine, timers } = harness();
    for (const text of ["", " \n\t"])
      expect(() => engine.start(text, simple)).toThrow();
    expect(timers.size).toBe(0);
    expect(engine.getSnapshot().status).toBe("idle");
  });
  it("pauses, holds output and resumes using active elapsed time", () => {
    const { engine, advance, finish, timers } = harness();
    engine.start("A sentence with enough words.", simple);
    advance(1500);
    engine.pause();
    const paused = engine.getSnapshot();
    expect(paused.status).toBe("paused");
    expect(timers.size).toBe(0);
    advance(10000);
    expect(engine.getSnapshot()).toEqual(paused);
    engine.resume();
    advance(500);
    expect(engine.getSnapshot().elapsedMs).toBe(2000);
    finish();
    expect(engine.getLog()!.events.map((e) => e.type)).toContain("resume");
  });
  it("stops without more output and allows a new session", () => {
    const { engine, advance, timers, finish } = harness();
    engine.start("Words go here.", simple);
    advance(1000);
    engine.stop();
    const stopped = engine.getSnapshot();
    advance(50000);
    expect(engine.getSnapshot()).toEqual(stopped);
    expect(timers.size).toBe(0);
    expect(engine.start("Fresh start", simple)).toBe(true);
    finish();
    expect(engine.getSnapshot().text).toBe("Fresh start");
  });
  it("prevents overlapping starts while running or paused", () => {
    const { engine, timers } = harness();
    engine.start("First session", simple);
    expect(engine.start("Second", simple)).toBe(false);
    engine.pause();
    expect(engine.start("Third", simple)).toBe(false);
    engine.resume();
    expect(timers.size).toBe(1);
  });
  it("inserts visible mistakes and corrects all of them", () => {
    const { engine, finish } = harness();
    const source = "A thoughtful collection of words and ideas. ".repeat(20);
    engine.start(source, { ...simple, typos: "high" });
    finish();
    const events = engine.getLog()!.events;
    expect(events.filter((e) => e.type === "delete").length).toBeGreaterThan(0);
    expect(events.some((e) => e.typoCategory)).toBe(true);
    expect(engine.getSnapshot().text).toBe(source);
  });
  it("reconstructs exact output solely from recorded events", () => {
    const { engine, finish } = harness();
    engine.start("Replay this exactly.\n\nIncluding corrections!".repeat(6), {
      ...DEFAULT_SETTINGS,
      typos: "high",
    });
    finish();
    const log = engine.getLog()!;
    expect(log.events.reduce(applyEvent, "")).toBe(engine.getSnapshot().text);
    expect(log.kind).toBe("automated-writing-simulation");
    expect(
      log.events.every(
        (event, i) => i === 0 || event.atMs >= log.events[i - 1].atMs,
      ),
    ).toBe(true);
  });
  it("uses elapsed time after late callbacks and never fabricates event timestamps", () => {
    const { engine, advance } = harness();
    engine.start("Timer drift", simple);
    advance(5000);
    expect(engine.getSnapshot().status).toBe("completed");
    expect(
      engine
        .getLog()!
        .events.filter((e) => e.type === "insert")
        .every((e) => e.atMs === 5000),
    ).toBe(true);
  });
  it("handles 100,000 characters with bounded work per callback", () => {
    const { engine, advance, finish, timers } = harness();
    const source = "a".repeat(MAX_TEXT_LENGTH);
    engine.start(source, simple);
    advance(1e9);
    expect(engine.getSnapshot().text.length).toBe(1000);
    finish();
    expect(engine.getSnapshot().text).toBe(source);
    expect(timers.size).toBe(0);
    expect(() => engine.start(source + "a", simple)).toThrow(/limited/);
  });
  it("cleans up timers on reset and dispose", () => {
    const { engine, timers } = harness();
    engine.start("Reset me", simple);
    engine.reset();
    expect(engine.getSnapshot().status).toBe("idle");
    expect(engine.getLog()).toBeNull();
    expect(timers.size).toBe(0);
    engine.start("Unmount me", simple);
    engine.dispose();
    expect(timers.size).toBe(0);
  });
  it("returns independent event logs so consumers cannot mutate history", () => {
    const { engine } = harness();
    engine.start("History", simple);
    engine.getLog()!.events.length = 0;
    expect(engine.getLog()!.events.length).toBe(1);
  });
});
describe("simulation planning", () => {
  it("is deterministic and natural variation changes intervals", () => {
    const a = createPlan("A few words go here.", DEFAULT_SETTINGS);
    expect(a).toEqual(createPlan("A few words go here.", DEFAULT_SETTINGS));
    expect(
      new Set(
        a.events.map((e, i) =>
          Math.round(e.scheduledMs - (a.events[i - 1]?.scheduledMs ?? 0)),
        ),
      ).size,
    ).toBeGreaterThan(1);
  });
  it("adds thinking pauses only when enabled", () => {
    expect(
      createPlan("One. Two.", simple).events.some((e) => e.type === "thinking"),
    ).toBe(false);
    expect(
      createPlan("One. Two.", DEFAULT_SETTINGS).events.some(
        (e) => e.type === "thinking",
      ),
    ).toBe(true);
  });
  it("matches feasible requested durations and rejects impossible ones", () => {
    const base = createPlan("A paragraph with words and a full stop.", simple);
    const custom = createPlan(base.source, {
      ...simple,
      durationSeconds: base.durationMs / 1000,
    });
    expect(custom.durationMs).toBeCloseTo(base.durationMs);
    expect(() =>
      createPlan(base.source, { ...simple, durationSeconds: 1 }),
    ).toThrow(/20–300/);
    expect(() =>
      createPlan(base.source, { ...simple, durationSeconds: 100000 }),
    ).toThrow(/20–300/);
  });
  it("validates nonfinite speeds and durations and preserves Windows line breaks", () => {
    expect(() => createPlan("hello", { ...simple, wpm: NaN })).toThrow();
    expect(() =>
      createPlan("hello", { ...simple, durationSeconds: Infinity }),
    ).toThrow();
    expect(createPlan("a\r\nb", simple).source).toBe("a\r\nb");
  });
  it("rejects inherited property names as intensity values", () => {
    expect(() =>
      createPlan("Some words", { ...simple, pauses: "constructor" as never }),
    ).toThrow(/intensity/);
  });
  it("explains when a document is too short for a one-second custom duration", () => {
    expect(() => createPlan("a", { ...simple, durationSeconds: 1 })).toThrow(
      /too short/,
    );
  });
});
