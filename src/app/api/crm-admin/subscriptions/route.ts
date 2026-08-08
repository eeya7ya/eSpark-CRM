import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAuth";
import { auditPlatformAction } from "@/lib/controlDb";
import { provisionWorkspace } from "@/lib/provision";
import { listSubscriptions, totalsFor, TOOLS } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Subscriptions, for the CRM owner's console.
 *
 *   GET  → every subscription with its tools and current usage.
 *   POST → sell a new one, provisioning its database and first login.
 *
 * Two shapes, one route, because they differ only in who administers whom:
 *
 *   kind=individual — one person subscribing for themselves. The login created
 *                     here IS the subscriber; nobody else is ever added.
 *   kind=company    — a company. The login created here is their SUB-ADMIN,
 *                     who then manages their own staff inside the tools sold.
 *
 * What crosses back out of a workspace is its account count and nothing else:
 * a subscription that cannot be measured cannot be sized or renewed against.
 * No leads, quotations or clients are readable from this namespace.
 */

function statusFor(message: string): number {
  if (message === "UNAUTHENTICATED") return 401;
  return 400;
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    const subscriptions = await listSubscriptions();
    return NextResponse.json({
      subscriptions,
      totals: totalsFor(subscriptions),
      tools: TOOLS,
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
      kind?: string;
      slug?: string;
      name?: string;
      loginUsername?: string;
      loginPassword?: string;
      /** Tool ids included; omit or null to include every tool. */
      tools?: string[] | null;
      databaseUrl?: string;
    };

    const kind = body.kind === "individual" ? "individual" : "company";

    const { workspace, createdDatabase } = await provisionWorkspace({
      slug: String(body.slug || ""),
      name: String(body.name || ""),
      adminUsername: String(body.loginUsername || ""),
      adminPassword: String(body.loginPassword || ""),
      databaseUrl: body.databaseUrl ? String(body.databaseUrl) : undefined,
      kind,
    });

    // Tools are applied after provisioning rather than inside it: provisioning
    // is restartable and must stay idempotent, and a tool list is a commercial
    // decision that can be changed any time afterwards without re-running it.
    const validIds = new Set(TOOLS.map((t) => t.id as string));
    const tools = Array.isArray(body.tools)
      ? body.tools.filter((t) => validIds.has(String(t)))
      : null;
    if (tools !== null) {
      const { getControlSql, invalidateWorkspace } = await import(
        "@/lib/controlDb"
      );
      const q = getControlSql();
      await q`
        update workspaces set modules = ${JSON.stringify(tools)},
                              updated_at = now()
         where slug = ${workspace.slug}
      `;
      invalidateWorkspace(workspace.slug);
    }

    await auditPlatformAction(
      admin.username,
      "subscription.create",
      workspace.slug,
      { kind, tools: tools ?? "all", createdDatabase },
    );

    return NextResponse.json({
      ok: true,
      subscription: {
        slug: workspace.slug,
        name: workspace.name,
        kind,
        status: workspace.status,
      },
      createdDatabase,
    });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}
