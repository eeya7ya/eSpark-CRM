import { sql } from "./db";
import type { Module } from "./modules";
import type { Subscriber } from "./subscribers";

/**
 * Turning a subscription into working access.
 *
 * Selling somebody "Quotation Designer and Pricing" has to end with them
 * opening those tools and finding their OWN clients and quotations in them.
 * Two mechanisms already in the app do that, and this module is the one place
 * that drives both from the subscription:
 *
 *   TENANT — `users.tenant_id`, the documented ceiling on cross-user
 *     visibility: nobody may see rows owned outside their own tenant. One
 *     tenant per subscriber is what makes their workspace a separate app
 *     rather than a shared one, and it is the rule the app already enforces.
 *   MODULE ROLES — `user_module_roles`, which decides what a person may open.
 *     Without a grant the tool is bought but unusable, which is exactly the
 *     "No CRM tools are assigned to your account yet" dead end.
 *
 * Both are re-derived from the subscription whenever it changes, so the tools
 * ticked in the admin page and the access actually held cannot drift apart.
 */

/**
 * The role granted per tool.
 *
 * A subscriber is the top of their own workspace, so each is the fullest role
 * its module has: a solo buyer of the quotation designer must be able to
 * author quotations, not file requests for somebody else to price. `crm` maps
 * to `presales_manager` for that reason — it is the role that may author and
 * price, and it carries the pricing lifecycle with it.
 */
const ROLE_FOR_TOOL: Record<string, string> = {
  crm: "presales_manager",
  pricing: "manager",
  projects: "manager",
  storage: "manager",
  delivery: "manager",
  showroom: "manager",
  accountant: "manager",
  catalogue: "editor",
};

/** Every tool id that can be granted. */
export const GRANTABLE_TOOLS = Object.keys(ROLE_FOR_TOOL);

/** The tools a subscription includes. Null on the row means every tool. */
export function toolsOf(subscriber: Subscriber): string[] {
  return subscriber.tools === null ? [...GRANTABLE_TOOLS] : subscriber.tools;
}

/**
 * Ensure the subscriber has a tenant of their own, returning its id.
 * Idempotent: an existing tenant is reused rather than duplicated, so
 * re-running this never splits a workspace in two.
 */
export async function ensureSubscriberTenant(
  subscriberId: number,
  name: string,
  slug: string,
): Promise<number> {
  const q = sql();
  const existing = (await q`
    select tenant_id from subscribers where id = ${subscriberId} limit 1
  `) as Array<{ tenant_id: number | null }>;
  if (existing[0]?.tenant_id) return Number(existing[0].tenant_id);

  // `slug` is unique on tenants, and unique on subscribers, so reusing it
  // keeps the two readable side by side in the database.
  const rows = (await q`
    insert into tenants (name, slug) values (${name}, ${slug})
    on conflict (slug) do update set name = excluded.name
    returning id
  `) as Array<{ id: number }>;
  const tenantId = Number(rows[0].id);
  await q`
    update subscribers set tenant_id = ${tenantId}, updated_at = now()
     where id = ${subscriberId}
  `;
  return tenantId;
}

/**
 * Re-derive every login's tenant and module roles from the subscription.
 *
 * Authoritative in both directions: a tool added to the subscription is
 * granted, and a tool removed is revoked. Grants are never hard-deleted —
 * `revoked_at` is set, matching how the rest of the app treats them — so the
 * history of what somebody once held survives.
 */
export async function syncSubscriberAccess(
  subscriber: Subscriber,
): Promise<void> {
  const q = sql();
  const tenantId = await ensureSubscriberTenant(
    subscriber.id,
    subscriber.name,
    subscriber.slug,
  );

  const users = (await q`
    select id from users where subscriber_id = ${subscriber.id}
  `) as Array<{ id: number }>;
  if (users.length === 0) return;

  const wanted = toolsOf(subscriber).filter((t) => ROLE_FOR_TOOL[t]);

  for (const u of users) {
    await q`update users set tenant_id = ${tenantId} where id = ${u.id}`;

    // Revoke first, then re-grant exactly what the subscription includes. The
    // upsert clears the revoke columns, so a tool removed and later restored
    // comes back on the same row rather than accumulating duplicates.
    await q`
      update user_module_roles set revoked_at = now()
       where user_id = ${u.id} and revoked_at is null
    `;
    for (const tool of wanted) {
      await q`
        insert into user_module_roles (user_id, module, role, created_at)
        values (${u.id}, ${tool}, ${ROLE_FOR_TOOL[tool]}, now())
        on conflict (user_id, module, role) do update
          set revoked_at = null, revoked_by = null, created_at = now()
      `;
    }
  }
}

/**
 * The subscription a login belongs to, with its tool list — the shape the
 * module gate needs. Null for the CRM owner and their own staff, who are not
 * bounded by any subscription.
 */
export async function subscriptionFor(userId: number): Promise<{
  id: number;
  slug: string;
  status: string;
  tools: string[] | null;
} | null> {
  const q = sql();
  const rows = (await q`
    select s.id, s.slug, s.status, s.tools
    from users u join subscribers s on s.id = u.subscriber_id
    where u.id = ${userId} limit 1
  `) as Array<{
    id: number;
    slug: string;
    status: string;
    tools: string | null;
  }>;
  if (rows.length === 0) return null;
  const r = rows[0];
  let tools: string[] | null = null;
  if (r.tools) {
    try {
      const parsed = JSON.parse(r.tools);
      if (Array.isArray(parsed)) tools = parsed.map(String);
    } catch {
      // Unreadable reads as "every tool" — a corrupt row must not lock a
      // paying subscriber out of what they bought.
    }
  }
  return { id: Number(r.id), slug: r.slug, status: r.status, tools };
}

/**
 * Whether a subscription includes `module`.
 *
 * `admin` is always included: a subscriber administers their own workspace,
 * which is not something sold or withheld. Everything else must have been
 * bought.
 */
export function subscriptionIncludes(
  tools: string[] | null,
  module: Module,
): boolean {
  if (module === "admin") return true;
  return tools === null || tools.includes(module);
}
