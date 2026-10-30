/** Server-only, process-local OAuth vault. Tokens never leave this module's callers. */
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";

type Session = {
  token: string;
  expires: number;
  email: string;
  emailVerified: boolean;
  writes: number[];
};
type Flow = { state: string; verifier: string; expires: number };
const vault = globalThis as typeof globalThis & {
  typeflowGoogle?: {
    sessions: Map<string, Session>;
    flows: Map<string, Flow>;
    writes: number[];
  };
};
const memory = (vault.typeflowGoogle ??= {
  sessions: new Map(),
  flows: new Map(),
  writes: [],
});
export const SESSION_COOKIE = "typeflow-google";
export const FLOW_COOKIE = "typeflow-oauth";
export const random = () => randomBytes(32).toString("base64url");
export function config() {
  const {
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    GOOGLE_REDIRECT_URI: redirect,
  } = process.env;
  if (!clientId || !clientSecret || !redirect)
    throw new Error(
      "Google is not configured. Follow docs/google-docs-setup.md.",
    );
  const uri = new URL(redirect);
  if (
    uri.pathname !== "/api/google/callback" ||
    uri.search ||
    uri.hash ||
    uri.username ||
    uri.password ||
    (uri.protocol !== "https:" &&
      !(
        uri.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(uri.hostname)
      ))
  )
    throw new Error("Invalid configured Google redirect URI.");
  return { clientId, clientSecret, redirect, origin: uri.origin };
}
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: config().origin.startsWith("https:"),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
function prune() {
  for (const [id, s] of memory.sessions)
    if (s.expires <= Date.now()) memory.sessions.delete(id);
  for (const [id, s] of memory.flows)
    if (s.expires <= Date.now()) memory.flows.delete(id);
  if (memory.sessions.size + memory.flows.size >= 1000)
    throw new Error("OAuth session capacity reached. Try later.");
}
export async function authorize() {
  prune();
  const cfg = config(),
    state = random(),
    verifier = random(),
    id = random();
  memory.flows.set(id, { state, verifier, expires: Date.now() + 600_000 });
  (await cookies()).set(FLOW_COOKIE, id, cookieOptions(600));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirect,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file email",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  }).toString();
  return url;
}
export async function callback(url: URL) {
  const cfg = config(),
    jar = await cookies(),
    id = jar.get(FLOW_COOKIE)?.value ?? "";
  const flow = memory.flows.get(id);
  memory.flows.delete(id);
  jar.delete(FLOW_COOKIE);
  if (
    url.origin !== cfg.origin ||
    !flow ||
    flow.expires < Date.now() ||
    url.searchParams.get("state") !== flow.state
  )
    throw new Error(
      "Authorization expired or state validation failed. Connect again.",
    );
  if (url.searchParams.has("error"))
    throw new Error(
      "Google authorization was declined. Connect again when ready.",
    );
  const code = url.searchParams.get("code");
  if (!code) throw new Error("Google returned no authorization code.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirect,
      grant_type: "authorization_code",
      code_verifier: flow.verifier,
    }),
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "Google token exchange failed. Check the OAuth web client and exact redirect URI.",
    );
  const data = await response.json();
  if (
    !data.access_token ||
    !Number.isFinite(data.expires_in) ||
    !String(data.scope)
      .split(" ")
      .includes("https://www.googleapis.com/auth/drive.file")
  )
    throw new Error("Google did not grant the required document scope.");
  const account = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  const profile = account.ok ? await account.json() : {};
  prune();
  const sessionId = random(),
    seconds = Math.max(1, Math.min(3600, data.expires_in - 60));
  const old = jar.get(SESSION_COOKIE)?.value;
  if (old) memory.sessions.delete(old);
  memory.sessions.set(sessionId, {
    token: data.access_token,
    expires: Date.now() + seconds * 1000,
    email: profile.email ?? "Google account",
    emailVerified: profile.verified_email === true,
    writes: [],
  });
  jar.set(SESSION_COOKIE, sessionId, cookieOptions(seconds));
}
export async function session() {
  const id = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const result = memory.sessions.get(id);
  if (!result || result.expires <= Date.now()) {
    memory.sessions.delete(id);
    return null;
  }
  return result;
}
export function csrf(request: Request) {
  if (
    request.headers.get("origin") !== config().origin ||
    request.headers.get("x-typeflow-request") !== "1" ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new Error("Request origin or CSRF validation failed.");
}
export async function disconnect() {
  const jar = await cookies(),
    id = jar.get(SESSION_COOKIE)?.value ?? "",
    value = memory.sessions.get(id);
  if (value) {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      body: new URLSearchParams({ token: value.token }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok && response.status !== 400)
      throw new Error(
        "Google revocation failed. Retry disconnect, or revoke TypeFlow in your Google account.",
      );
  }
  memory.sessions.delete(id);
  jar.delete(SESSION_COOKIE);
}
export async function googleRequest(s: Session, path: string, body?: unknown) {
  if (body) {
    const now = Date.now(),
      limit = Math.max(
        1,
        Number(process.env.GOOGLE_WRITE_REQUESTS_PER_MINUTE) || 30,
      );
    s.writes = s.writes.filter((t) => t > now - 60_000);
    memory.writes = memory.writes.filter((t) => t > now - 60_000);
    const projectLimit = Math.max(
      1,
      Number(process.env.GOOGLE_PROJECT_WRITES_PER_MINUTE) || 300,
    );
    if (s.writes.length >= limit || memory.writes.length >= projectLimit)
      return new Response("{}", {
        status: 429,
        headers: { "retry-after": "60" },
      });
    s.writes.push(now);
    memory.writes.push(now);
  }
  return fetch(`https://docs.googleapis.com/v1/documents${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${s.token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
}
