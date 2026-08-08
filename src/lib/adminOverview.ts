import { sql } from "./db";
import type { Module } from "./modules";
import { ALWAYS_LICENSED, MODULE_META, MODULE_ORDER } from "./moduleMeta";
import { getBoundWorkspace } from "./workspaceContext";

/**
 * The two access tiers, resolved together for the admin surfaces.
 *
 *   • Licence tier — `workspaces.modules` on the control plane: what the
 *     company pays for. Null (and any deployment with no control plane at
 *     all) means everything is licensed; that is the documented default in
 *     controlDb.Workspace, kept so a single-tenant install needs no
 *     licensing data to work.
 *   • Seat tier — `user_module_roles`: who inside the company may open each
 *     module, and in what role.
 *
 * Both the dashboard (`/`) and the admin tabs (`/admin`) show these, so they
 * are computed here once rather than assembled separately in two places and
 * left to drift apart.
 */

export interface ModuleAccessRow {
  module: Module;
  label: string;
  blurb: string;
  /** Licence tier: does the workspace pay for this module at all? */
  licensed: boolean;
  /** Seat tier: distinct users holding at least one active role in it. */
  seats: number;
}

export interface SubscriptionSummary {
  /** Null on a single-tenant install with no control plane. */
  workspaceName: string | null;
  /** True when every module is licensed. */
  unlimited: boolean;
  licensedCount: number;
  totalModules: number;
}

/** Every module, in reading order, with its licence and seat count. */
export async function getModuleAccessRows(): Promise<ModuleAccessRow[]> {
  const q = sql();
  // A user occupies ONE seat in a module however many roles they hold within
  // it, so this counts distinct users rather than grants.
  const seatRows = (await q`
    select module, count(distinct user_id)::int as seats
    from user_module_roles
    where revoked_at is null
    group by module
  `) as Array<{ module: string; seats: number }>;

  const seatByModule = new Map(seatRows.map((r) => [r.module, Number(r.seats)]));
  const licensed = getBoundWorkspace()?.modules ?? null;

  return MODULE_ORDER.map((m) => ({
    module: m,
    label: MODULE_META[m].label,
    blurb: MODULE_META[m].blurb,
    // Mirrors workspaceLicenses(): `admin` is never licensable away, because a
    // workspace that cannot administer itself would depend on us for routine
    // changes.
    licensed:
      m === ALWAYS_LICENSED || licensed === null || licensed.includes(m),
    seats: seatByModule.get(m) ?? 0,
  }));
}

/** Headline counts for the licence tier, derived from the rows above. */
export function summariseSubscription(
  rows: ModuleAccessRow[],
): SubscriptionSummary {
  const bound = getBoundWorkspace();
  return {
    workspaceName: bound?.name ?? null,
    unlimited: (bound?.modules ?? null) === null,
    licensedCount: rows.filter((r) => r.licensed).length,
    totalModules: rows.length,
  };
}
