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
  // Not a redirect. Subscriptions live in the control database, so without one
  // there is genuinely nothing here — but bouncing to "/" made that look like
  // the page did not exist, which is indistinguishable from a broken deploy.
  // It says what is missing instead.
  if (!hasControlPlane()) return <NeedsControlPlane />;
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

/**
 * Shown when the app is running as a single company. Every subscription — who
 * bought what, individual or company — is a row in the control database, so
 * with `CONTROL_DATABASE_URL` unset there is no registry to manage and this
 * console has nothing to show. That is a configuration state, not an error,
 * and it is fixable, so it says how.
 */
function NeedsControlPlane() {
  return (
    <main className="min-h-screen bg-espark-canvas px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-widest text-espark-muted">
          eSpark
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-espark-ink">
          My CRM Admin
        </h1>
        <div className="mt-6 rounded-2xl border border-espark-border bg-espark-surface p-6">
          <p className="text-sm text-espark-ink">
            This app is currently running as a{" "}
            <strong>single company</strong> — one database, no subscribers.
          </p>
          <p className="mt-3 text-sm text-espark-muted">
            Subscriptions live in a separate control database: who has
            subscribed, whether they are one person or a company, which tools
            they bought, and when they renew. Until that database is
            configured there is no registry for this console to manage.
          </p>
          <p className="mt-4 text-sm font-medium text-espark-ink">
            To turn it on
          </p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-espark-muted">
            <li>
              Create an empty Postgres database for the registry. It holds no
              customer data — only the list of subscribers.
            </li>
            <li>
              Set <code className="font-mono text-espark-ink">CONTROL_DATABASE_URL</code>{" "}
              to its connection string.
            </li>
            <li>
              Set{" "}
              <code className="font-mono text-espark-ink">WORKSPACE_SECRET_KEY</code>{" "}
              to a fresh key — it encrypts each subscriber&rsquo;s database
              credentials at rest. Generate one with{" "}
              <code className="font-mono text-espark-ink">
                openssl rand -base64 32
              </code>
              .
            </li>
            <li>
              Optionally set{" "}
              <code className="font-mono text-espark-ink">
                PROVISION_DATABASE_URL
              </code>{" "}
              so a new subscriber&rsquo;s database is created for you instead of
              pasting one in each time.
            </li>
            <li>
              Redeploy, then sign in as the owner at{" "}
              <code className="font-mono text-espark-ink">/platform/login</code>{" "}
              and come back here.
            </li>
          </ol>
          <p className="mt-4 text-sm text-espark-muted">
            Nothing about your current company changes when you do this — its
            data stays where it is.
          </p>
        </div>
      </div>
    </main>
  );
}
