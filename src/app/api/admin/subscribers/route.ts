import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import {
  createSubscriber,
  listSubscribers,
  totalsFor,
  TOOLS,
} from "@/lib/subscribers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Subscribers — the CRM owner's own list.
 *
 *   GET  → everyone subscribed, with the tools each bought.
 *   POST → add one, individual or company.
 *
 * Admin-only, the same gate as every other admin route, because this is part
 * of the admin page rather than a separate console with its own login.
 */

function statusFor(message: string): number {
  if (message === "UNAUTHENTICATED") return 401;
  if (message === "FORBIDDEN") return 403;
  return 400;
}

export async function GET() {
  try {
    await requireAdmin();
    await ensureSchema();
    const subscribers = await listSubscribers();
    return NextResponse.json({
      subscribers,
      totals: totalsFor(subscribers),
      tools: TOOLS,
    });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    await ensureSchema();
    const body = (await req.json()) as {
      slug?: string;
      name?: string;
      kind?: string;
      tools?: string[] | null;
      plan?: string;
      seatLimit?: number | null;
      contactName?: string;
      contactEmail?: string;
    };
    const subscriber = await createSubscriber({
      slug: String(body.slug || ""),
      name: String(body.name || ""),
      kind: body.kind === "individual" ? "individual" : "company",
      tools: body.tools ?? null,
      plan: body.plan,
      seatLimit: body.seatLimit ?? null,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
    });
    return NextResponse.json({ ok: true, subscriber });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}
