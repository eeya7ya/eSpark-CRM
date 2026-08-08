import Link from "next/link";
import type { Workspace } from "@/lib/controlDb";

/**
 * Subscribers — the companies licensing the app — surfaced at the top of the
 * admin page for whoever is signed in as a platform operator.
 *
 * The admin page below this belongs to ONE workspace: its users, roles and
 * departments. This panel is the tier above it, so an operator lands on what
 * they actually administer (who their subscribers are and what each has
 * licensed) instead of on one company's staff list.
 *
 * It renders nothing for an ordinary workspace admin, who has no platform
 * session — they see only their own company, which is the whole point.
 *
 * Deliberately identity and licensing only: no counts of a subscriber's leads,
 * quotations or clients appear here, because the platform tier does not read
 * customer data.
 */

const STATUS_STYLES: Record<string, string> = {
  active:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  suspended:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  failed:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  provisioning: "border-espark-border bg-espark-soft text-espark-muted",
};

export default function SubscribersPanel({
  workspaces,
  /** Set once workspaces have their own subdomains, to show each one's host. */
  workspaceDomain,
}: {
  workspaces: Workspace[];
  workspaceDomain?: string;
}) {
  const active = workspaces.filter((w) => w.status === "active").length;

  return (
    <section className="mb-8 rounded-2xl border border-espark-border bg-espark-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-espark-ink">Subscribers</h2>
          <p className="mt-1 text-sm text-espark-muted">
            Companies licensing the app — {active} active of {workspaces.length}.
            Everything below this panel belongs to your own workspace only.
          </p>
        </div>
        <Link
          href="/platform"
          className="rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white hover:bg-espark-primary/85"
        >
          Manage subscribers
        </Link>
      </div>

      {workspaces.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-espark-border p-6 text-center text-sm text-espark-muted">
          No subscribers yet. Create the first from the platform console.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {workspaces.map((ws) => (
            <li
              key={ws.slug}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-espark-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-espark-ink">{ws.name}</p>
                <p className="truncate font-mono text-xs text-espark-muted">
                  {workspaceDomain ? `${ws.slug}.${workspaceDomain}` : ws.slug}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-espark-muted">
                  {ws.modules === null
                    ? "All modules"
                    : `${ws.modules.length} module${ws.modules.length === 1 ? "" : "s"}`}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    STATUS_STYLES[ws.status] ?? STATUS_STYLES.provisioning
                  }`}
                >
                  {ws.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
