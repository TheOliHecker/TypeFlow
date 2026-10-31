import { afterEach, expect, it, vi } from "vitest";
import { SimulationEngine } from "./engine";
import { DEFAULT_SETTINGS, wordCount } from "../types";
afterEach(() => vi.useRealTimers());
it("separates final words from inserted/removed volume through a full revision and resets for a new session", async () => {
  vi.useFakeTimers();
  const engine = new SimulationEngine();
  engine.start(
    "One two.",
    {
      ...DEFAULT_SETTINGS,
      wpm: 300,
      pauses: "off",
      typos: "off",
      variation: false,
    },
    "Metrics",
    {
      finalText: "Three four five.",
      revisionMode: "full",
      finalSettings: {
        ...DEFAULT_SETTINGS,
        wpm: 300,
        pauses: "off",
        typos: "off",
        variation: false,
      },
    },
  );
  await vi.advanceTimersByTimeAsync(10000);
  expect(engine.getSnapshot().status).toBe("completed");
  expect(wordCount(engine.getSnapshot().text)).toBe(3);
  expect(engine.getOperationMetrics().inserted).toBe(5);
  expect(engine.getOperationMetrics().removed).toBe(2);
  expect(engine.getOperationMetrics().operations).toBeGreaterThan(5);
  engine.reset();
  expect(engine.getOperationMetrics()).toEqual({
    inserted: 0,
    removed: 0,
    operations: 0,
  });
  engine.dispose();
});
