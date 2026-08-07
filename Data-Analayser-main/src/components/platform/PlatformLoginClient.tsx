"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Operator sign-in. Deliberately plain: this is the console that manages every
 * client's workspace, and dressing it in any one client's branding would
 * misrepresent whose system it is.
 */
export default function PlatformLoginClient() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/platform/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sign-in failed");
      router.push("/platform");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-espark-canvas px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-espark-border bg-espark-surface p-8 shadow-sm"
      >
        <p className="text-xs uppercase tracking-widest text-espark-muted">
          eSpark
        </p>
        <h1 className="mt-1 text-xl font-semibold text-espark-ink">
          Platform console
        </h1>
        <p className="mt-2 text-sm text-espark-muted">
          Manage client workspaces. This sign-in is separate from any
          workspace&rsquo;s own.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <label
          htmlFor="pu"
          className="mt-5 block text-sm font-medium text-espark-ink"
        >
          Username
        </label>
        <input
          id="pu"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-espark-border bg-espark-canvas px-3 py-2 text-espark-ink outline-none focus:border-espark-primary"
        />

        <label
          htmlFor="pp"
          className="mt-4 block text-sm font-medium text-espark-ink"
        >
          Password
        </label>
        <input
          id="pp"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-espark-border bg-espark-canvas px-3 py-2 text-espark-ink outline-none focus:border-espark-primary"
        />

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-espark-primary px-4 py-2.5 font-medium text-white transition-opacity disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
