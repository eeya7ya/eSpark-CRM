import { NextRequest, NextResponse } from "next/server";
import {
  createPlatformSession,
  ensureDefaultPlatformAdmin,
  verifyPlatformAdmin,
} from "@/lib/platformAuth";
import { auditPlatformAction, hasControlPlane } from "@/lib/controlDb";

export const runtime = "nodejs";

/**
 * POST /api/platform/login
 *
 * Operator sign-in for the workspace management surface. Authenticates against
 * `platform_admins` in the control database — never against any workspace's
 * users — and mints a session with no workspace claim, so the resulting
 * session cannot reach a client's data.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: NextRequest, username: string): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return `${ip}|${username.toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!hasControlPlane()) {
      return NextResponse.json(
        { error: "This deployment has no control plane configured." },
        { status: 404 },
      );
    }
    const { username, password } = (await req.json()) as {
      username?: string;
      password?: string;
    };
    if (!username || !password) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const key = clientKey(req, username);
    const now = Date.now();
    const bucket = attempts.get(key);
    if (bucket && bucket.resetAt > now && bucket.count >= MAX_ATTEMPTS) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      return NextResponse.json(
        {
          error: `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
        },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
      );
    }

    await ensureDefaultPlatformAdmin();
    const admin = await verifyPlatformAdmin(username, password);
    if (!admin) {
      const b = attempts.get(key);
      if (!b || b.resetAt < now) {
        attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
      } else {
        b.count += 1;
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    attempts.delete(key);

    await createPlatformSession(admin);
    await auditPlatformAction(admin.username, "platform.login", null);
    return NextResponse.json({
      ok: true,
      admin: {
        username: admin.username,
        display_name: admin.displayName,
        must_change_password: admin.mustChangePassword,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Login failed" },
      { status: 500 },
    );
  }
}
