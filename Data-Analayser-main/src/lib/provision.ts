import postgres from "postgres";
import { ensureSchema, sql } from "./db";
import { hashPassword } from "./auth";
import {
  ensureControlSchema,
  getControlSql,
  getWorkspaceBySlug,
  invalidateWorkspace,
  sealDatabaseUrl,
  validateSlug,
  workspaceKeyReady,
  type Workspace,
} from "./controlDb";
import { runInWorkspace } from "./workspaceContext";

/**
 * Creating a workspace: a client company's own database, schema, and first
 * admin account.
 *
 * ── Where the database comes from ──────────────────────────────────────────
 * Two routes, in order of preference:
 *
 *   1. The operator supplies a connection string. Works with any Postgres —
 *      a Neon database created in the console, RDS, anything — and needs no
 *      privileged credentials sitting in the app's environment.
 *
 *   2. The app creates one, if `PROVISION_DATABASE_URL` is set. That must be
 *      a DIRECT (non-pooled) connection to the Neon project that should host
 *      workspace databases, with a role that can CREATE DATABASE — `CREATE
 *      DATABASE` cannot run through a transaction-mode pooler, and cannot run
 *      inside a transaction at all.
 *
 * Route 2 is the convenience path; route 1 is always available and is what
 * keeps the app from needing database-creation rights it otherwise never uses.
 *
 * ── Restartable, not transactional ─────────────────────────────────────────
 * Creating a database, applying ~35 DDL statements to it and seeding a user
 * cannot be one atomic operation. Instead the workspace row is written first
 * as `provisioning` and only flips to `active` once every step has succeeded;
 * a failure records the reason and leaves it `failed`. Re-running provisioning
 * for the same slug resumes rather than duplicating — every step is written to
 * be idempotent, so a half-finished workspace is repaired by trying again.
 */

export interface ProvisionInput {
  slug: string;
  name: string;
  adminUsername: string;
  adminPassword: string;
  /** Existing database to use. When omitted, one is created (route 2). */
  databaseUrl?: string;
  /** Seeded into the workspace's app_settings so documents carry them. */
  companyDetails?: Record<string, unknown>;
}

export interface ProvisionResult {
  workspace: Workspace;
  /** True when this call created the database rather than adopting one. */
  createdDatabase: boolean;
}

/** Postgres identifier for the database backing a workspace. */
function databaseNameFor(slug: string): string {
  // Slugs are already `[a-z0-9-]`; hyphens are legal in a quoted identifier
  // but awkward everywhere else, so normalise to underscores.
  return `espark_ws_${slug.replace(/-/g, "_")}`;
}

/**
 * Neon serves the same database over a direct endpoint and a pooled one, the
 * pooled host differing only by a `-pooler` suffix on the first label. The app
 * runs on serverless functions and must use the pooled endpoint; provisioning
 * must use the direct one. Convert here so the operator configures one URL.
 *
 * Hosts that don't look like Neon's are returned unchanged — a self-hosted
 * Postgres has no such convention, and its single endpoint is already correct.
 */
function toPooledUrl(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  const [first, ...rest] = parsed.hostname.split(".");
  if (rest.length > 0 && !first.endsWith("-pooler")) {
    const neonish = rest.join(".").endsWith("neon.tech");
    if (neonish) parsed.hostname = [`${first}-pooler`, ...rest].join(".");
  }
  return parsed.toString();
}

/**
 * Create the database for a workspace on the configured Neon project.
 * Idempotent: an existing database of the same name is adopted, which is what
 * makes a retry after a partial failure safe.
 */
async function createDatabase(slug: string): Promise<string> {
  const adminUrl = process.env.PROVISION_DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      "No database was supplied and PROVISION_DATABASE_URL is not set. " +
        "Either paste a connection string for this workspace, or set " +
        "PROVISION_DATABASE_URL to a direct (non-pooled) connection whose " +
        "role can CREATE DATABASE.",
    );
  }
  const name = databaseNameFor(slug);
  // A dedicated short-lived client: CREATE DATABASE cannot run through the
  // transaction-mode pooler the app's normal clients are configured for.
  const admin = postgres(adminUrl, {
    ssl: "require",
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => {},
  });
  try {
    const existing = (await admin`
      select 1 as ok from pg_database where datname = ${name}
    `) as Array<{ ok: number }>;
    if (existing.length === 0) {
      // Identifier, not a value — it cannot be parameterised. `name` is
      // derived from a slug already validated against /^[a-z0-9-]+$/, so it
      // contains nothing to escape, and it is quoted regardless.
      await admin.unsafe(`create database "${name}"`);
    }
  } finally {
    await admin.end({ timeout: 5 }).catch(() => {});
  }
  return toPooledUrl(adminUrl, name);
}

/** Verify a connection string actually reaches a usable Postgres database. */
async function assertReachable(url: string): Promise<void> {
  const probe = postgres(url, {
    ssl: "require",
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => {},
  });
  try {
    await probe`select 1`;
  } catch (err) {
    throw new Error(
      `Could not connect to the workspace database: ${(err as Error).message}`,
    );
  } finally {
    await probe.end({ timeout: 5 }).catch(() => {});
  }
}

/**
 * Seed the workspace's first admin. Idempotent — a re-run leaves an existing
 * account's password alone rather than resetting it, so repairing a failed
 * provision cannot silently change a password the client is already using.
 */
async function seedFirstAdmin(
  username: string,
  password: string,
): Promise<void> {
  const q = sql();
  const existing = (await q`
    select id from users where username = ${username} limit 1
  `) as Array<{ id: number }>;
  if (existing.length > 0) return;
  const hash = await hashPassword(password);
  await q`
    insert into users (username, password_hash, role, must_change_password,
                       display_name)
    values (${username}, ${hash}, 'admin', true, ${username})
  `;
}

/** Seed company details into the workspace's own settings row. */
async function seedCompanyDetails(
  details: Record<string, unknown>,
): Promise<void> {
  if (!details || Object.keys(details).length === 0) return;
  const q = sql();
  const rows = (await q`
    select value from app_settings where key = 'global' limit 1
  `) as Array<{ value: string | Record<string, unknown> | null }>;
  let current: Record<string, unknown> = {};
  const raw = rows[0]?.value;
  if (raw && typeof raw === "object") current = raw as Record<string, unknown>;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      current = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }
  const merged = JSON.stringify({ ...current, companyDetails: details });
  await q`
    insert into app_settings (key, value, updated_at)
    values ('global', ${merged}, now())
    on conflict (key) do update set value = excluded.value,
                                    updated_at = excluded.updated_at
  `;
}

/**
 * Create (or repair) a workspace. Safe to re-run for the same slug.
 */
export async function provisionWorkspace(
  input: ProvisionInput,
): Promise<ProvisionResult> {
  const slug = input.slug.trim().toLowerCase();
  const slugError = validateSlug(slug);
  if (slugError) throw new Error(slugError);
  if (!input.name.trim()) throw new Error("A workspace name is required.");
  if (!input.adminUsername.trim()) {
    throw new Error("An admin username is required.");
  }
  if ((input.adminPassword || "").length < 8) {
    throw new Error("The admin password must be at least 8 characters.");
  }
  if (!workspaceKeyReady()) {
    throw new Error(
      "WORKSPACE_SECRET_KEY is not set — it encrypts each workspace's " +
        "connection string at rest. Generate one with `openssl rand -base64 32`.",
    );
  }

  await ensureControlSchema();
  const control = getControlSql();
  const existing = await getWorkspaceBySlug(slug);
  if (existing && existing.status === "active") {
    throw new Error(`Workspace "${slug}" already exists.`);
  }

  // Settle on a database before writing anything: an adopted URL is reused on
  // a retry so a repair does not strand the database created by the first run.
  let createdDatabase = false;
  let databaseUrl = input.databaseUrl?.trim() || existing?.databaseUrl || "";
  if (!databaseUrl) {
    databaseUrl = await createDatabase(slug);
    createdDatabase = true;
  }
  await assertReachable(databaseUrl);

  const sealed = sealDatabaseUrl(databaseUrl);
  const r2Prefix = `ws/${slug}`;
  await control`
    insert into workspaces (slug, name, database_url_enc, status, r2_prefix,
                            provision_error)
    values (${slug}, ${input.name.trim()}, ${sealed}, 'provisioning',
            ${r2Prefix}, null)
    on conflict (slug) do update set name             = excluded.name,
                                     database_url_enc = excluded.database_url_enc,
                                     status           = 'provisioning',
                                     r2_prefix        = excluded.r2_prefix,
                                     provision_error  = null,
                                     updated_at       = now()
  `;
  invalidateWorkspace(slug);

  const pending = await getWorkspaceBySlug(slug);
  if (!pending) throw new Error("Workspace row vanished during provisioning.");

  try {
    await runInWorkspace(pending, async () => {
      // The full DDL bootstrap, against the new database. Memoised per
      // database, so this is the workspace's own schema and not a warm
      // lambda's memory of some other workspace's.
      await ensureSchema();
      await seedFirstAdmin(input.adminUsername.trim(), input.adminPassword);
      await seedCompanyDetails(input.companyDetails || {});
    });
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await control`
      update workspaces
         set status = 'failed', provision_error = ${message}, updated_at = now()
       where slug = ${slug}
    `;
    invalidateWorkspace(slug);
    throw new Error(`Provisioning failed for "${slug}": ${message}`);
  }

  await control`
    update workspaces
       set status = 'active', provision_error = null, updated_at = now()
     where slug = ${slug}
  `;
  invalidateWorkspace(slug);

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) throw new Error("Workspace row vanished after provisioning.");
  return { workspace, createdDatabase };
}
