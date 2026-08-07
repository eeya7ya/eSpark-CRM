import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platformAuth";
import { hasControlPlane, listWorkspaces } from "@/lib/controlDb";
import PlatformConsole from "@/components/platform/PlatformConsole";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform console",
  robots: { index: false, follow: false },
};

export default async function PlatformPage() {
  if (!hasControlPlane()) redirect("/");
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform/login");

  // Identity, status and branding only. Connection strings never leave the
  // server, and there is no query here that reaches inside a workspace.
  const workspaces = (await listWorkspaces()).map((ws) => ({
    slug: ws.slug,
    name: ws.name,
    status: ws.status,
    r2Prefix: ws.r2Prefix,
    provisionError: ws.provisionError,
  }));

  return (
    <PlatformConsole
      adminName={admin.displayName}
      initialWorkspaces={workspaces}
      canCreateDatabase={Boolean(process.env.PROVISION_DATABASE_URL)}
    />
  );
}
