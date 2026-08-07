import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAuth";
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
        provision_error: updated.provisionError,
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
