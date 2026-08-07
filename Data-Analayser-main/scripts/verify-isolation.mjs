#!/usr/bin/env node
/**
 * Prove that workspace isolation actually holds.
 *
 * The claim this platform makes to a client is that their data is unreachable
 * from any other workspace. That claim is worth testing against the real
 * databases rather than assumed from the code, so this script does exactly
 * that: it writes a canary row into one workspace and checks that every other
 * workspace cannot see it.
 *
 * Usage:
 *   CONTROL_DATABASE_URL=... WORKSPACE_SECRET_KEY=... \
 *     node scripts/verify-isolation.mjs
 *
 * Safe to run against production. The canary is written to `app_settings`
 * under a dedicated key and removed again in a finally block; nothing else is
 * touched, and no existing row is read or modified.
 *
 * Exits non-zero if isolation is violated, so it can gate a deploy.
 */

import postgres from "postgres";
import { createDecipheriv } from "node:crypto";

const CONTROL_URL = process.env.CONTROL_DATABASE_URL;
const KEY_RAW = process.env.WORKSPACE_SECRET_KEY;
const CANARY_KEY = "__isolation_canary__";

function die(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!CONTROL_URL) die("CONTROL_DATABASE_URL is not set.");
if (!KEY_RAW) die("WORKSPACE_SECRET_KEY is not set.");

function key() {
  const buf = /^[0-9a-fA-F]{64}$/.test(KEY_RAW)
    ? Buffer.from(KEY_RAW, "hex")
    : Buffer.from(KEY_RAW, "base64");
  if (buf.length !== 32) die("WORKSPACE_SECRET_KEY must decode to 32 bytes.");
  return buf;
}

/** Mirrors decryptWithKey in src/lib/secretBox.ts. */
function decrypt(stored) {
  const [iv, tag, ct] = stored.split(":");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    d.update(Buffer.from(ct, "base64")),
    d.final(),
  ]).toString("utf8");
}

function connect(url) {
  return postgres(url, {
    ssl: "require",
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    onnotice: () => {},
  });
}

const control = connect(CONTROL_URL);
let failures = 0;

try {
  const rows = await control`
    select slug, name, database_url_enc, status
    from workspaces
    where status = 'active'
    order by slug
  `;

  if (rows.length === 0) die("No active workspaces to check.");
  console.log(`Checking ${rows.length} active workspace(s).\n`);

  const workspaces = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    url: decrypt(r.database_url_enc),
  }));

  // 1. Every workspace must be a genuinely distinct database. Two workspaces
  //    sharing one would silently pool their data together while every other
  //    check still passed.
  const seen = new Map();
  for (const ws of workspaces) {
    const sql = connect(ws.url);
    try {
      const [{ db, host }] = await sql`
        select current_database() as db,
               coalesce(inet_server_addr()::text, 'local') as host
      `;
      const identity = `${host}/${db}`;
      if (seen.has(identity)) {
        console.error(
          `  ✗ ${ws.slug} shares a database with ${seen.get(identity)} (${identity})`,
        );
        failures += 1;
      } else {
        seen.set(identity, ws.slug);
        console.log(`  ✓ ${ws.slug} → ${identity}`);
      }
    } finally {
      await sql.end({ timeout: 5 }).catch(() => {});
    }
  }

  if (workspaces.length < 2) {
    console.log(
      "\nOnly one workspace — nothing to cross-check. Distinctness verified.",
    );
  } else {
    // 2. A canary written to the first workspace must be invisible everywhere
    //    else. This is the check that would actually catch a routing bug.
    const [source, ...others] = workspaces;
    const canary = `canary-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sourceSql = connect(source.url);
    console.log(`\nWriting a canary into "${source.slug}"…`);
    try {
      await sourceSql`
        insert into app_settings (key, value, updated_at)
        values (${CANARY_KEY}, ${JSON.stringify({ canary })}, now())
        on conflict (key) do update set value = excluded.value,
                                        updated_at = excluded.updated_at
      `;

      for (const other of others) {
        const sql = connect(other.url);
        try {
          const found = await sql`
            select value from app_settings where key = ${CANARY_KEY}
          `;
          const leaked = found.some((r) => String(r.value).includes(canary));
          if (leaked) {
            console.error(`  ✗ ${other.slug} CAN SEE ${source.slug}'s canary`);
            failures += 1;
          } else {
            console.log(`  ✓ ${other.slug} cannot see it`);
          }
        } finally {
          await sql.end({ timeout: 5 }).catch(() => {});
        }
      }
    } finally {
      // Always clean up, including when a check above threw.
      await sourceSql`delete from app_settings where key = ${CANARY_KEY}`.catch(
        () => {},
      );
      await sourceSql.end({ timeout: 5 }).catch(() => {});
    }
  }

  // 3. The control database must hold no customer data. It is meant to carry
  //    only the registry, the operator accounts and the audit trail; a CRM
  //    table appearing here means something wrote to the wrong database.
  const stray = await control`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('users', 'quotations', 'leads', 'companies',
                         'contacts', 'deals', 'projects')
    order by table_name
  `;
  console.log("");
  if (stray.length > 0) {
    console.error(
      `  ✗ control database contains CRM table(s): ${stray
        .map((r) => r.table_name)
        .join(", ")}`,
    );
    failures += 1;
  } else {
    console.log("  ✓ control database holds no CRM tables");
  }
} finally {
  await control.end({ timeout: 5 }).catch(() => {});
}

if (failures > 0) {
  console.error(`\n✗ ${failures} isolation check(s) FAILED.\n`);
  process.exit(1);
}
console.log("\n✓ Isolation verified.\n");
