import postgres, { type Sql } from "postgres";
import { encryptWithKey, decryptWithKey, keyReady } from "./secretBox";

/**
 * The control plane: the registry of workspaces, the platform-admin accounts
 * that manage them, and the audit trail of everything those admins do.
 *
 * This is a SEPARATE Postgres database from any workspace's. It holds no
 * customer data — no leads, quotations or clients ever live here — and no
 * workspace query is ever routed to it. `getControlSql()` is permanently
 * pinned to `CONTROL_DATABASE_URL`; the workspace-scoped client in `db.ts`
 * resolves somewhere else entirely.
 *
 * ── Single-workspace mode ──────────────────────────────────────────────────
 * When `CONTROL_DATABASE_URL` is unset the app runs exactly as it did before
 * workspaces existed: one database, from `DATABASE_URL`, no workspace
 * resolution. That keeps this an additive change — an existing deployment
 * upgrades without touching its environment, and opts in by setting the
 * variable. `hasControlPlane()` is the switch.
 */

const globalForControl = globalThis as unknown as {
  __esparkControlSql?: Sql;
  __esparkControlSchema?: Promise<void>;
};

/** Env var holding the AES key that protects stored connection strings. */
const WORKSPACE_KEY_ENV = "WORKSPACE_SECRET_KEY";

export type WorkspaceStatus =
  | "provisioning"
  | "active"
  | "suspended"
  | "failed";

export interface Workspace {
  id: number;
  slug: string;
  name: string;
  /** Decrypted Postgres connection string for this workspace's database. */
  databaseUrl: string;
  status: WorkspaceStatus;
  /** Key prefix isolating this workspace's objects in the shared R2 bucket. */
  r2Prefix: string;
  /** Pre-login branding: app name, login tagline, logo, colour palette. */
  branding: Record<string, unknown>;
  provisionError: string | null;
}

/**
 * Slugs that must never name a workspace: they collide with existing app
 * routes, with the platform surface itself, or with hostnames the platform
 * would want if workspaces later move to subdomains.
 */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "cdn",
  "dashboard",
  "login",
  "mail",
  "platform",
  "static",
  "status",
  "support",
  "www",
]);

/** True when a control plane is configured, i.e. the app is multi-workspace. */
export function hasControlPlane(): boolean {
  return Boolean(process.env.CONTROL_DATABASE_URL);
}

/** True when the key protecting stored connection strings is configured. */
export function workspaceKeyReady(): boolean {
  return keyReady(WORKSPACE_KEY_ENV);
}

/**
 * Validate a candidate workspace slug. Returns null when acceptable, or a
 * human-readable reason when not. Slugs are permanent identifiers — they key
 * the login form, the R2 prefix and any future subdomain — so the rules are
 * deliberately strict.
 */
export function validateSlug(slug: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug)) {
    return "Use 3-32 characters: lowercase letters, digits and hyphens, starting and ending with a letter or digit.";
  }
  if (slug.includes("--")) return "Consecutive hyphens are not allowed.";
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved.`;
  return null;
}

/** Lazily-created client pinned to the control database. */
export function getControlSql(): Sql {
  const url = process.env.CONTROL_DATABASE_URL;
  if (!url) {
    throw new Error(
      "CONTROL_DATABASE_URL is not set. It holds the workspace registry and " +
        "must point at a Postgres database separate from any workspace's.",
    );
  }
  if (!globalForControl.__esparkControlSql) {
    globalForControl.__esparkControlSql = postgres(url, {
      ssl: "require",
      // Transaction-mode poolers cannot carry prepared statements across
      // checkouts (same constraint as the workspace client in db.ts).
      prepare: false,
      // The control plane is read-mostly and low-traffic: one socket is
      // plenty, and it keeps the per-lambda footprint negligible next to the
      // workspace clients.
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }
  return globalForControl.__esparkControlSql;
}

/**
 * Create the control schema if absent. Idempotent, and guarded so concurrent
 * cold-start callers await one shared promise instead of racing through the
 * DDL (the same pattern `ensureSchema` uses for workspace databases).
 */
export function ensureControlSchema(): Promise<void> {
  if (!globalForControl.__esparkControlSchema) {
    globalForControl.__esparkControlSchema = (async () => {
      const q = getControlSql();
      await q`
        create table if not exists workspaces (
          id               bigserial primary key,
          slug             text not null unique,
          name             text not null,
          database_url_enc text not null,
          status           text not null default 'provisioning',
          r2_prefix        text not null default '',
          branding         text not null default '{}',
          provision_error  text,
          created_at       timestamptz not null default now(),
          updated_at       timestamptz not null default now()
        )
      `;
      await q`
        create table if not exists platform_admins (
          id                   bigserial primary key,
          username             text not null unique,
          password_hash        text not null,
          display_name         text not null default '',
          must_change_password boolean not null default true,
          created_at           timestamptz not null default now()
        )
      `;
      await q`
        create table if not exists platform_audit (
          id             bigserial primary key,
          actor          text not null,
          action         text not null,
          workspace_slug text,
          detail         text not null default '{}',
          created_at     timestamptz not null default now()
        )
      `;
      await q`
        create index if not exists platform_audit_created_idx
          on platform_audit (created_at desc)
      `;
    })().catch((err) => {
      // Don't cache a failed bootstrap — the next request should retry.
      globalForControl.__esparkControlSchema = undefined;
      throw err;
    });
  }
  return globalForControl.__esparkControlSchema;
}

type WorkspaceRow = {
  id: number | string;
  slug: string;
  name: string;
  database_url_enc: string;
  status: string;
  r2_prefix: string;
  branding: string | Record<string, unknown> | null;
  provision_error: string | null;
};

/**
 * Parse a persisted branding blob. Stored as text rather than jsonb because
 * postgres.js cannot introspect column types under `prepare: false` and
 * occasionally surfaces jsonb as a raw string — the same hazard app_settings
 * hit in `settings.ts`. Text plus an explicit parse behaves identically either
 * way.
 */
function parseBranding(value: WorkspaceRow["branding"]): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Malformed branding must not take the workspace down — an unbranded
      // login is recoverable, a 500 on every request is not.
    }
  }
  return {};
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    databaseUrl: decryptWithKey(WORKSPACE_KEY_ENV, row.database_url_enc),
    status: row.status as WorkspaceStatus,
    r2Prefix: row.r2_prefix || "",
    branding: parseBranding(row.branding),
    provisionError: row.provision_error,
  };
}

/** Encrypt a connection string for storage. */
export function sealDatabaseUrl(url: string): string {
  return encryptWithKey(WORKSPACE_KEY_ENV, url);
}

export async function getWorkspaceBySlug(
  slug: string,
): Promise<Workspace | null> {
  await ensureControlSchema();
  const q = getControlSql();
  const rows = (await q`
    select id, slug, name, database_url_enc, status, r2_prefix, branding,
           provision_error
    from workspaces
    where slug = ${slug}
    limit 1
  `) as WorkspaceRow[];
  return rows.length > 0 ? toWorkspace(rows[0]) : null;
}

/**
 * Short-lived slug→workspace memo. `getSessionUser()` runs on essentially
 * every request and server component, so an uncached control-DB round trip
 * would tax the whole app.
 *
 * The TTL is the staleness window for changes a platform admin makes:
 * suspending a workspace or editing its branding takes up to this long to
 * take effect. Kept short enough that a suspension is close to immediate, and
 * `invalidateWorkspace()` clears an entry outright when the platform admin is
 * the one making the change.
 */
const WORKSPACE_TTL_MS = 30_000;
const workspaceCache = new Map<string, { at: number; ws: Workspace | null }>();

export async function getWorkspaceBySlugCached(
  slug: string,
): Promise<Workspace | null> {
  const hit = workspaceCache.get(slug);
  if (hit && Date.now() - hit.at < WORKSPACE_TTL_MS) return hit.ws;
  const ws = await getWorkspaceBySlug(slug);
  workspaceCache.set(slug, { at: Date.now(), ws });
  return ws;
}

/** Drop a cached workspace so the next read sees a just-written change. */
export function invalidateWorkspace(slug: string): void {
  workspaceCache.delete(slug);
}

/**
 * Every workspace, newest first. Used by the platform admin list and by the
 * cron fan-out (which filters to `active`).
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  await ensureControlSchema();
  const q = getControlSql();
  const rows = (await q`
    select id, slug, name, database_url_enc, status, r2_prefix, branding,
           provision_error
    from workspaces
    order by created_at desc
  `) as WorkspaceRow[];
  return rows.map(toWorkspace);
}

/** Append an entry to the platform audit trail. Never throws into the caller. */
export async function auditPlatformAction(
  actor: string,
  action: string,
  workspaceSlug: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await ensureControlSchema();
    const q = getControlSql();
    await q`
      insert into platform_audit (actor, action, workspace_slug, detail)
      values (${actor}, ${action}, ${workspaceSlug}, ${JSON.stringify(detail)})
    `;
  } catch {
    // An unwritable audit row must not block the action it describes; the
    // action itself is the thing the operator asked for.
  }
}
