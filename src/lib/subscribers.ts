import { sql } from "./db";
import { MODULE_META, MODULE_ORDER } from "./moduleMeta";
import type { Module } from "./modules";

/**
 * Subscribers — who has subscribed to the CRM, and what they bought.
 *
 * Two shapes, which is the split the whole product hangs off:
 *
 *   INDIVIDUAL — one person subscribing for themselves. No sub-admin and no
 *                staff: they are the only login, and what they bought is which
 *                tools they may open — a SINGLE tool (the quotation designer
 *                only, say) or SEVERAL.
 *   COMPANY    — a company with its own sub-admin, who manages that company's
 *                users (presales, sales, projects) inside the tools bought.
 *
 * They live in THIS database, keyed by `slug` — the route each is reached at.
 * No separate control database, no subdomain, no environment variables: the
 * app already has a database and this is a table in it, so the console works
 * the moment the code is deployed. The shape would be identical if this later
 * moved to its own store, which makes that a migration rather than a rewrite.
 */

export type SubscriberKind = "individual" | "company";
export type SubscriberStatus = "active" | "suspended";

/** A single-person subscription is exactly one account, by definition. */
export const INDIVIDUAL_SEAT_LIMIT = 1;

/** How much of the product a subscription reaches. Derived, never stored. */
export type ToolAccess = "single" | "multi" | "all";

export interface Tool {
  id: Module;
  label: string;
  blurb: string;
}

/**
 * The sellable tools, in the product's reading order. `admin` is excluded:
 * every subscriber administers themselves, so it is not something to sell or
 * withhold. Labels come from MODULE_META so nothing can drift into calling the
 * same thing two different names.
 */
export const TOOLS: Tool[] = MODULE_ORDER.filter((m) => m !== "admin").map(
  (id) => ({ id, label: MODULE_META[id].label, blurb: MODULE_META[id].blurb }),
);

const TOOL_IDS = new Set<string>(TOOLS.map((t) => t.id));

export interface Subscriber {
  id: number;
  slug: string;
  name: string;
  kind: SubscriberKind;
  status: SubscriberStatus;
  /** Tool ids included, or null for every tool. */
  tools: string[] | null;
  toolAccess: ToolAccess;
  plan: string;
  /** Accounts allowed, or null when uncapped. Always 1 for an individual. */
  seatLimit: number | null;
  renewalAt: string | null;
  contactName: string;
  contactEmail: string;
  notes: string;
  createdAt: string;
}

export interface SubscriberTotals {
  all: number;
  individual: number;
  company: number;
  active: number;
  suspended: number;
}

/** Tools → how much of the product this reaches. */
export function toolAccessOf(tools: string[] | null): ToolAccess {
  if (tools === null) return "all";
  return tools.length <= 1 ? "single" : "multi";
}

/**
 * Parse the stored tool list. Anything unreadable is treated as "every tool"
 * rather than "no tools" — a corrupt row should not lock a paying subscriber
 * out of the product they bought.
 */
function parseTools(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through to "everything"
    }
  }
  return null;
}

/** Keep only tools that actually exist, so a typo cannot sell nothing. */
export function sanitiseTools(input: unknown): string[] | null {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input)) return null;
  const kept = input.map(String).filter((t) => TOOL_IDS.has(t));
  return kept.length > 0 ? kept : null;
}

type Row = {
  id: number | string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  tools: unknown;
  plan: string | null;
  seat_limit: number | string | null;
  renewal_at: string | Date | null;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string | Date | null;
};

function toSubscriber(r: Row): Subscriber {
  const kind: SubscriberKind = r.kind === "individual" ? "individual" : "company";
  const tools = parseTools(r.tools);
  const raw = r.seat_limit === null ? null : Number(r.seat_limit);
  return {
    id: Number(r.id),
    slug: r.slug,
    name: r.name,
    kind,
    status: r.status === "suspended" ? "suspended" : "active",
    tools,
    toolAccess: toolAccessOf(tools),
    plan: r.plan || "standard",
    // An individual is one account whatever is stored, and a non-positive cap
    // would lock a subscriber out of their own workspace, so it reads as
    // uncapped rather than as zero seats.
    seatLimit:
      kind === "individual"
        ? INDIVIDUAL_SEAT_LIMIT
        : raw === null || raw <= 0
          ? null
          : raw,
    renewalAt:
      r.renewal_at instanceof Date
        ? r.renewal_at.toISOString()
        : (r.renewal_at as string | null) || null,
    contactName: r.contact_name || "",
    contactEmail: r.contact_email || "",
    notes: r.notes || "",
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at ?? ""),
  };
}

const COLUMNS =
  "id, slug, name, kind, status, tools, plan, seat_limit, renewal_at, contact_name, contact_email, notes, created_at";

export async function listSubscribers(): Promise<Subscriber[]> {
  const q = sql();
  const rows = (await q`
    select id, slug, name, kind, status, tools, plan, seat_limit, renewal_at,
           contact_name, contact_email, notes, created_at
    from subscribers
    order by created_at desc, id desc
  `) as Row[];
  return rows.map(toSubscriber);
}

export async function getSubscriber(id: number): Promise<Subscriber | null> {
  const q = sql();
  const rows = (await q`
    select id, slug, name, kind, status, tools, plan, seat_limit, renewal_at,
           contact_name, contact_email, notes, created_at
    from subscribers where id = ${id} limit 1
  `) as Row[];
  return rows.length > 0 ? toSubscriber(rows[0]) : null;
}

/** Slug rules: it is the route the subscriber is reached at, so keep it strict. */
export function validateSlug(slug: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug)) {
    return "Use 3-32 characters: lowercase letters, digits and hyphens, starting and ending with a letter or digit.";
  }
  if (slug.includes("--")) return "Consecutive hyphens are not allowed.";
  // These are real routes in the app; a subscriber reached at one would be
  // shadowed by the page that already owns it.
  const reserved = new Set([
    "admin", "api", "app", "crm", "login", "logout", "platform", "pricing",
    "projects", "quotation", "storage", "leads", "notes", "sync", "updates",
    "inbox", "folder", "delivery", "catalogue", "settings", "help",
  ]);
  if (reserved.has(slug)) return `"${slug}" is a route already used by the app.`;
  return null;
}

export interface CreateSubscriberInput {
  slug: string;
  name: string;
  kind: SubscriberKind;
  tools: string[] | null;
  plan?: string;
  seatLimit?: number | null;
  contactName?: string;
  contactEmail?: string;
}

export async function createSubscriber(
  input: CreateSubscriberInput,
): Promise<Subscriber> {
  const slug = input.slug.trim().toLowerCase();
  const slugError = validateSlug(slug);
  if (slugError) throw new Error(slugError);
  if (!input.name.trim()) throw new Error("A name is required.");

  const kind: SubscriberKind =
    input.kind === "individual" ? "individual" : "company";
  const tools = sanitiseTools(input.tools);
  // An individual is one account; a company's cap is the operator's to set.
  const seatLimit =
    kind === "individual"
      ? INDIVIDUAL_SEAT_LIMIT
      : input.seatLimit && input.seatLimit > 0
        ? Math.floor(input.seatLimit)
        : null;

  const q = sql();
  const rows = (await q`
    insert into subscribers (slug, name, kind, tools, plan, seat_limit,
                             contact_name, contact_email)
    values (${slug}, ${input.name.trim()}, ${kind},
            ${tools === null ? null : JSON.stringify(tools)},
            ${input.plan?.trim() || "standard"}, ${seatLimit},
            ${input.contactName?.trim() || ""},
            ${input.contactEmail?.trim() || ""})
    on conflict (slug) do nothing
    returning ${q.unsafe(COLUMNS)}
  `) as Row[];
  if (rows.length === 0) {
    throw new Error(`"${slug}" is already taken by another subscriber.`);
  }
  return toSubscriber(rows[0]);
}

export interface UpdateSubscriberInput {
  name?: string;
  status?: SubscriberStatus;
  tools?: string[] | null;
  plan?: string;
  seatLimit?: number | null;
  renewalAt?: string | null;
  contactName?: string;
  contactEmail?: string;
  notes?: string;
}

export async function updateSubscriber(
  id: number,
  input: UpdateSubscriberInput,
): Promise<Subscriber | null> {
  const existing = await getSubscriber(id);
  if (!existing) return null;
  const q = sql();

  if (typeof input.name === "string" && input.name.trim()) {
    await q`update subscribers set name = ${input.name.trim()}, updated_at = now() where id = ${id}`;
  }
  if (input.status === "active" || input.status === "suspended") {
    await q`update subscribers set status = ${input.status}, updated_at = now() where id = ${id}`;
  }
  if (input.tools !== undefined) {
    const tools = sanitiseTools(input.tools);
    await q`
      update subscribers
         set tools = ${tools === null ? null : JSON.stringify(tools)},
             updated_at = now()
       where id = ${id}
    `;
  }
  if (typeof input.plan === "string" && input.plan.trim()) {
    await q`update subscribers set plan = ${input.plan.trim()}, updated_at = now() where id = ${id}`;
  }
  if (input.seatLimit !== undefined) {
    // Not the operator's to set for an individual — it is 1 by definition, and
    // storing anything else would only record a number the model ignores.
    const next =
      existing.kind === "individual"
        ? INDIVIDUAL_SEAT_LIMIT
        : input.seatLimit === null || Number(input.seatLimit) <= 0
          ? null
          : Math.floor(Number(input.seatLimit));
    await q`update subscribers set seat_limit = ${next}, updated_at = now() where id = ${id}`;
  }
  if (input.renewalAt !== undefined) {
    let next: string | null = null;
    if (input.renewalAt !== null && String(input.renewalAt).trim()) {
      const d = new Date(String(input.renewalAt));
      // Reject an unparseable date rather than storing null, which would read
      // as "never expires" — the opposite of what a mistyped date means.
      if (Number.isNaN(d.getTime())) throw new Error("That renewal date is not valid.");
      next = d.toISOString();
    }
    await q`update subscribers set renewal_at = ${next}, updated_at = now() where id = ${id}`;
  }
  if (typeof input.contactName === "string") {
    await q`update subscribers set contact_name = ${input.contactName.trim()}, updated_at = now() where id = ${id}`;
  }
  if (typeof input.contactEmail === "string") {
    await q`update subscribers set contact_email = ${input.contactEmail.trim()}, updated_at = now() where id = ${id}`;
  }
  if (typeof input.notes === "string") {
    await q`update subscribers set notes = ${input.notes.trim()}, updated_at = now() where id = ${id}`;
  }
  return getSubscriber(id);
}

export async function deleteSubscriber(id: number): Promise<boolean> {
  const q = sql();
  const rows = (await q`
    delete from subscribers where id = ${id} returning id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}

export function totalsFor(subs: Subscriber[]): SubscriberTotals {
  return {
    all: subs.length,
    individual: subs.filter((s) => s.kind === "individual").length,
    company: subs.filter((s) => s.kind === "company").length,
    active: subs.filter((s) => s.status === "active").length,
    suspended: subs.filter((s) => s.status === "suspended").length,
  };
}
