import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { hashPassword, verifyPassword } from "./auth";
import { ensureControlSchema, getControlSql } from "./controlDb";

/**
 * Platform-admin authentication — the operator-side login that manages
 * workspaces, entirely separate from the per-workspace user login.
 *
 * ── Why a separate session ─────────────────────────────────────────────────
 * The rule is that a platform admin can configure workspaces but cannot read
 * any client's business data. That is enforced structurally rather than by a
 * permission check: this session lives in its own cookie, carries no `ws`
 * claim, and never calls `bindWorkspace`. Since `sql()` fails closed when no
 * workspace is bound, a platform admin's request *cannot* execute a query
 * against a client's database — there is no code path that would reach one.
 *
 * ── What this does not protect against ─────────────────────────────────────
 * Anyone holding the control database's credentials, or the environment the
 * app runs in, can read every stored connection string and query any workspace
 * directly. That is an infrastructure access question — who holds the
 * credentials — and the app cannot decide it. Treat those secrets accordingly.
 */

const COOKIE = "mt_platform";
const ALG = "HS256";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET missing or too short (>=16 chars).");
  }
  return new TextEncoder().encode(s);
}

export interface PlatformAdmin {
  id: number;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
}

/**
 * Bootstrap the first platform admin from the environment, once. Idempotent.
 * Without `PLATFORM_ADMIN_USER`/`PLATFORM_ADMIN_PASS` no account is created —
 * the platform surface then has no way in, which is the correct default for a
 * deployment that has not opted into it.
 */
export async function ensureDefaultPlatformAdmin(): Promise<void> {
  const username = process.env.PLATFORM_ADMIN_USER;
  const password = process.env.PLATFORM_ADMIN_PASS;
  if (!username || !password) return;
  await ensureControlSchema();
  const q = getControlSql();
  const existing = (await q`
    select id from platform_admins where username = ${username} limit 1
  `) as Array<{ id: number }>;
  if (existing.length > 0) return;
  const hash = await hashPassword(password);
  await q`
    insert into platform_admins (username, password_hash, display_name,
                                 must_change_password)
    values (${username}, ${hash}, ${username}, true)
  `;
}

/** Verify credentials against the control database. */
export async function verifyPlatformAdmin(
  username: string,
  password: string,
): Promise<PlatformAdmin | null> {
  await ensureControlSchema();
  const q = getControlSql();
  const rows = (await q`
    select id, username, password_hash, display_name, must_change_password
    from platform_admins
    where username = ${username}
    limit 1
  `) as Array<{
    id: number | string;
    username: string;
    password_hash: string;
    display_name: string;
    must_change_password: boolean | null;
  }>;
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!(await verifyPassword(password, row.password_hash))) return null;
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name || row.username,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

export async function createPlatformSession(
  admin: PlatformAdmin,
): Promise<void> {
  const token = await new SignJWT({
    sub: String(admin.id),
    username: admin.username,
    display_name: admin.displayName,
    mustChange: admin.mustChangePassword,
    // Marks this as a platform session. Note what is absent: no `ws` claim,
    // so nothing downstream can bind a workspace from it.
    platform: true,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    // Shorter than a workspace session: this one can reconfigure every
    // client's workspace, so a forgotten open tab should expire sooner.
    .setExpirationTime("12h")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Scoped to the platform surface, so it is never sent with an ordinary
    // workspace request.
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearPlatformSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    if (payload.platform !== true) return null;
    return {
      id: Number(payload.sub),
      username: String(payload.username),
      displayName: String(payload.display_name || payload.username || ""),
      mustChangePassword: payload.mustChange === true,
    };
  } catch {
    return null;
  }
}

export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const admin = await getPlatformAdmin();
  if (!admin) throw new Error("UNAUTHENTICATED");
  return admin;
}

/** Change a platform admin's own password and clear the must-change flag. */
export async function setPlatformAdminPassword(
  id: number,
  password: string,
): Promise<void> {
  await ensureControlSchema();
  const q = getControlSql();
  const hash = await hashPassword(password);
  await q`
    update platform_admins
       set password_hash = ${hash}, must_change_password = false
     where id = ${id}
  `;
}
