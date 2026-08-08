import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAuth";
import {
  auditPlatformAction,
  ensureControlSchema,
  getControlSql,
  getWorkspaceBySlug,
  invalidateWorkspace,
  INDIVIDUAL_SEAT_LIMIT,
} from "@/lib/controlDb";
import { TOOLS } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Change one subscription: which tools it includes, how many accounts it
 * allows, when it renews, who to contact, and whether it is active.
 *
 * `kind` is deliberately NOT editable here. Turning a company into an
 * individual would strand the staff its sub-admin already created — their
 * accounts would exist inside a subscription whose whole premise is that only
 * one person uses it. Sell a new subscription instead; that is a commercial
 * decision, not a field edit.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requirePlatformAdmin();
    const { slug } = await params;
    await ensureControlSchema();

    const existing = await getWorkspaceBySlug(slug);
    if (!existing) {
      return NextResponse.json(
        { error: "No such subscription." },
        { status: 404 },
      );
    }

    const body = (await req.json()) as {
      name?: string;
      status?: string;
      tools?: string[] | null;
      seatLimit?: number | null;
      plan?: string;
      renewalAt?: string | null;
      contactName?: string;
      contactEmail?: string;
      notes?: string;
    };
    const q = getControlSql();
    const changed: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      await q`update workspaces set name = ${body.name.trim()}, updated_at = now() where slug = ${slug}`;
      changed.name = body.name.trim();
    }

    if (body.status === "active" || body.status === "suspended") {
      // Only these two are settable by hand. `provisioning` and `failed` are
      // written by the provisioner to describe what actually happened.
      await q`update workspaces set status = ${body.status}, updated_at = now() where slug = ${slug}`;
      changed.status = body.status;
    }

    if (body.tools !== undefined) {
      // null includes every tool. An array is filtered against the sellable
      // list so a typo cannot silently sell nothing.
      const valid = new Set(TOOLS.map((t) => t.id as string));
      const next =
        body.tools === null
          ? null
          : Array.isArray(body.tools)
            ? body.tools.map(String).filter((t) => valid.has(t))
            : undefined;
      if (next !== undefined) {
        await q`
          update workspaces
             set modules = ${next === null ? null : JSON.stringify(next)},
                 updated_at = now()
           where slug = ${slug}
        `;
        changed.tools = next ?? "all";
      }
    }

    if (body.seatLimit !== undefined) {
      // An individual subscription is one account by definition, so its cap is
      // not the operator's to set — `toWorkspace` reports 1 regardless, and
      // accepting a different number here would only store a lie.
      if (existing.kind === "individual") {
        await q`update workspaces set seat_limit = ${INDIVIDUAL_SEAT_LIMIT}, updated_at = now() where slug = ${slug}`;
        changed.seat_limit = INDIVIDUAL_SEAT_LIMIT;
      } else {
        const n = Number(body.seatLimit);
        // A non-positive cap would lock the customer out of their own
        // workspace, so it stores as null ("uncapped") rather than literally.
        const next =
          body.seatLimit === null || !Number.isFinite(n) || n <= 0
            ? null
            : Math.floor(n);
        await q`update workspaces set seat_limit = ${next}, updated_at = now() where slug = ${slug}`;
        changed.seat_limit = next ?? "uncapped";
      }
    }

    if (typeof body.plan === "string" && body.plan.trim()) {
      await q`update workspaces set plan = ${body.plan.trim()}, updated_at = now() where slug = ${slug}`;
      changed.plan = body.plan.trim();
    }

    if (body.renewalAt !== undefined) {
      let next: string | null = null;
      if (body.renewalAt !== null && String(body.renewalAt).trim()) {
        const d = new Date(String(body.renewalAt));
        // Reject an unparseable date rather than storing null, which would
        // read as "never expires" — the opposite of a mistyped date.
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "The renewal date is not a valid date." },
            { status: 400 },
          );
        }
        next = d.toISOString();
      }
      await q`update workspaces set renewal_at = ${next}, updated_at = now() where slug = ${slug}`;
      changed.renewal_at = next ?? "none";
    }

    if (typeof body.contactName === "string") {
      await q`update workspaces set contact_name = ${body.contactName.trim()}, updated_at = now() where slug = ${slug}`;
      changed.contact_name = body.contactName.trim();
    }
    if (typeof body.contactEmail === "string") {
      await q`update workspaces set contact_email = ${body.contactEmail.trim()}, updated_at = now() where slug = ${slug}`;
      changed.contact_email = body.contactEmail.trim();
    }
    if (typeof body.notes === "string") {
      await q`update workspaces set notes = ${body.notes.trim()}, updated_at = now() where slug = ${slug}`;
      changed.notes = body.notes.trim();
    }

    invalidateWorkspace(slug);
    await auditPlatformAction(
      admin.username,
      "subscription.update",
      slug,
      changed,
    );

    return NextResponse.json({ ok: true, changed });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHENTICATED" ? 401 : 400 },
    );
  }
}
