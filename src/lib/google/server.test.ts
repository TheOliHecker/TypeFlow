import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: (name: string) =>
      values.has(name) ? { value: values.get(name)! } : undefined,
    set: vi.fn((name: string, value: string) => {
      values.set(name, value);
    }),
    delete: (name: string) => {
      values.delete(name);
    },
  };
});
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
import {
  authorize,
  callback,
  config,
  csrf,
  session,
  disconnect,
} from "./server";

beforeEach(() => {
  jar.values.clear();
  jar.set.mockClear();
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv(
    "GOOGLE_REDIRECT_URI",
    "https://typeflow.example/api/google/callback",
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("server OAuth safety", () => {
  it("requires exact configured redirect origin and same-origin JSON mutation requests", () => {
    expect(() =>
      csrf(
        new Request("https://typeflow.example/api/google/batch", {
          method: "POST",
          headers: {
            Origin: "https://attacker.example",
            "Content-Type": "application/json",
            "X-TypeFlow-Request": "1",
          },
        }),
      ),
    ).toThrow("CSRF");
    expect(() =>
      csrf(
        new Request("https://typeflow.example/api/google/batch", {
          method: "POST",
          headers: {
            Origin: "https://typeflow.example",
            "Content-Type": "application/json",
            "X-TypeFlow-Request": "1",
          },
        }),
      ),
    ).not.toThrow();
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://typeflow.example/elsewhere");
    expect(() => config()).toThrow("redirect");
  });
  it("rejects mismatched and replayed OAuth state before exchanging credentials", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const url = await authorize();
    const state = url.searchParams.get("state")!;
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    await expect(
      callback(
        new URL(
          "https://typeflow.example/api/google/callback?state=wrong&code=code",
        ),
      ),
    ).rejects.toThrow("state");
    await expect(
      callback(
        new URL(
          `https://typeflow.example/api/google/callback?state=${state}&code=code`,
        ),
      ),
    ).rejects.toThrow("state");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps tokens server-side behind an opaque secure cookie and revokes on disconnect", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "private-access-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/drive.file email",
        }),
      )
      .mockResolvedValueOnce(Response.json({ email: "tester@example.com" }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const url = await authorize();
    await callback(
      new URL(
        `https://typeflow.example/api/google/callback?state=${url.searchParams.get("state")}&code=code`,
      ),
    );
    const cookie = jar.values.get("typeflow-google")!;
    expect(cookie).toHaveLength(43);
    expect(cookie).not.toContain("private-access-token");
    expect(jar.set.mock.calls.at(-1)).toEqual([
      "typeflow-google",
      cookie,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      }),
    ]);
    const exchange = fetcher.mock.calls[0][1].body as URLSearchParams;
    expect(exchange.get("code_verifier")).toHaveLength(43);
    expect(exchange.get("redirect_uri")).toBe(
      "https://typeflow.example/api/google/callback",
    );
    expect((await session())?.email).toBe("tester@example.com");
    await disconnect();
    expect(fetcher.mock.calls.at(-1)![0]).toBe(
      "https://oauth2.googleapis.com/revoke",
    );
    expect(await session()).toBeNull();
  });
});
