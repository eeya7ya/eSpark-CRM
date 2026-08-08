import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSchema } from "@/lib/db";
import { deleteSubscriber, updateSubscriber } from "@/lib/subscribers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function statusFor(message: string): number {
  if (message === "UNAUTHENTICATED") return 401;
  if (message === "FORBIDDEN") return 403;
  return 400;
}

/**
 * Change one subscriber: their tools, their terms, or whether they are active.
 *
 * `kind` is deliberately not editable. Turning a company into an individual
 * would strand the staff its sub-admin already created — accounts inside a
 * subscription whose premise is that one person uses it. Add a new subscriber
 * instead; that is a commercial decision, not a field edit.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    await requireAdmin();
    await ensureSchema();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const body = (await req.json()) as Record<string, unknown>;
    const subscriber = await updateSubscriber(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      status:
        body.status === "active" || body.status === "suspended"
          ? body.status
          : undefined,
      tools: "tools" in body ? (body.tools as string[] | null) : undefined,
      plan: typeof body.plan === "string" ? body.plan : undefined,
      seatLimit:
        "seatLimit" in body ? (body.seatLimit as number | null) : undefined,
      renewalAt:
        "renewalAt" in body ? (body.renewalAt as string | null) : undefined,
      contactName:
        typeof body.contactName === "string" ? body.contactName : undefined,
      contactEmail:
        typeof body.contactEmail === "string" ? body.contactEmail : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    if (!subscriber) {
      return NextResponse.json({ error: "No such subscriber." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, subscriber });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    await requireAdmin();
    await ensureSchema();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const ok = await deleteSubscriber(id);
    if (!ok) {
      return NextResponse.json({ error: "No such subscriber." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}
