import {
  listWorkspaces,
  type Workspace,
  type WorkspaceKind,
  type WorkspaceStatus,
} from "./controlDb";
import { runInWorkspace } from "./workspaceContext";
import { sql } from "./db";

/**
 * The operator's view of every app customer at once.
 *
 * Each customer runs in its OWN database, so headcount cannot be read with a
 * join — it is one query per workspace, fanned out. Two consequences shape
 * this module:
 *
 *   • A customer whose database is unreachable (still provisioning, suspended
 *     at the host, credentials rotated) must not take the console down with
 *     it. Every read is caught per workspace and reported as `usageError`, so
 *     one broken customer costs one row, not the page.
 *   • It reads counts only — never names, leads, quotations or any other
 *     customer content. The platform tier administers subscriptions; it does
 *     not look inside what it sells, and `SubscribersPanel` already documents
 *     that boundary.
 */

/** Where a subscription stands against its renewal date. */
export type RenewalState = "none" | "ok" | "expiring" | "expired";

/** Days before the renewal date that a customer starts reading as "expiring". */
export const EXPIRING_WINDOW_DAYS = 30;

export interface CustomerRow {
  slug: string;
  name: string;
  status: WorkspaceStatus;
  /** Individual or company subscriber — see controlDb.WorkspaceKind. */
  kind: WorkspaceKind;
  plan: string;
  contactName: string;
  contactEmail: string;
  notes: string;
  provisionError: string | null;
  /** Licensed modules, or null for all of them. */
  modules: string[] | null;
  /** Accounts allowed, or null when uncapped. */
  seatLimit: number | null;
  /** Accounts that exist, or null when the count could not be read. */
  seatsUsed: number | null;
  /** Why the seat count is missing, when it is. */
  usageError: string | null;
  /** True when the customer is at or over their cap. */
  seatsFull: boolean;
  renewalAt: string | null;
  renewalState: RenewalState;
  /** Whole days until renewal; negative once past. Null when no date is set. */
  daysToRenewal: number | null;
}

export interface PlatformSummary {
  customers: number;
  active: number;
  suspended: number;
  /** Customers still provisioning or whose provisioning failed. */
  unhealthy: number;
  /** Customers at or over their seat cap. */
  atSeatLimit: number;
  /** Customers inside the renewal window or already past it. */
  expiring: number;
  /** Total accounts across every customer whose count could be read. */
  totalSeatsUsed: number;
}

function renewalStateOf(renewalAt: string | null, now: number): {
  state: RenewalState;
  days: number | null;
} {
  if (!renewalAt) return { state: "none", days: null };
  const at = new Date(renewalAt).getTime();
  if (Number.isNaN(at)) return { state: "none", days: null };
  const days = Math.ceil((at - now) / 86_400_000);
  if (days < 0) return { state: "expired", days };
  if (days <= EXPIRING_WINDOW_DAYS) return { state: "expiring", days };
  return { state: "ok", days };
}

/** Count user accounts inside one customer's database. */
async function countSeats(ws: Workspace): Promise<number> {
  return runInWorkspace(ws, async () => {
    const q = sql();
    const rows = (await q`select count(*)::int as n from users`) as Array<{
      n: number;
    }>;
    return Number(rows[0]?.n ?? 0);
  });
}

/**
 * Every customer with their subscription and current usage.
 *
 * `now` is passed in rather than read here so a caller can render a stable
 * page (and so the renewal arithmetic is testable).
 */
export async function listCustomers(now = Date.now()): Promise<CustomerRow[]> {
  const workspaces = await listWorkspaces();

  return Promise.all(
    workspaces.map(async (ws) => {
      let seatsUsed: number | null = null;
      let usageError: string | null = null;
      // A workspace that has not finished provisioning has no `users` table to
      // count, so skip the round trip instead of reporting a spurious error.
      if (ws.status === "active" || ws.status === "suspended") {
        try {
          seatsUsed = await countSeats(ws);
        } catch (err) {
          usageError = err instanceof Error ? err.message : "unreadable";
        }
      }
      const { state, days } = renewalStateOf(ws.renewalAt, now);
      return {
        slug: ws.slug,
        name: ws.name,
        status: ws.status,
        kind: ws.kind,
        plan: ws.plan,
        contactName: ws.contactName,
        contactEmail: ws.contactEmail,
        notes: ws.notes,
        provisionError: ws.provisionError,
        modules: ws.modules,
        seatLimit: ws.seatLimit,
        seatsUsed,
        usageError,
        seatsFull:
          ws.seatLimit !== null &&
          seatsUsed !== null &&
          seatsUsed >= ws.seatLimit,
        renewalAt: ws.renewalAt,
        renewalState: state,
        daysToRenewal: days,
      } satisfies CustomerRow;
    }),
  );
}

/** Headline counts across every customer. */
export function summarisePlatform(rows: CustomerRow[]): PlatformSummary {
  return {
    customers: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    suspended: rows.filter((r) => r.status === "suspended").length,
    unhealthy: rows.filter(
      (r) => r.status === "provisioning" || r.status === "failed",
    ).length,
    atSeatLimit: rows.filter((r) => r.seatsFull).length,
    expiring: rows.filter(
      (r) => r.renewalState === "expiring" || r.renewalState === "expired",
    ).length,
    totalSeatsUsed: rows.reduce((n, r) => n + (r.seatsUsed ?? 0), 0),
  };
}
