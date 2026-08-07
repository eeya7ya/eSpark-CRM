import { AsyncLocalStorage } from "node:async_hooks";
import type { Workspace } from "./controlDb";

/**
 * Which workspace the current request belongs to.
 *
 * ── Why this shape ─────────────────────────────────────────────────────────
 * Every database call in the app goes through `sql()` in db.ts — 258 of them.
 * Rather than thread a workspace argument through all of those call sites (and
 * rely on nobody ever forgetting one), the workspace is bound once per request
 * and `sql()` reads it from here. `sql()` stays synchronous, so no call site
 * changes at all, and a query cannot accidentally be written without a
 * workspace: there is no un-scoped client to reach for.
 *
 * ── Fail closed ────────────────────────────────────────────────────────────
 * When no workspace is bound, `requireBoundWorkspace()` throws. It never falls
 * back to a default database. A missing binding is a loud 500 on one request;
 * a silent fallback would serve one client's data to another, which is the one
 * failure this design exists to prevent.
 *
 * ── Binding ────────────────────────────────────────────────────────────────
 * Two ways in:
 *   • `runInWorkspace(ws, fn)` — explicit, for work with no session to read:
 *     login (which resolves the workspace before authenticating), the backup
 *     cron fanning out over every workspace, provisioning, and scripts.
 *   • `bindWorkspace(ws)` — ambient, called by `getSessionUser()` once it has
 *     verified the session JWT. Uses `enterWith` so it needs no callback
 *     wrapper, which is what lets 119 route handlers stay untouched.
 *
 * `bindWorkspace` mutating the current async context is the sharp edge here,
 * so it is backed up rather than trusted: every `SessionUser` carries its own
 * `workspaceSlug`, and `requireUser()` asserts the bound slug still matches it
 * before any query runs. A stale binding therefore surfaces as a refused
 * request, not as cross-workspace reads.
 */

export interface WorkspaceBinding {
  id: number;
  slug: string;
  name: string;
  databaseUrl: string;
  r2Prefix: string;
  /** Licensed modules, or null for no restriction. See controlDb.Workspace. */
  modules: string[] | null;
}

const storage = new AsyncLocalStorage<WorkspaceBinding>();

/**
 * Project the fields the binding needs. `Workspace` is a structural superset
 * of `WorkspaceBinding`, so this accepts either and deliberately drops the
 * rest — nothing downstream of a bound request should be reading a
 * workspace's status or provisioning error.
 */
export function toBinding(ws: Workspace | WorkspaceBinding): WorkspaceBinding {
  return {
    id: ws.id,
    slug: ws.slug,
    name: ws.name,
    databaseUrl: ws.databaseUrl,
    r2Prefix: ws.r2Prefix,
    modules: ws.modules,
  };
}

/** Run `fn` with `ws` bound. The binding is scoped to the callback. */
export function runInWorkspace<T>(
  ws: Workspace | WorkspaceBinding,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(toBinding(ws), fn);
}

/**
 * Bind `ws` for the remainder of the current async context. Used where there
 * is no convenient callback boundary to wrap — chiefly `getSessionUser()`,
 * which is called by both route handlers and server components.
 */
export function bindWorkspace(ws: Workspace | WorkspaceBinding): void {
  storage.enterWith(toBinding(ws));
}

/** The bound workspace, or null when there is none. */
export function getBoundWorkspace(): WorkspaceBinding | null {
  return storage.getStore() ?? null;
}

/** Error thrown when a workspace query is attempted with nothing bound. */
export const NO_WORKSPACE_BOUND = "NO_WORKSPACE_BOUND";

/**
 * The bound workspace, or throw. Callers that reach the database must go
 * through this — there is deliberately no default.
 */
export function requireBoundWorkspace(): WorkspaceBinding {
  const ws = storage.getStore();
  if (!ws) throw new Error(NO_WORKSPACE_BOUND);
  return ws;
}
