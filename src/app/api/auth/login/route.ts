import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  createSessionCookie,
  ensureDefaultAdmin,
  verifyPassword,
} from "@/lib/auth";
import { hasControlPlane, getWorkspaceBySlugCached } from "@/lib/controlDb";
import { runInWorkspace } from "@/lib/workspaceContext";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Bucket = { count: number; resetAt: number };
const attempts = new Map<string, Bucket>();

function clientKey(
  req: NextRequest,
  workspace: string,
  username: string,
): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  // Keyed by workspace too: usernames are only unique within one, so two
  // clients can both have an `admin` and neither should be able to lock the
  // other out by guessing at it.
  return `${ip}|${workspace}|${username.toLowerCase()}`;
}

function checkRate(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt < now) {
    return { ok: true };
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true };
}

function recordFailure(key: string): void {
  const now = Date.now();
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

function clearAttempts(key: string): void {
  attempts.delete(key);
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, workspace } = (await req.json()) as {
      username?: string;
      password?: string;
      workspace?: string;
    };
    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing credentials" },
        { status: 400 },
      );
    }

    // Which database to authenticate against has to be settled before any
    // credential is checked: users live inside their workspace, so there is
    // nowhere to look this one up until the workspace is known.
    const slug = (workspace || "").trim().toLowerCase();
    const ws = hasControlPlane()
      ? await getWorkspaceBySlugCached(slug)
      : null;
    if (hasControlPlane() && (!ws || ws.status !== "active")) {
      // Deliberately the same message and status as a wrong password. A
      // distinct "no such workspace" would let anyone enumerate the
      // platform's client list from the login form.
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const key = clientKey(req, slug, username);
    const gate = checkRate(key);
    if (!gate.ok) {
      return NextResponse.json(
        {
          error: `Too many attempts. Try again in ${Math.ceil(gate.retryAfterSec / 60)} minute(s).`,
        },
        { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
      );
    }

    return ws
      ? await runInWorkspace(ws, () => authenticate(key, username, password, ws.slug))
      : await authenticate(key, username, password, "");
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Login failed" },
      { status: 500 },
    );
  }
}

/**
 * Verify credentials against the currently-bound workspace database and mint
 * the session. Runs inside `runInWorkspace` on multi-workspace deployments, so
 * `sql()` here reaches that workspace's database and no other.
 */
async function authenticate(
  key: string,
  username: string,
  password: string,
  workspaceSlug: string,
): Promise<NextResponse> {
  await ensureDefaultAdmin();
  const q = sql();
    const rows = (await q`
      select id, username, password_hash, role, display_name, phone,
             must_change_password
      from users
      where username = ${username}
      limit 1
    `) as Array<{
      id: number;
      username: string;
      password_hash: string;
      role: "admin" | "user";
      display_name: string;
      phone: string | null;
      must_change_password: boolean | number | null;
    }>;
    if (rows.length === 0) {
      recordFailure(key);
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }
    const row = rows[0];
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      recordFailure(key);
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }
    clearAttempts(key);
    const mustChangePassword = Boolean(row.must_change_password);
    await createSessionCookie({
      id: row.id,
      username: row.username,
      role: row.role,
      display_name: row.display_name || "",
      phone: row.phone || "",
      mustChangePassword,
      workspaceSlug,
    });
    return NextResponse.json({
      ok: true,
      user: {
        id: row.id,
        username: row.username,
        role: row.role,
        display_name: row.display_name || "",
        phone: row.phone || "",
        must_change_password: mustChangePassword,
      },
      workspace: workspaceSlug || undefined,
    });
}
