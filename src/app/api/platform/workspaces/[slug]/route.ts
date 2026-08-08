import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAuth";
import { MODULES } from "@/lib/modules";
import {
  auditPlatformAction,
  ensureControlSchema,
  getControlSql,
  getWorkspaceBySlug,
  invalidateWorkspace,
} from "@/lib/controlDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * PATCH /api/platform/workspaces/[slug]
 *
 * Configure an existing workspace: rename it, suspend or reinstate it, or
 * update the pre-login branding (app name, login tagline, logo, palette).
 *
 * Suspension is how a client is cut off, so it has to take hold mid-session
 * rather than only at next login: `getSessionUser` drops any session whose
 * workspace is not active, and the cache entry is invalidated here so that
 * takes effect within the request rather than after the cache TTL.
 *
 * The slug is immutable. It keys the login form, the R2 prefix and any future
 * subdomain, so changing it would strand a client's saved logins and orphan
 * their stored files.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requirePlatformAdmin();
    const { slug } = await params;
    await ensureControlSchema();

    const existing = await getWorkspaceBySlug(slug);
    if (!existing) {
      return NextResponse.json({ error: "No such workspace." }, { status: 404 });
    }

    const body = (await req.json()) as {
      name?: string;
      status?: string;
      branding?: Record<string, unknown>;
      /** Licensed modules; null clears the restriction. */
      modules?: string[] | null;
      /** Commercial terms — see controlDb.Workspace. */
      plan?: string;
      /** Max user accounts; null (or <= 0) clears the cap. */
      seat_limit?: number | null;
      /** ISO date the subscription lapses; null clears it. */
      renewal_at?: string | null;
      contact_name?: string;
      contact_email?: string;
      notes?: string;
    };
    const q = getControlSql();
    const changed: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      await q`
        update workspaces set name = ${body.name.trim()}, updated_at = now()
         where slug = ${slug}
      `;
      changed.name = body.name.trim();
    }

    if (body.status === "active" || body.status === "suspended") {
      // Only these two are settable by hand. `provisioning` and `failed` are
      // written by the provisioner to describe what actually happened, and
      // letting an operator assert them would misreport the workspace's state.
      await q`
        update workspaces set status = ${body.status}, updated_at = now()
         where slug = ${slug}
      `;
      changed.status = body.status;
    }

    if (body.modules !== undefined) {
      // null clears the restriction (licensed for everything). An array is
      // filtered against the known module list so a typo cannot silently
      // license nothing, and `admin` is implicit — a workspace must always be
      // able to manage its own users.
      const next =
        body.modules === null
          ? null
          : Array.isArray(body.modules)
            ? MODULES.filter(
                (m) => m !== "admin" && (body.modules as string[]).includes(m),
              )
            : undefined;
      if (next !== undefined) {
        await q`
          update workspaces
             set modules = ${next === null ? null : JSON.stringify(next)},
                 updated_at = now()
           where slug = ${slug}
        `;
        changed.modules = next ?? "all";
      }
    }

    // ── Commercial terms ──────────────────────────────────────────────────
    if (typeof body.plan === "string" && body.plan.trim()) {
      await q`
        update workspaces set plan = ${body.plan.trim()}, updated_at = now()
         where slug = ${slug}
      `;
      changed.plan = body.plan.trim();
    }

    if (body.seat_limit !== undefined) {
      // A non-positive cap would lock the customer out of their own workspace,
      // so it is stored as null ("uncapped") rather than taken literally.
      const n = Number(body.seat_limit);
      const next =
        body.seat_limit === null || !Number.isFinite(n) || n <= 0
          ? null
          : Math.floor(n);
      await q`
        update workspaces set seat_limit = ${next}, updated_at = now()
         where slug = ${slug}
      `;
      changed.seat_limit = next ?? "uncapped";
    }

    if (body.renewal_at !== undefined) {
      const raw = body.renewal_at;
      // Reject an unparseable date rather than storing null, which would read
      // as "never expires" — the opposite of what a mistyped date means.
      let next: string | null = null;
      if (raw !== null && String(raw).trim()) {
        const d = new Date(String(raw));
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "renewal_at is not a valid date." },
            { status: 400 },
          );
        }
        next = d.toISOString();
      }
      await q`
        update workspaces set renewal_at = ${next}, updated_at = now()
         where slug = ${slug}
      `;
      changed.renewal_at = next ?? "none";
    }

    for (const field of ["contact_name", "contact_email", "notes"] as const) {
      const value = body[field];
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      // Each is a fixed identifier from this literal list, never user input,
      // so the column name cannot be injected through it.
      if (field === "contact_name") {
        await q`update workspaces set contact_name = ${trimmed}, updated_at = now() where slug = ${slug}`;
      } else if (field === "contact_email") {
        await q`update workspaces set contact_email = ${trimmed}, updated_at = now() where slug = ${slug}`;
      } else {
        await q`update workspaces set notes = ${trimmed}, updated_at = now() where slug = ${slug}`;
      }
      changed[field] = trimmed;
    }

    if (body.branding && typeof body.branding === "object") {
      // Merge rather than replace, so updating one field (say the palette)
      // does not silently clear the app name set in an earlier request.
      const merged = { ...existing.branding, ...body.branding };
      await q`
        update workspaces set branding = ${JSON.stringify(merged)},
                              updated_at = now()
         where slug = ${slug}
      `;
      changed.branding = Object.keys(body.branding);
    }

    invalidateWorkspace(slug);
    await auditPlatformAction(admin.username, "workspace.update", slug, changed);

    const updated = await getWorkspaceBySlug(slug);
    return NextResponse.json({
      ok: true,
      workspace: updated && {
        slug: updated.slug,
        name: updated.name,
        status: updated.status,
        r2_prefix: updated.r2Prefix,
        branding: updated.branding,
        modules: updated.modules,
        provision_error: updated.provisionError,
        plan: updated.plan,
        seat_limit: updated.seatLimit,
        renewal_at: updated.renewalAt,
        contact_name: updated.contactName,
        contact_email: updated.contactEmail,
        notes: updated.notes,
      },
    });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHENTICATED" ? 401 : 400 },
    );
  }
}
