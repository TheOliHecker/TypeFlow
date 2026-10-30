import { describe, expect, it } from "vitest";
import { SessionReplay } from "./replay";
import { DEFAULT_SETTINGS } from "../types";
import type { Clock, SessionLog } from "./engine";

const log: SessionLog = {
  schemaVersion: 1,
  kind: "automated-writing-simulation",
  authorshipNotice: "Automated simulation",
  id: "test",
  title: "Test",
  source: "ab",
  settings: DEFAULT_SETTINGS,
  startedAt: "2026-10-30T00:00:00Z",
  events: [
    {
      type: "start",
      sourceIndex: 0,
      atMs: 0,
      activeMs: 0,
      timestamp: "2026-10-30T00:00:00Z",
    },
    {
      type: "insert",
      sourceIndex: 1,
      text: "a",
      atMs: 100,
      activeMs: 100,
      timestamp: "2026-10-30T00:00:00.100Z",
    },
    {
      type: "insert",
      sourceIndex: 1,
      text: "x",
      correction: true,
      atMs: 200,
      activeMs: 200,
      timestamp: "2026-10-30T00:00:00.200Z",
    },
    {
      type: "delete",
      sourceIndex: 1,
      correction: true,
      atMs: 300,
      activeMs: 300,
      timestamp: "2026-10-30T00:00:00.300Z",
    },
    {
      type: "insert",
      sourceIndex: 2,
      text: "b",
      atMs: 400,
      activeMs: 400,
      timestamp: "2026-10-30T00:00:00.400Z",
    },
    {
      type: "complete",
      sourceIndex: 2,
      atMs: 500,
      activeMs: 500,
      timestamp: "2026-10-30T00:00:00.500Z",
    },
  ],
};
function harness() {
  let now = 0;
  let pending: (() => void) | undefined;
  const clock: Clock = {
    now: () => now,
    date: () => new Date(now),
    set: (fn) => {
      pending = fn;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    clear: () => {
      pending = undefined;
    },
  };
  const replay = new SessionReplay(log, clock);
  const advance = (ms: number) => {
    now += ms;
    const callback = pending;
    pending = undefined;
    callback?.();
  };
  return { replay, advance, hasTimer: () => !!pending };
}
describe("recorded event replay", () => {
  it("replays mistakes and backspaces with deterministic final text", () => {
    const { replay, advance } = harness();
    replay.play();
    advance(200);
    expect(replay.getSnapshot().text).toBe("ax");
    advance(100);
    expect(replay.getSnapshot().text).toBe("a");
    advance(200);
    expect(replay.getSnapshot().text).toBe("ab");
    expect(replay.getSnapshot().status).toBe("completed");
  });
  it("pauses and resumes without consuming paused time", () => {
    const { replay, advance, hasTimer } = harness();
    replay.play();
    advance(100);
    replay.pause();
    expect(hasTimer()).toBe(false);
    advance(10000);
    expect(replay.getSnapshot().text).toBe("a");
    replay.play();
    advance(100);
    expect(replay.getSnapshot().text).toBe("ax");
  });
  it("changes playback speed without jumping the playhead", () => {
    const { replay, advance } = harness();
    replay.play();
    advance(100);
    replay.setSpeed(2);
    expect(replay.getSnapshot().positionMs).toBe(100);
    advance(100);
    expect(replay.getSnapshot().positionMs).toBe(300);
    expect(replay.getSnapshot().text).toBe("a");
    advance(100);
    expect(replay.getSnapshot().status).toBe("completed");
  });
  it("cleans up, resets and restarts a completed replay", () => {
    const { replay, advance, hasTimer } = harness();
    replay.play();
    advance(500);
    replay.play();
    expect(replay.getSnapshot().positionMs).toBe(0);
    replay.reset();
    expect(hasTimer()).toBe(false);
    expect(replay.getSnapshot().text).toBe("");
    replay.play();
    replay.dispose();
    expect(hasTimer()).toBe(false);
  });
  it("rejects unsupported playback speeds", () => {
    expect(() => harness().replay.setSpeed(0)).toThrow();
  });
});
