import { redirect } from "next/navigation";
import { canReadAll, getSessionUser } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import AdminTabs from "@/components/AdminTabs";
import { getAppSettings } from "@/lib/settings";
import { getPlatformAdmin } from "@/lib/platformAuth";
import { hasControlPlane, listWorkspaces } from "@/lib/controlDb";
import SubscribersPanel from "@/components/platform/SubscribersPanel";
import {
  getModuleAccessRows,
  summariseSubscription,
} from "@/lib/adminOverview";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Kick the settings fetch off in parallel with the auth check so its
  // DB round-trip overlaps with the JWT verification. `fresh: true`
  // bypasses the per-instance cache so the admin always seeds the form
  // from the latest persisted row — on Vercel each lambda keeps its own
  // cache, so without a fresh read a reload landing on a different
  // instance would render pre-save values.
  const settingsPromise = getAppSettings({ fresh: true });
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canReadAll(user)) redirect("/crm");
  const readOnly = user.role !== "admin";

  // A platform operator lands on their subscribers first. Ordinary workspace
  // admins hold no platform session, so this resolves to null for them and the
  // page is exactly what it was — their own company's administration.
  const platformAdmin = hasControlPlane() ? await getPlatformAdmin() : null;
  const subscribers = platformAdmin ? await listWorkspaces() : [];

  // Both access tiers for the Subscription tab: what this workspace has
  // licensed, and how many people hold a seat in each module.
  const moduleRows = await getModuleAccessRows();
  const subscription = {
    rows: moduleRows,
    summary: await summariseSubscription(moduleRows),
    isPlatformAdmin: platformAdmin !== null,
  };

  const settings = await settingsPromise;
  const sp = await searchParams;
  return (
    <div className="min-h-screen bg-espark-soft/40">
      <TopBar user={user} />
      <main className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-10">
        <h1 className="text-2xl font-bold text-espark-ink mb-4">Admin</h1>
        {platformAdmin && (
          <SubscribersPanel
            workspaces={subscribers}
            workspaceDomain={process.env.WORKSPACE_DOMAIN}
          />
        )}
        {readOnly && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You&apos;re signed in as a <strong>viewer</strong>. Every tab is
            visible, but Save / Create / Delete actions are disabled.
          </div>
        )}
        <AdminTabs
          initialSettings={settings}
          readOnly={readOnly}
          initialTab={sp.tab}
          subscription={subscription}
        />
      </main>
    </div>
  );
}
