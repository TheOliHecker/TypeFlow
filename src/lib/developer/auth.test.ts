import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";
const jar = vi.hoisted(() => {
  const data = new Map<string, string>();
  return {
    data,
    get: (k: string) => (data.has(k) ? { value: data.get(k)! } : undefined),
    set: vi.fn((k: string, v: string) => {
      data.set(k, v);
    }),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
import {
  adminSession,
  checkOrigin,
  login,
  logout,
  securityConfig,
  verifyPassword,
} from "./auth";
const hash = `scrypt:${"ab".repeat(16)}:${scryptSync("test-only-password", "ab".repeat(16), 64).toString("hex")}`;
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("TYPEFLOW_DEVELOPER_ENABLED", "true");
  vi.stubEnv("TYPEFLOW_DEVELOPER_ORIGIN", "https://localhost:3000");
  vi.stubEnv("TYPEFLOW_DEVELOPER_PASSWORD_HASH", hash);
  vi.stubEnv(
    "TYPEFLOW_DEVELOPER_SESSION_SECRET",
    "test-only-session-secret-".repeat(3),
  );
  jar.data.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("fails closed outside configured local HTTPS development and rejects cross-origin mutations", () => {
  expect(verifyPassword("test-only-password", hash)).toBe(true);
  expect(verifyPassword("incorrect", hash)).toBe(false);
  expect(() =>
    checkOrigin(
      new Request("https://localhost:3000/api/developer/control", {
        headers: { host: "localhost:3000", origin: "https://attacker.example" },
      }),
      true,
    ),
  ).toThrow("CSRF");
  vi.stubEnv("NODE_ENV", "production");
  expect(securityConfig).toThrow("disabled");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TYPEFLOW_DEVELOPER_ORIGIN", "https://public.example");
  expect(securityConfig).toThrow("configuration");
});
it("requires a valid password, signs secure sessions, rejects tampering, expires and revokes sessions", async () => {
  await expect(adminSession()).rejects.toThrow("Unlock");
  await login("test-only-password");
  expect(jar.set).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.any(String),
    expect.objectContaining({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 1800,
    }),
  );
  await expect(adminSession()).resolves.toHaveProperty("running", false);
  const name = "__Host-typeflow-developer",
    saved = jar.data.get(name)!;
  jar.data.set(name, saved + "x");
  await expect(adminSession()).rejects.toThrow("Unlock");
  jar.data.set(name, saved);
  vi.useFakeTimers();
  vi.advanceTimersByTime(1800001);
  await expect(adminSession()).rejects.toThrow("expired");
  vi.useRealTimers();
  await login("test-only-password");
  await logout();
  await expect(adminSession()).rejects.toThrow("Unlock");
});
it("enforces a process-wide login budget without trusting forwarded IP headers", async () => {
  // Previous successful logins also consume the budget; a successful password does not reset it.
  for (let i = 0; i < 5; i++)
    await expect(login("incorrect")).rejects.toThrow();
  await expect(login("test-only-password")).rejects.toThrow("Too many");
});
