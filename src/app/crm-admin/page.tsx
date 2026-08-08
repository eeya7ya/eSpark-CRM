import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platformAuth";
import { hasControlPlane } from "@/lib/controlDb";
import { listSubscriptions, totalsFor, TOOLS } from "@/lib/subscriptions";
import CrmAdminConsole from "@/components/crm-admin/CrmAdminConsole";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My CRM Admin",
  robots: { index: false, follow: false },
};

/**
 * MY CRM ADMIN — the owner's surface, above every subscription.
 *
 * Signed in with the same owner account as the platform console rather than a
 * second credential: it is the same person with the same authority, and a
 * separate password would be one more thing to lose without buying any
 * isolation. Access is refused outright without a control plane, since with no
 * workspace registry there are no subscriptions to manage.
 */
export default async function CrmAdminPage() {
  if (!hasControlPlane()) redirect("/");
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform/login");

  const subscriptions = await listSubscriptions();

  return (
    <CrmAdminConsole
      adminName={admin.displayName}
      initialSubscriptions={subscriptions}
      initialTotals={totalsFor(subscriptions)}
      tools={TOOLS}
      canCreateDatabase={Boolean(process.env.PROVISION_DATABASE_URL)}
    />
  );
}
