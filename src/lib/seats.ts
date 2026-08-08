import { sql } from "./db";
import { getBoundWorkspace } from "./workspaceContext";

/**
 * Seat accounting — how many user accounts a customer holds against the limit
 * their subscription allows.
 *
 * A "seat" here is one user ACCOUNT in the customer's own database, not a
 * module grant. The two are different questions and both are called seats
 * elsewhere in the app: `adminOverview.getModuleAccessRows()` counts how many
 * people can open each module (a workspace admin's question — how is my team
 * arranged), while this counts how many people exist at all (the operator's
 * question — is this customer within what they bought). Deliberately kept
 * apart: a person holding four module roles is four module-seats and one
 * billed seat.
 *
 * The limit lives on the control plane (`workspaces.seat_limit`) and reaches a
 * request through the workspace binding, so this needs no control-database
 * round trip — the binding was already resolved to answer the request.
 */

export interface SeatUsage {
  /** User accounts that currently exist in this workspace. */
  used: number;
  /** Accounts allowed, or null when the subscription is uncapped. */
  limit: number | null;
  /** Seats left, or null when uncapped. Never negative. */
  remaining: number | null;
  /** True when another account cannot be created. */
  full: boolean;
}

/** Seat usage for the workspace bound to the current request. */
export async function seatUsage(): Promise<SeatUsage> {
  const limit = getBoundWorkspace()?.seatLimit ?? null;
  const q = sql();
  const rows = (await q`select count(*)::int as n from users`) as Array<{
    n: number;
  }>;
  const used = Number(rows[0]?.n ?? 0);
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    full: limit !== null && used >= limit,
  };
}

/**
 * Throw SEAT_LIMIT_REACHED unless the workspace has room for another account.
 *
 * Enforced server-side at the point of creation, which is the only place it
 * can be trusted: a customer's own admin owns their Users & Roles screen, so
 * the limit has to bind the API rather than the button.
 *
 * Deliberately NOT applied to existing accounts. If an operator lowers a limit
 * below the current headcount, everyone already in the workspace keeps working
 * and only new accounts are refused — cutting off people who were signing in
 * yesterday is a support incident, not enforcement.
 */
export async function requireSeatAvailable(): Promise<SeatUsage> {
  const usage = await seatUsage();
  if (usage.full) throw new Error("SEAT_LIMIT_REACHED");
  return usage;
}
