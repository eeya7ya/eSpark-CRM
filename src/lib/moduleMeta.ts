// Type-only: erased at build, so importing this file from a client component
// does NOT pull `modules.ts` — and through it `db.ts` — into the browser
// bundle. The annotation still makes the map exhaustive over `Module`, so a
// new module added to MODULES fails the typecheck here until it is described.
import type { Module } from "./modules";

/**
 * Presentation metadata for the nine modules — the labels and one-line
 * descriptions the admin surfaces show.
 *
 * This is deliberately separate from `modules.ts`, which owns the modules
 * themselves along with the grant/licence logic and therefore imports the
 * database. Admin panels are client components; they need the names, not the
 * gates.
 *
 * `order` fixes the reading order across every admin surface so the module
 * list does not reshuffle between the dashboard and the tabs. It follows the
 * shape of the business rather than the alphabet: the quoting chain first
 * (crm → pricing → catalogue), then execution (projects → delivery →
 * storage), then the remaining departments, with `admin` last because it is
 * the one module that is never licensable away.
 */
export interface ModuleMeta {
  label: string;
  blurb: string;
  order: number;
}

export const MODULE_META: Record<Module, ModuleMeta> = {
  crm: {
    label: "CRM",
    blurb: "Clients, projects and the quotation pipeline.",
    order: 1,
  },
  pricing: {
    label: "Pricing",
    blurb: "Pricing sheets and the costing lifecycle.",
    order: 2,
  },
  catalogue: {
    label: "Catalogue",
    blurb: "Maintaining the product catalogue and its prices.",
    order: 3,
  },
  projects: {
    label: "Projects",
    blurb: "Execution planning and project distribution.",
    order: 4,
  },
  delivery: {
    label: "Delivery",
    blurb: "Delivery requests, dispatch and the driver queue.",
    order: 5,
  },
  storage: {
    label: "Storage",
    blurb: "Stock, storage checks and warehouse work.",
    order: 6,
  },
  showroom: {
    label: "Showroom",
    blurb: "Showroom staff and floor management.",
    order: 7,
  },
  accountant: {
    label: "Accounting",
    blurb: "Accounting access.",
    order: 8,
  },
  admin: {
    label: "Administration",
    blurb: "This panel — people, access and workspace settings.",
    order: 9,
  },
};

/** Module ids in the reading order above. */
export const MODULE_ORDER = (
  Object.keys(MODULE_META) as Module[]
).sort((a, b) => MODULE_META[a].order - MODULE_META[b].order);

/**
 * `admin` is never licensable away — a workspace that cannot administer itself
 * would depend on us for routine changes. `workspaceLicenses()` enforces this;
 * the admin UI reads it from here so the two cannot drift.
 */
export const ALWAYS_LICENSED: Module = "admin";
