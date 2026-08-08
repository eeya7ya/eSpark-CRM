"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
// Type-only: erased at build, so the server modules behind these shapes never
// reach the browser bundle.
import type { CustomerRow, PlatformSummary } from "@/lib/platformOverview";

/**
 * The operator console — management and control across every app customer.
 *
 * Three tiers of administration exist in this product, and it is worth being
 * precise about which one this is:
 *
 *   1. THIS console — the operator (you) over every customer company: who they
 *      are, what they have bought, how much of it they are using, and whether
 *      they are still paying. One row per customer.
 *   2. Each customer's own `/admin` — their administrator over their own
 *      staff: creating sales and presales accounts, granting module roles.
 *      Bounded by what you licensed them here.
 *   3. Each user's own access — the module roles their admin granted.
 *
 * A subscription is set here and enforced downwards: `modules` caps which
 * parts of the product a customer's admin may grant at all, and `seat_limit`
 * caps how many accounts they may create. Neither can be raised from inside
 * the customer's own workspace, which is the whole point of the split.
 *
 * It shows what a customer IS and how much of their plan they use — never what
 * is inside their workspace. The single number read from a customer database
 * is their account count, because that is the quantity being sold.
 */

/**
 * Modules a workspace can be licensed for, with the labels an operator would
 * recognise. `admin` is deliberately absent — every workspace administers its
 * own users, so it is not something to sell or withhold.
 */
const LICENSABLE: Array<{ id: string; label: string }> = [
  { id: "crm", label: "CRM & leads" },
  { id: "pricing", label: "Material pricing" },
  { id: "projects", label: "Projects" },
  { id: "storage", label: "Storage" },
  { id: "catalogue", label: "Catalogue editor" },
  { id: "delivery", label: "Delivery" },
  { id: "showroom", label: "Showroom" },
  { id: "accountant", label: "Accounting" },
];

const STATUS_STYLES: Record<string, string> = {
  active:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  suspended:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  failed:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  provisioning: "border-espark-border bg-espark-soft text-espark-muted",
};

/** Filters over the customer list, each answering "who needs me right now?". */
type Filter = "all" | "active" | "suspended" | "seats" | "renewal" | "unhealthy";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "suspended", label: "Suspended" },
  { id: "seats", label: "At seat limit" },
  { id: "renewal", label: "Expiring" },
  { id: "unhealthy", label: "Needs attention" },
];

function matchesFilter(c: CustomerRow, f: Filter): boolean {
  switch (f) {
    case "active":
      return c.status === "active";
    case "suspended":
      return c.status === "suspended";
    case "seats":
      return c.seatsFull;
    case "renewal":
      return c.renewalState === "expiring" || c.renewalState === "expired";
    case "unhealthy":
      return c.status === "provisioning" || c.status === "failed";
    default:
      return true;
  }
}

export default function PlatformConsole({
  adminName,
  initialCustomers,
  initialSummary,
  canCreateDatabase,
}: {
  adminName: string;
  initialCustomers: CustomerRow[];
  initialSummary: PlatformSummary;
  /** True when PROVISION_DATABASE_URL is set, so the app can create databases. */
  canCreateDatabase: boolean;
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  /** Slug of the customer whose subscription editor is open. */
  const [editing, setEditing] = useState<string | null>(null);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [databaseUrl, setDatabaseUrl] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter(
      (c) =>
        matchesFilter(c, filter) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          c.contactEmail.toLowerCase().includes(q)),
    );
  }, [customers, filter, query]);

  async function refresh() {
    const res = await fetch("/api/platform/workspaces");
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.customers)) {
      setCustomers(data.customers as CustomerRow[]);
      if (data.summary) setSummary(data.summary as PlatformSummary);
    }
  }

  /** One PATCH helper for every subscription field. */
  async function patch(
    target: CustomerRow,
    body: Record<string, unknown>,
    describe: (c: CustomerRow) => string,
  ) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/platform/workspaces/${target.slug}`, {
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

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/platform/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name,
          adminUsername,
          adminPassword,
          databaseUrl: databaseUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create workspace");
      setNotice(
        `Workspace "${slug}" is ready. ${adminUsername} must change their password at first sign-in.`,
      );
      setSlug("");
      setName("");
      setAdminPassword("");
      setDatabaseUrl("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(target: CustomerRow, status: string) {
    if (
      status === "suspended" &&
      !window.confirm(
        `Suspend "${target.name}"? Everyone signed into it is signed out immediately and cannot sign back in until it is reinstated. No data is deleted.`,
      )
    ) {
      return;
    }
    await patch(target, { status }, (c) => `${c.name} is now ${status}.`);
  }

  function toggleModule(target: CustomerRow, id: string) {
    // null means "everything", so the first time an operator unticks a box we
    // have to materialise the full list and remove from it — otherwise the
    // click would read as "license only this one".
    const current = target.modules ?? LICENSABLE.map((m) => m.id);
    const next = current.includes(id)
      ? current.filter((m) => m !== id)
      : [...current, id];
    void patch(
      target,
      { modules: next },
      (c) => `${c.name} is licensed for ${next.length} module(s).`,
    );
  }

  async function signOut() {
    await fetch("/api/platform/logout", { method: "POST" });
    router.push("/platform/login");
    router.refresh();
  }

  const field =
    "mt-1 w-full rounded-lg border border-espark-border bg-espark-canvas px-3 py-2 text-espark-ink outline-none focus:border-espark-primary";
  const label = "block text-sm font-medium text-espark-ink";

  return (
    <main className="min-h-screen bg-espark-canvas px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-espark-muted">
              eSpark
            </p>
            <h1 className="text-2xl font-semibold text-espark-ink">
              Platform console
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
          Every customer company, what they have licensed, and how much of it
          they are using. Each runs its own database; their own administrator
          manages their staff inside the limits you set here. This console never
          reads the leads, quotations or clients inside a workspace.
        </p>

        {/* Headline — the four states an operator acts on. */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Customers" value={summary.customers} sub={`${summary.active} active`} />
          <Stat label="Accounts in use" value={summary.totalSeatsUsed} sub="across all customers" />
          <Stat
            label="At seat limit"
            value={summary.atSeatLimit}
            sub="cannot add staff"
            alert={summary.atSeatLimit > 0}
          />
          <Stat
            label="Expiring"
            value={summary.expiring}
            sub="within 30 days"
            alert={summary.expiring > 0}
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

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-espark-ink">
            Customers ({shown.length}
            {shown.length !== customers.length && ` of ${customers.length}`})
          </h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white"
          >
            {showForm ? "Cancel" : "New customer"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === f.id
                  ? "border-espark-primary bg-espark-primary/10 text-espark-ink"
                  : "border-espark-border text-espark-muted hover:text-espark-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code or contact…"
            aria-label="Search customers"
            className="ml-auto w-full max-w-xs rounded-lg border border-espark-border bg-espark-canvas px-3 py-1.5 text-sm text-espark-ink outline-none focus:border-espark-primary"
          />
        </div>

        {showForm && (
          <form
            onSubmit={createWorkspace}
            className="mt-4 rounded-2xl border border-espark-border bg-espark-surface p-6"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="ws-slug">
                  Workspace code
                </label>
                <input
                  id="ws-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="acme"
                  required
                  className={field}
                />
                <p className="mt-1 text-xs text-espark-muted">
                  Permanent. Staff type this to sign in, and it names the
                  workspace&rsquo;s files. Lowercase letters, digits, hyphens.
                </p>
              </div>
              <div>
                <label className={label} htmlFor="ws-name">
                  Company name
                </label>
                <input
                  id="ws-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Trading Co."
                  required
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor="ws-admin">
                  First admin username
                </label>
                <input
                  id="ws-admin"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  required
                  className={field}
                />
                <p className="mt-1 text-xs text-espark-muted">
                  This is the person who then creates their own sales and
                  presales staff.
                </p>
              </div>
              <div>
                <label className={label} htmlFor="ws-pass">
                  First admin password
                </label>
                <input
                  id="ws-pass"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  minLength={8}
                  required
                  className={field}
                />
                <p className="mt-1 text-xs text-espark-muted">
                  They are forced to replace it at first sign-in.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className={label} htmlFor="ws-db">
                Database connection string{" "}
                {canCreateDatabase && (
                  <span className="font-normal text-espark-muted">
                    — optional
                  </span>
                )}
              </label>
              <input
                id="ws-db"
                value={databaseUrl}
                onChange={(e) => setDatabaseUrl(e.target.value)}
                placeholder="postgres://user:password@host/dbname"
                required={!canCreateDatabase}
                className={`${field} font-mono text-xs`}
              />
              <p className="mt-1 text-xs text-espark-muted">
                {canCreateDatabase
                  ? "Leave blank to create a new database automatically. Paste one to use a database you have already made."
                  : "Create a database for this client, then paste its connection string here. Set PROVISION_DATABASE_URL to have this created for you instead."}
              </p>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-5 rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create customer"}
            </button>
          </form>
        )}

        <ul className="mt-6 space-y-3">
          {shown.length === 0 && (
            <li className="rounded-2xl border border-dashed border-espark-border p-8 text-center text-sm text-espark-muted">
              {customers.length === 0
                ? "No customers yet."
                : "No customer matches this filter."}
            </li>
          )}
          {shown.map((c) => (
            <CustomerCard
              key={c.slug}
              customer={c}
              busy={busy}
              open={editing === c.slug}
              onToggleOpen={() =>
                setEditing((s) => (s === c.slug ? null : c.slug))
              }
              onStatus={setStatus}
              onToggleModule={toggleModule}
              onPatch={patch}
            />
          ))}
        </ul>
      </div>
    </main>
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

/** Seats used against the cap, as a bar plus a readable count. */
function SeatMeter({ customer }: { customer: CustomerRow }) {
  const { seatsUsed, seatLimit, usageError, seatsFull } = customer;
  if (usageError) {
    return (
      <p className="text-xs text-espark-muted">
        Seat count unavailable — {usageError}
      </p>
    );
  }
  if (seatsUsed === null) {
    return <p className="text-xs text-espark-muted">Not provisioned yet.</p>;
  }
  if (seatLimit === null) {
    return (
      <p className="text-xs text-espark-muted">
        <span className="font-semibold text-espark-ink tabular-nums">
          {seatsUsed}
        </span>{" "}
        {seatsUsed === 1 ? "account" : "accounts"} · uncapped
      </p>
    );
  }
  const pct = Math.min(100, Math.round((seatsUsed / seatLimit) * 100));
  return (
    <div>
      <p className="text-xs text-espark-muted">
        <span
          className={`font-semibold tabular-nums ${
            seatsFull ? "text-amber-700 dark:text-amber-300" : "text-espark-ink"
          }`}
        >
          {seatsUsed}/{seatLimit}
        </span>{" "}
        accounts used
        {seatsFull && " · at limit, they cannot add staff"}
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-espark-soft">
        <div
          className={`h-full rounded-full ${
            seatsFull ? "bg-amber-500" : "bg-espark-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RenewalBadge({ customer }: { customer: CustomerRow }) {
  const { renewalState, daysToRenewal, renewalAt } = customer;
  if (renewalState === "none" || !renewalAt) return null;
  const date = new Date(renewalAt).toLocaleDateString();
  const styles =
    renewalState === "expired"
      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      : renewalState === "expiring"
        ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        : "border-espark-border bg-espark-soft text-espark-muted";
  const text =
    renewalState === "expired"
      ? `Expired ${Math.abs(daysToRenewal ?? 0)}d ago`
      : renewalState === "expiring"
        ? `Renews in ${daysToRenewal}d`
        : `Renews ${date}`;
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${styles}`}>
      {text}
    </span>
  );
}

function CustomerCard({
  customer: c,
  busy,
  open,
  onToggleOpen,
  onStatus,
  onToggleModule,
  onPatch,
}: {
  customer: CustomerRow;
  busy: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onStatus: (c: CustomerRow, status: string) => void;
  onToggleModule: (c: CustomerRow, id: string) => void;
  onPatch: (
    c: CustomerRow,
    body: Record<string, unknown>,
    describe: (c: CustomerRow) => string,
  ) => Promise<void>;
}) {
  // Seeded from the row and only sent on save, so a half-typed seat limit is
  // never PATCHed on every keystroke.
  const [plan, setPlan] = useState(c.plan);
  const [seatLimit, setSeatLimit] = useState(
    c.seatLimit === null ? "" : String(c.seatLimit),
  );
  const [renewalAt, setRenewalAt] = useState(
    c.renewalAt ? c.renewalAt.slice(0, 10) : "",
  );
  const [contactName, setContactName] = useState(c.contactName);
  const [contactEmail, setContactEmail] = useState(c.contactEmail);
  const [notes, setNotes] = useState(c.notes);

  const field =
    "mt-1 w-full rounded-lg border border-espark-border bg-espark-canvas px-3 py-2 text-sm text-espark-ink outline-none focus:border-espark-primary";
  const label = "block text-xs font-medium text-espark-ink";

  function save() {
    void onPatch(
      c,
      {
        plan: plan.trim() || "standard",
        // Blank means uncapped, which the API stores as null.
        seat_limit: seatLimit.trim() === "" ? null : Number(seatLimit),
        renewal_at: renewalAt.trim() === "" ? null : renewalAt,
        contact_name: contactName,
        contact_email: contactEmail,
        notes,
      },
      (x) => `${x.name}'s subscription updated.`,
    );
  }

  return (
    <li className="rounded-2xl border border-espark-border bg-espark-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-espark-ink">{c.name}</p>
          <p className="font-mono text-xs text-espark-muted">{c.slug}</p>
          {(c.contactName || c.contactEmail) && (
            <p className="mt-1 text-xs text-espark-muted">
              {c.contactName}
              {c.contactName && c.contactEmail && " · "}
              {c.contactEmail}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-espark-border bg-espark-soft px-2.5 py-0.5 text-xs text-espark-ink">
            {c.plan}
          </span>
          <RenewalBadge customer={c} />
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              STATUS_STYLES[c.status] ?? STATUS_STYLES.provisioning
            }`}
          >
            {c.status}
          </span>
          {c.status === "active" && (
            <button
              disabled={busy}
              onClick={() => onStatus(c, "suspended")}
              className="rounded-lg border border-espark-border px-3 py-1.5 text-sm text-espark-ink disabled:opacity-60"
            >
              Suspend
            </button>
          )}
          {c.status === "suspended" && (
            <button
              disabled={busy}
              onClick={() => onStatus(c, "active")}
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

      <div className="mt-3">
        <SeatMeter customer={c} />
      </div>

      {open && (
        <>
          <div className="mt-4 border-t border-espark-border pt-4">
            <p className="text-sm font-medium text-espark-ink">Subscription</p>
            <p className="mt-1 text-xs text-espark-muted">
              The seat limit caps how many accounts their admin can create.
              Lowering it below their current headcount never signs anyone out —
              it only refuses the next new account.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={label} htmlFor={`plan-${c.slug}`}>
                  Plan
                </label>
                <input
                  id={`plan-${c.slug}`}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  placeholder="standard"
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`seats-${c.slug}`}>
                  Seat limit
                </label>
                <input
                  id={`seats-${c.slug}`}
                  value={seatLimit}
                  onChange={(e) => setSeatLimit(e.target.value)}
                  inputMode="numeric"
                  placeholder="uncapped"
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`renew-${c.slug}`}>
                  Renews on
                </label>
                <input
                  id={`renew-${c.slug}`}
                  type="date"
                  value={renewalAt}
                  onChange={(e) => setRenewalAt(e.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`cname-${c.slug}`}>
                  Contact name
                </label>
                <input
                  id={`cname-${c.slug}`}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`cmail-${c.slug}`}>
                  Contact email
                </label>
                <input
                  id={`cmail-${c.slug}`}
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`notes-${c.slug}`}>
                  Notes
                </label>
                <input
                  id={`notes-${c.slug}`}
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
              {busy ? "Saving…" : "Save subscription"}
            </button>
          </div>

          <div className="mt-4 border-t border-espark-border pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-espark-ink">
                Licensed modules
              </p>
              <button
                disabled={busy || c.modules === null}
                onClick={() =>
                  void onPatch(
                    c,
                    { modules: null },
                    (x) => `${x.name} is licensed for every module.`,
                  )
                }
                className="text-xs text-espark-primary disabled:text-espark-muted"
              >
                {c.modules === null ? "All modules" : "License all"}
              </button>
            </div>
            <p className="mt-1 text-xs text-espark-muted">
              Enforced above this company&rsquo;s own roles — their admin cannot
              grant staff a module you have not licensed.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {LICENSABLE.map((m) => {
                const on = c.modules === null || c.modules.includes(m.id);
                return (
                  <button
                    key={m.id}
                    disabled={busy}
                    onClick={() => onToggleModule(c, m.id)}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60 ${
                      on
                        ? "border-espark-primary bg-espark-primary/10 text-espark-ink"
                        : "border-espark-border text-espark-muted"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {c.provisionError && (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {c.provisionError} — creating it again with the same code retries from
          where it stopped.
        </p>
      )}
    </li>
  );
}
