import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { sql, ensureSchema } from "./db";
import { hasControlPlane, getWorkspaceBySlugCached } from "./controlDb";
import { bindWorkspace, getBoundWorkspace } from "./workspaceContext";

const COOKIE = "mt_session";
const ALG = "HS256";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET missing or too short (>=16 chars).");
  }
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  id: number;
  username: string;
  /**
   * `admin` — full read + full write across the system.
   * `viewer` — full read across the system, but blocked from every
   *   mutation. The UI surface is the same as admin so the watcher
   *   "feels like" an admin while being unable to change anything.
   * `user` — sees and edits only their own rows.
   */
  role: "admin" | "viewer" | "user";
  display_name: string;
  /**
   * Per-user phone number, used as the default "Presales Engineer" phone
   * stamped onto every new quotation this user prepares. Empty string when
   * the admin hasn't set one yet — the Designer falls through to its
   * blank input so the user can type one explicitly, instead of inheriting
   * whatever hardcoded number the previous implementation was carrying.
   */
  phone: string;
  /**
   * True when this account's password was last set by an admin (on creation or
   * reset) and the user hasn't chosen their own yet. While true the app forces
   * the user onto /change-password (enforced in middleware). Cleared to false
   * the moment the user sets their own password.
   */
  mustChangePassword: boolean;
  /**
   * Which workspace (client company) this session belongs to. Users live in
   * their workspace's own database, so `id` and `username` are unique only
   * within a workspace — two clients can each have an `admin`, and they are
   * different people. Empty in single-workspace deployments, where there is
   * nothing to disambiguate.
   */
  workspaceSlug: string;
}

/**
 * PBKDF2 password hashing using Web Crypto — runs on Edge and Node without
 * native bcrypt. Format: `pbkdf2$<iters>$<saltB64>$<hashB64>`.
 */
const ITERS = 120_000;

function b64(buf: ArrayBuffer): string {
  return Buffer.from(new Uint8Array(buf)).toString("base64");
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(s, "base64");
  // Allocate a fresh ArrayBuffer so the typed array is not backed by
  // SharedArrayBuffer (which Web Crypto rejects).
  const ab = new ArrayBuffer(buf.byteLength);
  const out = new Uint8Array(ab);
  out.set(buf);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERS },
    key,
    256,
  );
  return `pbkdf2$${ITERS}$${b64(salt.buffer)}$${b64(bits)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iters = parseInt(parts[1], 10);
  const salt = fromB64(parts[2]);
  const expected = parts[3];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iters },
    key,
    256,
  );
  return b64(bits) === expected;
}

/**
 * Bootstraps the default admin user on first call. Idempotent.
 *
 * Only for single-workspace deployments. Once a control plane exists, each
 * workspace gets its own first admin seeded at provisioning time with a
 * password the operator sets — planting a shared `admin`/`admin123` in every
 * client's database instead would be a known credential on every one of them.
 */
export async function ensureDefaultAdmin(): Promise<void> {
  if (hasControlPlane()) return;
  await ensureSchema();
  const user = process.env.DEFAULT_ADMIN_USER || "admin";
  const pass = process.env.DEFAULT_ADMIN_PASS || "admin123";
  const q = sql();
  const existing = (await q`
    select id from users where username = ${user}
  `) as Array<{ id: number }>;
  if (existing.length === 0) {
    const hash = await hashPassword(pass);
    // Force the very first admin to replace the default/bootstrap password on
    // first login — a known default credential must never survive untouched.
    await q`
      insert into users (username, password_hash, role, must_change_password)
      values (${user}, ${hash}, 'admin', true)
    `;
  }
}

export async function createSessionCookie(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    sub: String(user.id),
    username: user.username,
    role: user.role,
    display_name: user.display_name,
    phone: user.phone,
    mustChange: user.mustChangePassword,
    // The workspace this session may touch. Signed into the token, so the
    // edge middleware can read it without a database round trip.
    ws: user.workspaceSlug,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * Read and verify the session, and — in a multi-workspace deployment — bind
 * the session's workspace so every subsequent `sql()` in this request reaches
 * that workspace's database and no other.
 *
 * This is the single ambient binding point. It is called by route handlers
 * (usually via `requireUser`) and directly by server components, which is why
 * 119 route handlers needed no change.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    const workspaceSlug = String(payload.ws || "");

    if (hasControlPlane()) {
      // No `ws` claim means a session minted before workspaces existed. There
      // is no safe workspace to assume, so it is treated as signed out — one
      // forced re-login, rather than a guess that could open the wrong data.
      if (!workspaceSlug) return null;
      const ws = await getWorkspaceBySlugCached(workspaceSlug);
      // A deleted or suspended workspace ends its sessions: suspension is how
      // the platform cuts off a client, so it has to hold mid-session too.
      if (!ws || ws.status !== "active") return null;
      bindWorkspace(ws);
    }

    return {
      id: Number(payload.sub),
      username: String(payload.username),
      role: (payload.role as "admin" | "viewer" | "user") || "user",
      display_name: String(payload.display_name || ""),
      phone: String(payload.phone || ""),
      mustChangePassword: payload.mustChange === true,
      workspaceSlug,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  // Defence in depth. `bindWorkspace` sets the binding on the current async
  // context rather than wrapping a callback, so re-checking it here means a
  // binding that somehow belonged to another request surfaces as a refused
  // request instead of as a cross-workspace read.
  if (hasControlPlane() && getBoundWorkspace()?.slug !== user.workspaceSlug) {
    throw new Error("WORKSPACE_MISMATCH");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}

/**
 * Watcher (viewer) capability helpers. Read-side code branches on
 * `canReadAll` so a viewer sees the same data scope as an admin.
 * Write-side code calls `requireWriter()` (or strict `requireAdmin()`)
 * which both reject viewers. The pure helpers live in
 * `./authShared` so client components can import them without webpack
 * trying to bundle `next/headers`.
 */
export { canReadAll, canWrite } from "./authShared";
import { canReadAll, canWrite } from "./authShared";

/** Admin OR viewer — every route that surfaces cross-user data. */
export async function requireReadAll(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canReadAll(user)) throw new Error("FORBIDDEN");
  return user;
}

/** Any non-viewer logged-in user. Used to gate every mutation handler. */
export async function requireWriter(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canWrite(user)) throw new Error("FORBIDDEN");
  return user;
}
