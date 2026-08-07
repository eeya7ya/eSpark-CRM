import { NextResponse } from "next/server";
import { clearPlatformSession, getPlatformAdmin } from "@/lib/platformAuth";
import { auditPlatformAction } from "@/lib/controlDb";

export const runtime = "nodejs";

/** POST /api/platform/logout — end the operator session. */
export async function POST() {
  const admin = await getPlatformAdmin();
  await clearPlatformSession();
  if (admin) await auditPlatformAction(admin.username, "platform.logout", null);
  return NextResponse.json({ ok: true });
}
