"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface WorkspaceSummary {
  slug: string;
  name: string;
  status: string;
  r2Prefix: string;
  provisionError: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  active:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  suspended:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  failed:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  provisioning:
    "border-espark-border bg-espark-soft text-espark-muted",
};

/**
 * The operator console: create client workspaces, and suspend or reinstate
 * them. It shows what a workspace *is* — never what is inside one.
 */
export default function PlatformConsole({
  adminName,
  initialWorkspaces,
  canCreateDatabase,
}: {
  adminName: string;
  initialWorkspaces: WorkspaceSummary[];
  /** True when PROVISION_DATABASE_URL is set, so the app can create databases. */
  canCreateDatabase: boolean;
}) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [databaseUrl, setDatabaseUrl] = useState("");

  async function refresh() {
    const res = await fetch("/api/platform/workspaces");
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.workspaces)) {
      setWorkspaces(
        data.workspaces.map(
          (w: {
            slug: string;
            name: string;
            status: string;
            r2_prefix: string;
            provision_error: string | null;
          }) => ({
            slug: w.slug,
            name: w.name,
            status: w.status,
            r2Prefix: w.r2_prefix,
            provisionError: w.provision_error,
          }),
        ),
      );
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

  async function setStatus(target: WorkspaceSummary, status: string) {
    const verb = status === "suspended" ? "Suspend" : "Reinstate";
    if (
      status === "suspended" &&
      !window.confirm(
        `Suspend "${target.name}"? Everyone signed into it is signed out immediately and cannot sign back in until it is reinstated. No data is deleted.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/platform/workspaces/${target.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `${verb} failed`);
      await refresh();
      setNotice(`${target.name} is now ${status}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
      <div className="mx-auto max-w-4xl">
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

        <p className="mt-3 max-w-2xl text-sm text-espark-muted">
          Each workspace is one client company with its own database. This
          console manages what a workspace is — its name, status and branding —
          and has no access to the leads, quotations or clients inside one.
        </p>

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

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-medium text-espark-ink">
            Workspaces ({workspaces.length})
          </h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-espark-primary px-4 py-2 text-sm font-medium text-white"
          >
            {showForm ? "Cancel" : "New workspace"}
          </button>
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
              {busy ? "Creating…" : "Create workspace"}
            </button>
          </form>
        )}

        <ul className="mt-6 space-y-3">
          {workspaces.length === 0 && (
            <li className="rounded-2xl border border-dashed border-espark-border p-8 text-center text-sm text-espark-muted">
              No workspaces yet.
            </li>
          )}
          {workspaces.map((ws) => (
            <li
              key={ws.slug}
              className="rounded-2xl border border-espark-border bg-espark-surface p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-espark-ink">{ws.name}</p>
                  <p className="font-mono text-xs text-espark-muted">
                    {ws.slug}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      STATUS_STYLES[ws.status] ?? STATUS_STYLES.provisioning
                    }`}
                  >
                    {ws.status}
                  </span>
                  {ws.status === "active" && (
                    <button
                      disabled={busy}
                      onClick={() => setStatus(ws, "suspended")}
                      className="rounded-lg border border-espark-border px-3 py-1.5 text-sm text-espark-ink disabled:opacity-60"
                    >
                      Suspend
                    </button>
                  )}
                  {ws.status === "suspended" && (
                    <button
                      disabled={busy}
                      onClick={() => setStatus(ws, "active")}
                      className="rounded-lg border border-espark-border px-3 py-1.5 text-sm text-espark-ink disabled:opacity-60"
                    >
                      Reinstate
                    </button>
                  )}
                </div>
              </div>
              {ws.provisionError && (
                <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {ws.provisionError} — creating it again with the same code
                  retries from where it stopped.
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
