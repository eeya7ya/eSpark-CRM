"use client";

import { useCallback, useEffect, useState } from "react";
// Type-only: erased at build, so the server module behind these shapes never
// reaches the browser bundle.
import type { Subscriber, SubscriberTotals, Tool } from "@/lib/subscribers";

/**
 * Subscribers — the CRM owner's control surface, inside the admin page.
 *
 * Two shapes, laid out as two sections rather than one filtered list, because
 * they answer different questions:
 *
 *   SINGLE PERSON — one human subscribing for themselves. No sub-admin, no
 *                   staff. What they bought is which tools they can open: a
 *                   SINGLE tool, or SEVERAL.
 *   COMPANY       — a company whose own sub-admin manages their users
 *                   (presales, sales, projects) inside the tools bought.
 *
 * "How many staff?" is meaningless for an individual and "which single tool?"
 * is meaningless for a company, so each section asks only what its own shape
 * can answer.
 */

const STATUS_STYLES: Record<string, string> = {
  active:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  suspended:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
};

export default function SubscribersAdminPanel({
  readOnly = false,
}: {
  readOnly?: boolean;
}) {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [totals, setTotals] = useState<SubscriberTotals | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState<"individual" | "company" | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/subscribers", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load subscribers");
      setSubs(data.subscribers ?? []);
      setTotals(data.totals ?? null);
      setTools(data.tools ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(
    sub: Subscriber,
    body: Record<string, unknown>,
    describe: string,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/subscribers/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
      setNotice(describe);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(sub: Subscriber) {
    if (
      !window.confirm(
        `Remove "${sub.name}"? This deletes the subscription record. Their data is not touched.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/subscribers/${sub.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      await load();
      setNotice(`${sub.name} removed.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const individuals = subs.filter((s) => s.kind === "individual");
  const companies = subs.filter((s) => s.kind === "company");

  return (
    <section className="space-y-6">
      {totals && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Single-person" value={totals.individual} />
          <Stat label="Company" value={totals.company} />
          <Stat label="Active" value={totals.active} />
          <Stat label="Suspended" value={totals.suspended} />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {adding && (
        <AddForm
          kind={adding}
          tools={tools}
          busy={busy}
          onCancel={() => setAdding(null)}
          onCreated={async (msg) => {
            setAdding(null);
            setNotice(msg);
            await load();
          }}
          onError={setError}
          setBusy={setBusy}
        />
      )}

      <Group
        title="Single-person subscriptions"
        blurb="One person, subscribing for themselves. No sub-admin and no staff — they are the only user, and what they bought is which tools they can open."
        count={individuals.length}
        actionLabel="Add a person"
        onAction={readOnly ? undefined : () => setAdding("individual")}
      >
        {loading ? (
          <Skeleton />
        ) : individuals.length === 0 ? (
          <Empty>No single-person subscriptions yet.</Empty>
        ) : (
          individuals.map((s) => (
            <Card
              key={s.id}
              sub={s}
              tools={tools}
              busy={busy}
              readOnly={readOnly}
              open={open === s.id}
              onToggle={() => setOpen((v) => (v === s.id ? null : s.id))}
              onPatch={patch}
              onRemove={remove}
            />
          ))
        )}
      </Group>

      <Group
        title="Company subscriptions"
        blurb="A company with its own sub-admin, who manages their users (presales, sales, projects) inside the tools you sell them."
        count={companies.length}
        actionLabel="Add a company"
        onAction={readOnly ? undefined : () => setAdding("company")}
      >
        {loading ? (
          <Skeleton />
        ) : companies.length === 0 ? (
          <Empty>No company subscriptions yet.</Empty>
        ) : (
          companies.map((s) => (
            <Card
              key={s.id}
              sub={s}
              tools={tools}
              busy={busy}
              readOnly={readOnly}
              open={open === s.id}
              onToggle={() => setOpen((v) => (v === s.id ? null : s.id))}
              onPatch={patch}
              onRemove={remove}
            />
          ))
        )}
      </Group>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-espark-border bg-espark-surface p-4">
      <p className="text-2xl font-bold tabular-nums text-espark-ink">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-espark-ink/55">{label}</p>
    </div>
  );
}

function Group({
  title,
  blurb,
  count,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  blurb: string;
  count: number;
  actionLabel: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-base font-bold text-espark-ink">
            {title} ({count})
          </h3>
          <p className="mt-0.5 text-sm text-espark-ink/60">{blurb}</p>
        </div>
        {onAction && (
          <button
            onClick={onAction}
            className="flex-none rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white"
          >
            {actionLabel}
          </button>
        )}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-espark-border p-8 text-center text-sm text-espark-ink/45">
      {children}
    </p>
  );
}

function Skeleton() {
  return (
    <div className="h-20 animate-pulse rounded-2xl border border-espark-border bg-espark-soft/50" />
  );
}

function AddForm({
  kind,
  tools,
  busy,
  onCancel,
  onCreated,
  onError,
  setBusy,
}: {
  kind: "individual" | "company";
  tools: Tool[];
  busy: boolean;
  onCancel: () => void;
  onCreated: (message: string) => Promise<void>;
  onError: (message: string) => void;
  setBusy: (v: boolean) => void;
}) {
  const individual = kind === "individual";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [seatLimit, setSeatLimit] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const field =
    "mt-1 w-full rounded-lg border border-espark-border bg-espark-surface px-3 py-2 text-sm text-espark-ink outline-none focus:border-espark-primary";
  const label = "block text-xs font-medium text-espark-ink";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name,
          slug,
          contactEmail,
          // No tick means every tool, which is what null records.
          tools: picked.length > 0 ? picked : null,
          seatLimit:
            individual || seatLimit.trim() === "" ? null : Number(seatLimit),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add");
      await onCreated(`${name} added.`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-espark-primary/40 bg-espark-surface p-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold text-espark-ink">
          {individual ? "New single-person subscription" : "New company subscription"}
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-espark-ink/50 hover:text-espark-ink"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1 text-xs text-espark-ink/55">
        {individual
          ? "They are the only user — there is no sub-admin and no staff."
          : "Their own sub-admin manages their presales, sales and projects users."}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            Route
          </label>
          <input
            id="sub-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={individual ? "layla" : "acme"}
            required
            className={`${field} font-mono`}
          />
          <p className="mt-1 text-[11px] text-espark-ink/45">
            Lowercase letters, digits, hyphens.
          </p>
        </div>
        <div>
          <label className={label} htmlFor="sub-mail">
            Contact email
          </label>
          <input
            id="sub-mail"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className={field}
          />
        </div>
        {individual ? (
          <div>
            <p className={label}>Accounts</p>
            <p className="mt-1 rounded-lg border border-dashed border-espark-border px-3 py-2 text-sm text-espark-ink/50">
              1 — single person
            </p>
          </div>
        ) : (
          <div>
            <label className={label} htmlFor="sub-seats">
              Staff limit
            </label>
            <input
              id="sub-seats"
              value={seatLimit}
              onChange={(e) => setSeatLimit(e.target.value)}
              inputMode="numeric"
              placeholder="uncapped"
              className={field}
            />
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className={label}>Tools included</p>
        <p className="mt-1 text-[11px] text-espark-ink/45">
          {individual
            ? "Tick one for a single-tool subscription, several for multi-tool. None ticked means every tool."
            : "What their sub-admin may grant staff. None ticked means every tool."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
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
                    : "border-espark-border text-espark-ink/55"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? "Adding…" : "Add subscription"}
      </button>
    </form>
  );
}

function AccessBadge({ sub }: { sub: Subscriber }) {
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

function Card({
  sub: s,
  tools,
  busy,
  readOnly,
  open,
  onToggle,
  onPatch,
  onRemove,
}: {
  sub: Subscriber;
  tools: Tool[];
  busy: boolean;
  readOnly: boolean;
  open: boolean;
  onToggle: () => void;
  onPatch: (
    s: Subscriber,
    body: Record<string, unknown>,
    describe: string,
  ) => Promise<void>;
  onRemove: (s: Subscriber) => void;
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
    "mt-1 w-full rounded-lg border border-espark-border bg-espark-surface px-3 py-2 text-sm text-espark-ink outline-none focus:border-espark-primary";
  const label = "block text-xs font-medium text-espark-ink";

  function toggleTool(id: string) {
    // null means every tool, so the first untick must materialise the full
    // list and remove from it — otherwise the click reads as "only this one".
    const current = s.tools ?? tools.map((t) => t.id as string);
    const next = current.includes(id)
      ? current.filter((t) => t !== id)
      : [...current, id];
    void onPatch(s, { tools: next }, `${s.name}'s tools updated.`);
  }

  return (
    <div className="rounded-2xl border border-espark-border bg-espark-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-espark-ink">{s.name}</p>
          <p className="font-mono text-xs text-espark-ink/50">/{s.slug}</p>
          {(s.contactName || s.contactEmail) && (
            <p className="mt-0.5 text-xs text-espark-ink/55">
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
          {!individual && (
            <span className="rounded-full border border-espark-border bg-espark-soft px-2.5 py-0.5 text-xs text-espark-ink">
              {s.seatLimit === null ? "uncapped" : `${s.seatLimit} staff`}
            </span>
          )}
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLES[s.status]}`}
          >
            {s.status}
          </span>
          {!readOnly && (
            <button
              disabled={busy}
              onClick={() =>
                void onPatch(
                  s,
                  { status: s.status === "active" ? "suspended" : "active" },
                  `${s.name} is now ${s.status === "active" ? "suspended" : "active"}.`,
                )
              }
              className="rounded-lg border border-espark-border px-3 py-1.5 text-sm text-espark-ink disabled:opacity-60"
            >
              {s.status === "active" ? "Suspend" : "Reinstate"}
            </button>
          )}
          <button
            onClick={onToggle}
            aria-expanded={open}
            className="rounded-lg border border-espark-border px-3 py-1.5 text-sm text-espark-ink"
          >
            {open ? "Close" : "Manage"}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="mt-4 border-t border-espark-border pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-espark-ink">
                Tools included
              </p>
              <button
                disabled={busy || readOnly || s.tools === null}
                onClick={() =>
                  void onPatch(s, { tools: null }, `${s.name} has every tool.`)
                }
                className="text-xs text-espark-primary disabled:text-espark-ink/40"
              >
                {s.tools === null ? "All tools" : "Include all"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {tools.map((t) => {
                const on = s.tools === null || s.tools.includes(t.id as string);
                return (
                  <button
                    key={t.id}
                    disabled={busy || readOnly}
                    title={t.blurb}
                    aria-pressed={on}
                    onClick={() => toggleTool(t.id as string)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60 ${
                      on
                        ? "border-espark-primary bg-espark-primary/10 text-espark-ink"
                        : "border-espark-border text-espark-ink/55"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 border-t border-espark-border pt-4">
            <p className="text-sm font-semibold text-espark-ink">Terms</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={label} htmlFor={`plan-${s.id}`}>Plan</label>
                <input
                  id={`plan-${s.id}`}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  disabled={readOnly}
                  className={field}
                />
              </div>
              {individual ? (
                <div>
                  <p className={label}>Accounts</p>
                  <p className="mt-1 rounded-lg border border-dashed border-espark-border px-3 py-2 text-sm text-espark-ink/50">
                    1 — single person
                  </p>
                </div>
              ) : (
                <div>
                  <label className={label} htmlFor={`seats-${s.id}`}>
                    Staff limit
                  </label>
                  <input
                    id={`seats-${s.id}`}
                    value={seatLimit}
                    onChange={(e) => setSeatLimit(e.target.value)}
                    inputMode="numeric"
                    placeholder="uncapped"
                    disabled={readOnly}
                    className={field}
                  />
                </div>
              )}
              <div>
                <label className={label} htmlFor={`renew-${s.id}`}>
                  Renews on
                </label>
                <input
                  id={`renew-${s.id}`}
                  type="date"
                  value={renewalAt}
                  onChange={(e) => setRenewalAt(e.target.value)}
                  disabled={readOnly}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`cname-${s.id}`}>
                  Contact name
                </label>
                <input
                  id={`cname-${s.id}`}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  disabled={readOnly}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`cmail-${s.id}`}>
                  Contact email
                </label>
                <input
                  id={`cmail-${s.id}`}
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  disabled={readOnly}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`notes-${s.id}`}>Notes</label>
                <input
                  id={`notes-${s.id}`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={readOnly}
                  className={field}
                />
              </div>
            </div>
            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() =>
                    void onPatch(
                      s,
                      {
                        plan,
                        ...(individual
                          ? {}
                          : {
                              seatLimit:
                                seatLimit.trim() === "" ? null : Number(seatLimit),
                            }),
                        renewalAt: renewalAt.trim() === "" ? null : renewalAt,
                        contactName,
                        contactEmail,
                        notes,
                      },
                      `${s.name}'s terms saved.`,
                    )
                  }
                  className="rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save terms"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => onRemove(s)}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
