import "server-only";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { session as googleSession } from "../google/server";

const COOKIE = "__Host-typeflow-developer";
const TTL = 30 * 60 * 1000;
export type Admin = {
  expires: number;
  documents: Set<string>;
  run?: string;
  running: boolean;
  created: number;
  started?: number;
};
const global = globalThis as typeof globalThis & {
  developerMemory?: { admins: Map<string, Admin>; attempts: number[] };
};
const memory = (global.developerMemory ??= { admins: new Map(), attempts: [] });
export function securityConfig() {
  const origin = process.env.TYPEFLOW_DEVELOPER_ORIGIN;
  const hash = process.env.TYPEFLOW_DEVELOPER_PASSWORD_HASH;
  const secret = process.env.TYPEFLOW_DEVELOPER_SESSION_SECRET;
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.VERCEL ||
    process.env.TYPEFLOW_DEVELOPER_ENABLED !== "true" ||
    !origin ||
    !hash ||
    !secret ||
    secret.length < 43
  )
    throw new Error(
      "Developer Mode is disabled. Configure local HTTPS development access.",
    );
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== "https:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)
  )
    throw new Error("Invalid Developer Mode security configuration.");
  return { origin, hash, secret };
}
export function checkOrigin(request: Request, mutation = false) {
  const { origin } = securityConfig();
  if (
    new URL(request.url).origin !== origin ||
    request.headers.get("host") !== new URL(origin).host
  )
    throw new Error("Developer request host rejected.");
  if (
    mutation &&
    (request.headers.get("origin") !== origin ||
      request.headers.get("x-typeflow-request") !== "1" ||
      !request.headers.get("content-type")?.startsWith("application/json"))
  )
    throw new Error("Developer CSRF validation failed.");
}
export function verifyPassword(password: string, encoded: string) {
  if (
    password.length > 1024 ||
    !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)
  )
    return false;
  const [, salt, digest] = encoded.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(digest, "hex"),
  );
}
const sign = (id: string) =>
  createHmac("sha256", securityConfig().secret).update(id).digest("base64url");
const options = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
};
async function verifyIdentity() {
  const allowlist = process.env.TYPEFLOW_DEVELOPER_GOOGLE_ALLOWLIST?.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist?.length) {
    const google = await googleSession();
    if (
      !google?.emailVerified ||
      !allowlist.includes(google.email.toLowerCase())
    )
      throw new Error("Connect an allowlisted verified Google account first.");
  }
}
export async function adminSession(): Promise<Admin> {
  securityConfig();
  await verifyIdentity();
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  const [id, signature] = raw.split(".");
  const expected = id ? sign(id) : "";
  if (
    !signature ||
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new Error("Unlock Developer Mode first.");
  const admin = memory.admins.get(id);
  if (!admin || admin.expires <= Date.now()) {
    memory.admins.delete(id);
    throw new Error("Developer session expired. Unlock again.");
  }
  return admin;
}
export async function login(password: string) {
  const cfg = securityConfig();
  await verifyIdentity();
  const now = Date.now();
  memory.attempts = memory.attempts.filter((t) => t > now - 15 * 60_000);
  // Global, process-local budget intentionally ignores spoofable forwarded IPs.
  if (memory.attempts.length >= 5)
    throw new Error("Too many unlock attempts. Wait 15 minutes.");
  memory.attempts.push(now);
  if (!verifyPassword(password, cfg.hash))
    throw new Error("Invalid developer password.");
  await logout();
  for (const [id, admin] of memory.admins)
    if (admin.expires <= now) memory.admins.delete(id);
  if (memory.admins.size >= 10)
    throw new Error("Developer session capacity reached.");
  const id = randomBytes(32).toString("base64url");
  memory.admins.set(id, {
    expires: now + TTL,
    documents: new Set(),
    running: false,
    created: 0,
  });
  (await cookies()).set(COOKIE, `${id}.${sign(id)}`, {
    ...options,
    maxAge: TTL / 1000,
  });
}
export async function logout() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value.split(".")[0];
  if (id) memory.admins.delete(id);
  jar.set(COOKIE, "", { ...options, maxAge: 0 });
}
