import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platformAuth";
import { hasControlPlane } from "@/lib/controlDb";
import PlatformLoginClient from "@/components/platform/PlatformLoginClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform sign-in",
  // The operator console is not something to surface in search results.
  robots: { index: false, follow: false },
};

export default async function PlatformLoginPage() {
  // Without a control plane there are no workspaces to manage and no
  // platform_admins table to authenticate against, so the surface does not
  // exist rather than presenting a login that could never succeed.
  if (!hasControlPlane()) redirect("/");
  if (await getPlatformAdmin()) redirect("/platform");
  return <PlatformLoginClient />;
}
