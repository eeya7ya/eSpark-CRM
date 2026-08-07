import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAuth";
import { auditPlatformAction, listWorkspaces } from "@/lib/controlDb";
import { provisionWorkspace } from "@/lib/provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Workspace administration for the platform operator.
 *
 *   GET  → every workspace and its status.
 *   POST → provision a new one (database, schema, first admin).
 *
 * Note what these return: a workspace's identity, status and branding, never
 * anything from inside it. There is deliberately no route here that reads a
 * client's leads, quotations or users — the platform surface has no way to
 * look at customer data, and this file is where such a route would have to
 * live for it to exist at all.
 */

/** Shape sent to the client. Excludes the connection string, always. */
function present(ws: Awaited<ReturnType<typeof listWorkspaces>>[number]) {
  return {
    slug: ws.slug,
    name: ws.name,
    status: ws.status,
    r2_prefix: ws.r2Prefix,
    branding: ws.branding,
    modules: ws.modules,
    provision_error: ws.provisionError,
  };
}

function statusFor(message: string): number {
  if (message === "UNAUTHENTICATED") return 401;
  return 400;
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    const workspaces = await listWorkspaces();
    return NextResponse.json({ workspaces: workspaces.map(present) });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = (await req.json()) as {
      slug?: string;
      name?: string;
      adminUsername?: string;
      adminPassword?: string;
      databaseUrl?: string;
      companyDetails?: Record<string, unknown>;
    };

    const { workspace, createdDatabase } = await provisionWorkspace({
      slug: String(body.slug || ""),
      name: String(body.name || ""),
      adminUsername: String(body.adminUsername || ""),
      adminPassword: String(body.adminPassword || ""),
      databaseUrl: body.databaseUrl ? String(body.databaseUrl) : undefined,
      companyDetails: body.companyDetails,
    });

    await auditPlatformAction(
      admin.username,
      "workspace.create",
      workspace.slug,
      // The connection string is never audited — the log is readable by every
      // platform admin and would otherwise hand out database credentials.
      { name: workspace.name, createdDatabase },
    );
    return NextResponse.json({ ok: true, workspace: present(workspace) });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}
