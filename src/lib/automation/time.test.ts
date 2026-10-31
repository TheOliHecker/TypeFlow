import { afterEach, expect, it, vi } from "vitest";
import { resolveLocalTime } from "./time";
afterEach(() => vi.unstubAllEnvs());
it("rejects DST gaps and repeated wall-clock times rather than silently moving a schedule", () => {
  vi.stubEnv("TZ", "America/New_York");
  expect(() => resolveLocalTime("2026-03-08T02:30")).toThrow(/does not exist/);
  expect(() => resolveLocalTime("2026-11-01T01:30")).toThrow(/occurs twice/);
  expect(resolveLocalTime("2026-11-01T03:30")).toBe(
    Date.parse("2026-11-01T03:30:00-05:00"),
  );
});
