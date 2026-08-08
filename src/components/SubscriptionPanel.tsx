"use client";

import Link from "next/link";
import { Layers, Lock, Unlock, Users } from "@/lib/icons";
// Type-only: erased at build, so the server module behind these shapes
// (and the database it imports) never reaches the browser bundle.
import type {
  ModuleAccessRow,
  SubscriptionSummary,
} from "@/lib/adminOverview";

/**
 * Subscription — the licence tier of the admin panel.
 *
 * This is the ceiling that Users & Roles works underneath: a workspace admin
 * can only grant a seat in a module the company has actually licensed, which
 * `workspaceLicenses()` enforces on every request. Showing the two together —
 * the licence here, the seats beside it — is what makes that relationship
 * visible instead of something you discover when a grant mysteriously does
 * nothing.
 *
 * It is READ-ONLY for a workspace admin, and deliberately so: the licence
 * lives on the control plane, one tier above this workspace, so changing it
 * from inside the workspace it constrains would defeat it. A platform
 * operator gets a link through to /platform, where it is theirs to change.
 */
export default function SubscriptionPanel({
  rows,
  summary,
  isPlatformAdmin,
}: {
  rows: ModuleAccessRow[];
  summary: SubscriptionSummary;
  /** True when the signed-in user also holds a platform (control plane) session. */
  isPlatformAdmin: boolean;
}) {
  const licensed = rows.filter((r) => r.licensed);
  const unlicensed = rows.filter((r) => !r.licensed);
  const seatTotal = licensed.reduce((n, r) => n + r.seats, 0);
  // Seats on a module the workspace no longer licenses. Those users are
  // already blocked server-side, so this is a tidy-up prompt rather than an
  // access leak — but it is the one state here that is silently inconsistent.
  const stranded = unlicensed.filter((r) => r.seats > 0);

  return (
    <section className="space-y-5">
      {/* Headline */}
      <div className="rounded-2xl border border-espark-border bg-espark-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-cyan-100 text-cyan-600">
                <Layers className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-espark-ink">
                  {summary.workspaceName ?? "This workspace"}
                </p>
                <p className="text-xs text-espark-ink/55">
                  {summary.unlimited
                    ? `All ${summary.totalModules} modules licensed`
                    : `${summary.licensedCount} of ${summary.totalModules} modules licensed`}
                  {" · "}
                  {summary.seats.limit === null
                    ? `${summary.seats.used} ${summary.seats.used === 1 ? "account" : "accounts"}`
                    : `${summary.seats.used}/${summary.seats.limit} accounts used`}
                  {" · "}
                  {seatTotal} module {seatTotal === 1 ? "seat" : "seats"} granted
                </p>
              </div>
            </div>
          </div>

          {isPlatformAdmin ? (
            <Link
              href="/platform"
              className="flex-none rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-espark-primary/85"
            >
              Change licence
            </Link>
          ) : (
            <p className="max-w-xs flex-none text-xs text-espark-ink/50">
              Your licence is managed by your provider. Ask them to add or
              remove a module — everything else on this page is yours to
              change.
            </p>
          )}
        </div>

        {/* Surfaced here so an admin sees the cap BEFORE the create-user form
            refuses them. The limit is set a tier above, on the platform
            console, and is otherwise invisible until it bites. */}
        {summary.seats.full && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            All {summary.seats.limit} accounts on your plan are in use, so new
            users cannot be created. Remove an account, or ask your provider to
            raise the limit.
          </p>
        )}

        {stranded.length > 0 && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>{stranded.map((r) => r.label).join(", ")}</strong>{" "}
            {stranded.length === 1 ? "is" : "are"} no longer licensed but still{" "}
            {stranded.length === 1 ? "has" : "have"} seats assigned. Those users
            are already blocked from opening{" "}
            {stranded.length === 1 ? "it" : "them"} — revoke the roles in Users
            &amp; Roles to tidy up, or license{" "}
            {stranded.length === 1 ? "it" : "them"} again.
          </p>
        )}
      </div>

      {/* Licensed */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-espark-ink/45">
          Licensed
        </h3>
        {licensed.length === 0 ? (
          <p className="rounded-xl border border-dashed border-espark-border p-6 text-center text-sm text-espark-ink/50">
            No modules licensed.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {licensed.map((r) => (
              <ModuleRow key={r.module} row={r} />
            ))}
          </div>
        )}
      </div>

      {/* Not licensed — shown, not hidden: an admin deciding what to add
          needs to see what they are not paying for. */}
      {unlicensed.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-espark-ink/45">
            Not licensed
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {unlicensed.map((r) => (
              <ModuleRow key={r.module} row={r} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ModuleRow({ row }: { row: ModuleAccessRow }) {
  const { label, blurb, licensed, seats } = row;
  return (
    <div
      className={`rounded-xl border p-3 ${
        licensed
          ? "border-espark-border bg-espark-surface"
          : "border-dashed border-espark-border/70 bg-espark-soft/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={`min-w-0 truncate text-sm font-semibold ${
            licensed ? "text-espark-ink" : "text-espark-ink/45"
          }`}
        >
          {label}
        </p>
        <span
          className={`inline-flex flex-none items-center justify-center rounded-full border p-1 ${
            licensed
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-espark-border bg-espark-soft text-espark-ink/40"
          }`}
          title={licensed ? "Licensed" : "Not licensed"}
        >
          {licensed ? (
            <Unlock className="h-3 w-3" />
          ) : (
            <Lock className="h-3 w-3" />
          )}
        </span>
      </div>
      <p
        className={`mt-0.5 text-xs leading-snug ${
          licensed ? "text-espark-ink/55" : "text-espark-ink/35"
        }`}
      >
        {blurb}
      </p>
      <p
        className={`mt-2 inline-flex items-center gap-1 text-xs ${
          licensed ? "text-espark-ink/70" : "text-espark-ink/35"
        }`}
      >
        <Users className="h-3.5 w-3.5" />
        <span className="font-semibold tabular-nums">{seats}</span>
        {seats === 1 ? "seat" : "seats"}
      </p>
    </div>
  );
}
