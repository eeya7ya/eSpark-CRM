import type { WorkspaceKind } from "./controlDb";
import { listCustomers, type CustomerRow } from "./platformOverview";
import { MODULE_META, MODULE_ORDER } from "./moduleMeta";
import type { Module } from "./modules";

/**
 * Subscriptions — the model the CRM owner's console speaks in.
 *
 * The layer underneath this thinks in workspaces: a slug, a database, a
 * licence. That is the right vocabulary for provisioning and for the request
 * path, and the wrong one for the person SELLING the product, who thinks in
 * subscriptions of two shapes:
 *
 *   Single-person — one human subscribing for themselves. No sub-admin, no
 *                   staff. What they bought is which tools they may open:
 *                   ONE tool (the quotation designer only, say) or SEVERAL.
 *   Company       — a company. Their own sub-admin manages their people
 *                   (presales, sales, projects) within the tools bought here.
 *
 * Both get their own database. The difference is entirely about who
 * administers whom inside it, so this module is a projection of the workspace
 * rows rather than a second store — there is exactly one place a subscription
 * lives, and it is the control plane.
 */

/** A tool the subscription can include. `admin` is not one — see TOOLS. */
export interface Tool {
  id: Module;
  label: string;
  blurb: string;
}

/**
 * The sellable tools, in the product's reading order.
 *
 * `admin` is deliberately excluded: every workspace administers itself, so it
 * is not something to sell or withhold. Labels come from MODULE_META so the
 * owner's console, the customer's own Subscription tab and the module gates
 * cannot drift into calling the same thing different names.
 */
export const TOOLS: Tool[] = MODULE_ORDER.filter((m) => m !== "admin").map(
  (id) => ({ id, label: MODULE_META[id].label, blurb: MODULE_META[id].blurb }),
);

/**
 * How much of the product a single-person subscription reaches. This is the
 * split the owner's chart draws under "Single Person Subscription":
 *
 *   single — one tool only
 *   multi  — several tools
 *   all    — every tool (no restriction recorded)
 *
 * It is DERIVED from the tool list rather than stored, because storing it
 * would let the label disagree with the licence that is actually enforced.
 */
export type ToolAccess = "single" | "multi" | "all";

export interface Subscription {
  slug: string;
  /** The person's name for an individual, the company's for a company. */
  name: string;
  kind: WorkspaceKind;
  status: CustomerRow["status"];
  plan: string;
  contactName: string;
  contactEmail: string;
  notes: string;
  provisionError: string | null;
  /** Tool ids included, or null for every tool. */
  tools: string[] | null;
  toolAccess: ToolAccess;
  /**
   * Accounts in use. For an individual this is their single login; for a
   * company it is their whole staff, managed by their own sub-admin.
   */
  usersInUse: number | null;
  usageError: string | null;
  /** Accounts allowed. Always 1 for an individual. */
  seatLimit: number | null;
  seatsFull: boolean;
  renewalAt: string | null;
  renewalState: CustomerRow["renewalState"];
  daysToRenewal: number | null;
}

export interface SubscriptionTotals {
  all: number;
  individual: number;
  company: number;
  active: number;
  /** Subscriptions inside the renewal window or already past it. */
  expiring: number;
  /** Company subscriptions whose sub-admin can no longer add staff. */
  atSeatLimit: number;
  /** Still provisioning, or failed to provision. */
  needsAttention: number;
}

/** Tools → how much of the product this reaches. */
export function toolAccessOf(tools: string[] | null): ToolAccess {
  if (tools === null) return "all";
  return tools.length <= 1 ? "single" : "multi";
}

function toSubscription(c: CustomerRow): Subscription {
  return {
    slug: c.slug,
    name: c.name,
    kind: c.kind,
    status: c.status,
    plan: c.plan,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    notes: c.notes,
    provisionError: c.provisionError,
    tools: c.modules,
    toolAccess: toolAccessOf(c.modules),
    usersInUse: c.seatsUsed,
    usageError: c.usageError,
    seatLimit: c.seatLimit,
    seatsFull: c.seatsFull,
    renewalAt: c.renewalAt,
    renewalState: c.renewalState,
    daysToRenewal: c.daysToRenewal,
  };
}

/** Every subscription, newest first (the order the control plane returns). */
export async function listSubscriptions(
  now = Date.now(),
): Promise<Subscription[]> {
  return (await listCustomers(now)).map(toSubscription);
}

export function totalsFor(subs: Subscription[]): SubscriptionTotals {
  return {
    all: subs.length,
    individual: subs.filter((s) => s.kind === "individual").length,
    company: subs.filter((s) => s.kind === "company").length,
    active: subs.filter((s) => s.status === "active").length,
    expiring: subs.filter(
      (s) => s.renewalState === "expiring" || s.renewalState === "expired",
    ).length,
    // Only meaningful for companies: an individual is always "full" at their
    // single seat, which is the normal state and not something to act on.
    atSeatLimit: subs.filter((s) => s.kind === "company" && s.seatsFull).length,
    needsAttention: subs.filter(
      (s) => s.status === "provisioning" || s.status === "failed",
    ).length,
  };
}
