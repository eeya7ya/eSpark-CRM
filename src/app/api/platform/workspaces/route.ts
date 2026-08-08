import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAuth";
import { auditPlatformAction, listWorkspaces } from "@/lib/controlDb";
import { provisionWorkspace } from "@/lib/provision";
import { listCustomers, summarisePlatform } from "@/lib/platformOverview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Workspace administration for the platform operator.
 *
 *   GET  → every workspace and its status.
 *   POST → provision a new one (database, schema, first admin).
 *
 * Note what these return: a workspace's identity, subscription and status —
 * never its contents. There is deliberately no route here that reads a
 * client's leads, quotations or clients, and this file is where such a route
 * would have to live for it to exist at all.
 *
 * The ONE thing read from inside a workspace is `count(*) from users`, and
 * only because that is the quantity being sold: a seat limit that cannot be
 * measured cannot be enforced or renewed against. It is a number of accounts,
 * never their names, and nothing else crosses the boundary.
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
    plan: ws.plan,
    seat_limit: ws.seatLimit,
    renewal_at: ws.renewalAt,
    contact_name: ws.contactName,
    contact_email: ws.contactEmail,
    notes: ws.notes,
  };
}

function statusFor(message: string): number {
  if (message === "UNAUTHENTICATED") return 401;
  return 400;
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    // `customers` carries the same rows plus live seat usage and renewal
    // state; `workspaces` is kept alongside it so any existing caller of this
    // endpoint keeps the shape it was written against.
    const [workspaces, customers] = await Promise.all([
      listWorkspaces(),
      listCustomers(),
    ]);
    return NextResponse.json({
      workspaces: workspaces.map(present),
      customers,
      summary: summarisePlatform(customers),
    });
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
