"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
// Type-only: erased at build, so the server modules behind these shapes never
// reach the browser bundle.
import type {
  Subscription,
  SubscriptionTotals,
  Tool,
} from "@/lib/subscriptions";

/**
 * MY CRM ADMIN — the owner's console.
 *
 * This is the top of the product, and it sells two shapes of subscription:
 *
 *   SINGLE PERSON — one human subscribing for themselves. No sub-admin and no
 *                   staff. What they bought is which tools they may open:
 *                   a SINGLE tool (the quotation designer only, say) or
 *                   MULTIPLE tools.
 *   COMPANY       — a company, with its own sub-admin who manages that
 *                   company's users (presales, sales, projects) inside the
 *                   tools bought here.
 *
 * The two are laid out as separate sections rather than one filtered list,
 * because they are not variations of a row — they are different products with
 * different questions. "How many staff do they have?" is meaningless for an
 * individual, and "which single tool did they buy?" is meaningless for a
 * company. Each section asks only what its own shape can answer.
 *
 * Both kinds get their own database. This console never reads what is inside
 * one; the only figure crossing that line is an account count, because a
 * subscription that cannot be measured cannot be sized or renewed against.
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

export default function CrmAdminConsole({
  adminName,
  initialSubscriptions,
  initialTotals,
  tools,
  canCreateDatabase,
}: {
  adminName: string;
  initialSubscriptions: Subscription[];
  initialTotals: SubscriptionTotals;
  tools: Tool[];
  /** True when PROVISION_DATABASE_URL is set, so a database can be created. */
  canCreateDatabase: boolean;
}) {
  const router = useRouter();
  const [subs, setSubs] = useState(initialSubscriptions);
  const [totals, setTotals] = useState(initialTotals);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Which kind the create form is selling, or null when it is closed. */
  const [selling, setSelling] = useState<"individual" | "company" | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const individuals = useMemo(
    () => subs.filter((s) => s.kind === "individual"),
    [subs],
  );
  const companies = useMemo(
    () => subs.filter((s) => s.kind === "company"),
    [subs],
  );

  async function refresh() {
    const res = await fetch("/api/crm-admin/subscriptions");
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.subscriptions)) {
      setSubs(data.subscriptions as Subscription[]);
      if (data.totals) setTotals(data.totals as SubscriptionTotals);
    }
  }

  async function patch(
    target: Subscription,
    body: Record<string, unknown>,
    describe: (s: Subscription) => string,
  ) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/crm-admin/subscriptions/${target.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      await refresh();
      setNotice(describe(target));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(target: Subscription, status: string) {
    if (
      status === "suspended" &&
      !window.confirm(
        `Suspend "${target.name}"? They are signed out immediately and cannot sign back in until reinstated. No data is deleted.`,
      )
    ) {
      return;
    }
    await patch(target, { status }, (s) => `${s.name} is now ${status}.`);
  }

  function toggleTool(target: Subscription, id: string) {
    // null means "every tool", so the first untick has to materialise the full
    // list and remove from it — otherwise the click would read as "sell only
    // this one".
    const current = target.tools ?? tools.map((t) => t.id as string);
    const next = current.includes(id)
      ? current.filter((t) => t !== id)
      : [...current, id];
    void patch(target, { tools: next }, (s) =>
      next.length === 1
        ? `${s.name} now has one tool.`
        : `${s.name} now has ${next.length} tools.`,
    );
  }

  async function signOut() {
    await fetch("/api/platform/logout", { method: "POST" });
    router.push("/platform/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-espark-canvas px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-espark-muted">
              eSpark
            </p>
            <h1 className="text-2xl font-semibold text-espark-ink">
              My CRM Admin
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-espark-muted">
            <span>{adminName}</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-espark-border px-3 py-1.5 text-espark-ink"
            >
              Sign out
            </button>
          </div>
        </header>

        <p className="mt-3 max-w-3xl text-sm text-espark-muted">
          Everyone subscribed to the CRM, in the two shapes you sell: one person
          buying tools for themselves, or a company whose own sub-admin manages
          their staff. Each subscription runs its own database.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Single-person" value={totals.individual} sub="subscriptions" />
          <Stat label="Company" value={totals.company} sub="subscriptions" />
          <Stat
            label="Expiring"
            value={totals.expiring}
            sub="within 30 days"
            alert={totals.expiring > 0}
          />
          <Stat
            label="Needs attention"
            value={totals.needsAttention}
            sub="provisioning or failed"
            alert={totals.needsAttention > 0}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            {notice}
          </p>
        )}

        {selling && (
          <SellForm
            kind={selling}
            tools={tools}
            busy={busy}
            canCreateDatabase={canCreateDatabase}
            onCancel={() => setSelling(null)}
            onDone={async (msg) => {
              setSelling(null);
              setNotice(msg);
              await refresh();
            }}
            onError={setError}
            setBusy={setBusy}
          />
        )}

        {/* ── Single-person subscriptions ──────────────────────────────── */}
        <Section
          title="Single-person subscriptions"
          blurb="One person, subscribing for themselves. No sub-admin and no staff — they are the only user, and what they bought is which tools they can open."
          count={individuals.length}
          action={{
            label: "Sell to a person",
            onClick: () => setSelling("individual"),
          }}
        >
          {individuals.length === 0 ? (
            <Empty>No single-person subscriptions yet.</Empty>
          ) : (
            individuals.map((s) => (
              <SubscriptionCard
                key={s.slug}
                sub={s}
                tools={tools}
                busy={busy}
                open={open === s.slug}
                onToggleOpen={() =>
                  setOpen((v) => (v === s.slug ? null : s.slug))
                }
                onStatus={setStatus}
                onToggleTool={toggleTool}
                onPatch={patch}
              />
            ))
          )}
        </Section>

        {/* ── Company subscriptions ────────────────────────────────────── */}
        <Section
          title="Company subscriptions"
          blurb="A company with its own sub-admin, who manages their users (presales, sales, projects) inside the tools you sell them."
          count={companies.length}
          action={{
            label: "Sell to a company",
            onClick: () => setSelling("company"),
          }}
        >
          {companies.length === 0 ? (
            <Empty>No company subscriptions yet.</Empty>
          ) : (
            companies.map((s) => (
              <SubscriptionCard
                key={s.slug}
                sub={s}
                tools={tools}
                busy={busy}
                open={open === s.slug}
                onToggleOpen={() =>
                  setOpen((v) => (v === s.slug ? null : s.slug))
                }
                onStatus={setStatus}
                onToggleTool={toggleTool}
                onPatch={patch}
              />
            ))
          )}
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  blurb,
  count,
  action,
  children,
}: {
  title: string;
  blurb: string;
  count: number;
  action: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-lg font-medium text-espark-ink">
            {title} ({count})
          </h2>
          <p className="mt-1 text-sm text-espark-muted">{blurb}</p>
        </div>
        <button
          onClick={action.onClick}
          className="flex-none rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white"
        >
          {action.label}
        </button>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-espark-border p-8 text-center text-sm text-espark-muted">
      {children}
    </p>
  );
}

function Stat({
  label,
  value,
  sub,
  alert = false,
}: {
  label: string;
  value: number;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        alert
          ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
          : "border-espark-border bg-espark-surface"
      }`}
    >
      <p className="text-2xl font-semibold tabular-nums text-espark-ink">
        {value}
      </p>
      <p className="mt-0.5 text-xs font-medium text-espark-ink">{label}</p>
      <p className="text-xs text-espark-muted">{sub}</p>
    </div>
  );
}

/** Creating a subscription. The fields differ by kind, so the copy does too. */
function SellForm({
  kind,
  tools,
  busy,
  canCreateDatabase,
  onCancel,
  onDone,
  onError,
  setBusy,
}: {
  kind: "individual" | "company";
  tools: Tool[];
  busy: boolean;
  canCreateDatabase: boolean;
  onCancel: () => void;
  onDone: (message: string) => Promise<void>;
  onError: (message: string) => void;
  setBusy: (v: boolean) => void;
}) {
  const individual = kind === "individual";
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [loginUsername, setLoginUsername] = useState(individual ? "" : "admin");
  const [loginPassword, setLoginPassword] = useState("");
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const field =
    "mt-1 w-full rounded-lg border border-espark-border bg-espark-canvas px-3 py-2 text-espark-ink outline-none focus:border-espark-primary";
  const label = "block text-sm font-medium text-espark-ink";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError("");
    setBusy(true);
    try {
      const res = await fetch("/api/crm-admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          slug,
          name,
          loginUsername,
          loginPassword,
          // No tick means every tool, which is what null records.
          tools: picked.length > 0 ? picked : null,
          databaseUrl: databaseUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create it");
      await onDone(
        individual
          ? `${name} is subscribed. ${loginUsername} must change their password at first sign-in.`
          : `${name} is subscribed. Their sub-admin ${loginUsername} must change their password at first sign-in.`,
      );
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded-2xl border border-espark-primary/40 bg-espark-surface p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-medium text-espark-ink">
          {individual
            ? "New single-person subscription"
            : "New company subscription"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-espark-muted hover:text-espark-ink"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1 text-sm text-espark-muted">
        {individual
          ? "One login, for the subscriber themselves. They will not be able to add anyone else."
          : "One login for their sub-admin, who then creates their own presales, sales and projects users."}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="sub-name">
            {individual ? "Person's name" : "Company name"}
          </label>
          <input
            id="sub-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={individual ? "Layla Haddad" : "Acme Trading Co."}
            required
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="sub-slug">
            Sign-in code
          </label>
          <input
            id="sub-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={individual ? "layla" : "acme"}
            required
            className={field}
          />
          <p className="mt-1 text-xs text-espark-muted">
            Permanent. Typed at sign-in, and it names their stored files.
            Lowercase letters, digits, hyphens.
          </p>
        </div>
        <div>
          <label className={label} htmlFor="sub-user">
            {individual ? "Their username" : "Sub-admin username"}
          </label>
          <input
            id="sub-user"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            required
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="sub-pass">
            First password
          </label>
          <input
            id="sub-pass"
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            minLength={8}
            required
            className={field}
          />
          <p className="mt-1 text-xs text-espark-muted">
            They are forced to replace it at first sign-in.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className={label}>Tools included</p>
        <p className="mt-1 text-xs text-espark-muted">
          {individual
            ? "Tick one for a single-tool subscription, or several for a multi-tool one. Leave all unticked to include everything."
            : "What their sub-admin may grant their staff. Leave all unticked to include everything."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {tools.map((t) => {
            const on = picked.includes(t.id as string);
            return (
              <button
                key={t.id}
                type="button"
                title={t.blurb}
                aria-pressed={on}
                onClick={() =>
                  setPicked((p) =>
                    on
                      ? p.filter((x) => x !== (t.id as string))
                      : [...p, t.id as string],
                  )
                }
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  on
                    ? "border-espark-primary bg-espark-primary/10 text-espark-ink"
                    : "border-espark-border text-espark-muted"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <label className={label} htmlFor="sub-db">
          Database connection string{" "}
          {canCreateDatabase && (
            <span className="font-normal text-espark-muted">— optional</span>
          )}
        </label>
        <input
          id="sub-db"
          value={databaseUrl}
          onChange={(e) => setDatabaseUrl(e.target.value)}
          placeholder="postgres://user:password@host/dbname"
          required={!canCreateDatabase}
          className={`${field} font-mono text-xs`}
        />
        <p className="mt-1 text-xs text-espark-muted">
          {canCreateDatabase
            ? "Leave blank to create one automatically. Every subscription gets its own database, individual or company."
            : "Create a database for them and paste its connection string. Set PROVISION_DATABASE_URL to have this done for you."}
        </p>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-5 rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? "Creating…" : individual ? "Create subscription" : "Create subscription"}
      </button>
    </form>
  );
}

/** How much of the product a single-person subscription reaches. */
function AccessBadge({ sub }: { sub: Subscription }) {
  const text =
    sub.toolAccess === "all"
      ? "All tools"
      : sub.toolAccess === "single"
        ? "Single tool"
        : `Multi tool · ${sub.tools?.length ?? 0}`;
  return (
    <span className="rounded-full border border-espark-border bg-espark-soft px-2.5 py-0.5 text-xs text-espark-ink">
      {text}
    </span>
  );
}

function SubscriptionCard({
  sub: s,
  tools,
  busy,
  open,
  onToggleOpen,
  onStatus,
  onToggleTool,
  onPatch,
}: {
  sub: Subscription;
  tools: Tool[];
  busy: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onStatus: (s: Subscription, status: string) => void;
  onToggleTool: (s: Subscription, id: string) => void;
  onPatch: (
    s: Subscription,
    body: Record<string, unknown>,
    describe: (s: Subscription) => string,
  ) => Promise<void>;
}) {
  const individual = s.kind === "individual";
  const [plan, setPlan] = useState(s.plan);
  const [seatLimit, setSeatLimit] = useState(
    s.seatLimit === null ? "" : String(s.seatLimit),
  );
  const [renewalAt, setRenewalAt] = useState(
    s.renewalAt ? s.renewalAt.slice(0, 10) : "",
  );
  const [contactName, setContactName] = useState(s.contactName);
  const [contactEmail, setContactEmail] = useState(s.contactEmail);
  const [notes, setNotes] = useState(s.notes);

  const field =
    "mt-1 w-full rounded-lg border border-espark-border bg-espark-canvas px-3 py-2 text-sm text-espark-ink outline-none focus:border-espark-primary";
  const label = "block text-xs font-medium text-espark-ink";

  function save() {
    void onPatch(
      s,
      {
        plan: plan.trim() || "standard",
        // Omitted for an individual: their cap is 1 by definition, not a
        // number to type.
        ...(individual
          ? {}
          : { seatLimit: seatLimit.trim() === "" ? null : Number(seatLimit) }),
        renewalAt: renewalAt.trim() === "" ? null : renewalAt,
        contactName,
        contactEmail,
        notes,
      },
      (x) => `${x.name}'s subscription updated.`,
    );
  }

  return (
    <div className="rounded-2xl border border-espark-border bg-espark-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-espark-ink">{s.name}</p>
          <p className="font-mono text-xs text-espark-muted">{s.slug}</p>
          {(s.contactName || s.contactEmail) && (
            <p className="mt-1 text-xs text-espark-muted">
              {s.contactName}
              {s.contactName && s.contactEmail && " · "}
              {s.contactEmail}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AccessBadge sub={s} />
          <span className="rounded-full border border-espark-border bg-espark-soft px-2.5 py-0.5 text-xs text-espark-ink">
            {s.plan}
          </span>
          {s.renewalState !== "none" && s.renewalAt && (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                s.renewalState === "expired"
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                  : s.renewalState === "expiring"
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                    : "border-espark-border bg-espark-soft text-espark-muted"
              }`}
            >
              {s.renewalState === "expired"
                ? `Expired ${Math.abs(s.daysToRenewal ?? 0)}d ago`
                : s.renewalState === "expiring"
                  ? `Renews in ${s.daysToRenewal}d`
                  : `Renews ${new Date(s.renewalAt).toLocaleDateString()}`}
            </span>
          )}
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              STATUS_STYLES[s.status] ?? STATUS_STYLES.provisioning
            }`}
          >
            {s.status}
          </span>
          {s.status === "active" && (
            <button
              disabled={busy}
              onClick={() => onStatus(s, "suspended")}
              className="rounded-lg border border-espark-border px-3 py-1.5 text-sm text-espark-ink disabled:opacity-60"
            >
              Suspend
            </button>
          )}
          {s.status === "suspended" && (
            <button
              disabled={busy}
              onClick={() => onStatus(s, "active")}
              className="rounded-lg border border-espark-border px-3 py-1.5 text-sm text-espark-ink disabled:opacity-60"
            >
              Reinstate
            </button>
          )}
          <button
            onClick={onToggleOpen}
            aria-expanded={open}
            className="rounded-lg border border-espark-border px-3 py-1.5 text-sm text-espark-ink"
          >
            {open ? "Close" : "Manage"}
          </button>
        </div>
      </div>

      {/* Usage. The question is different per kind, so only the one that
          makes sense for this shape is asked. */}
      <p className="mt-3 text-xs text-espark-muted">
        {s.usageError
          ? `Account count unavailable — ${s.usageError}`
          : s.usersInUse === null
            ? "Not provisioned yet."
            : individual
              ? `${s.usersInUse} login`
              : `${s.usersInUse}${s.seatLimit === null ? "" : `/${s.seatLimit}`} staff accounts${
                  s.seatsFull ? " · at limit, their sub-admin cannot add more" : ""
                }`}
      </p>

      {open && (
        <>
          <div className="mt-4 border-t border-espark-border pt-4">
            <p className="text-sm font-medium text-espark-ink">Tools included</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs text-espark-muted">
                {individual
                  ? "One tool is a single-tool subscription; several is multi-tool."
                  : "The ceiling their sub-admin grants staff within — they cannot grant a tool you have not sold."}
              </p>
              <button
                disabled={busy || s.tools === null}
                onClick={() =>
                  void onPatch(s, { tools: null }, (x) => `${x.name} has every tool.`)
                }
                className="text-xs text-espark-primary disabled:text-espark-muted"
              >
                {s.tools === null ? "All tools" : "Include all"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {tools.map((t) => {
                const on = s.tools === null || s.tools.includes(t.id as string);
                return (
                  <button
                    key={t.id}
                    disabled={busy}
                    title={t.blurb}
                    aria-pressed={on}
                    onClick={() => onToggleTool(s, t.id as string)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60 ${
                      on
                        ? "border-espark-primary bg-espark-primary/10 text-espark-ink"
                        : "border-espark-border text-espark-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 border-t border-espark-border pt-4">
            <p className="text-sm font-medium text-espark-ink">Terms</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={label} htmlFor={`plan-${s.slug}`}>
                  Plan
                </label>
                <input
                  id={`plan-${s.slug}`}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className={field}
                />
              </div>
              {/* An individual has exactly one login by definition, so there is
                  no cap to type — showing the field would invite setting a
                  number the model ignores. */}
              {individual ? (
                <div>
                  <p className={label}>Accounts</p>
                  <p className="mt-1 rounded-lg border border-dashed border-espark-border px-3 py-2 text-sm text-espark-muted">
                    1 — single person
                  </p>
                </div>
              ) : (
                <div>
                  <label className={label} htmlFor={`seats-${s.slug}`}>
                    Staff limit
                  </label>
                  <input
                    id={`seats-${s.slug}`}
                    value={seatLimit}
                    onChange={(e) => setSeatLimit(e.target.value)}
                    inputMode="numeric"
                    placeholder="uncapped"
                    className={field}
                  />
                </div>
              )}
              <div>
                <label className={label} htmlFor={`renew-${s.slug}`}>
                  Renews on
                </label>
                <input
                  id={`renew-${s.slug}`}
                  type="date"
                  value={renewalAt}
                  onChange={(e) => setRenewalAt(e.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`cname-${s.slug}`}>
                  Contact name
                </label>
                <input
                  id={`cname-${s.slug}`}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`cmail-${s.slug}`}>
                  Contact email
                </label>
                <input
                  id={`cmail-${s.slug}`}
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`notes-${s.slug}`}>
                  Notes
                </label>
                <input
                  id={`notes-${s.slug}`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={field}
                />
              </div>
            </div>
            <button
              disabled={busy}
              onClick={save}
              className="mt-3 rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save terms"}
            </button>
          </div>
        </>
      )}

      {s.provisionError && (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {s.provisionError} — creating it again with the same code retries from
          where it stopped.
        </p>
      )}
    </div>
  );
}
