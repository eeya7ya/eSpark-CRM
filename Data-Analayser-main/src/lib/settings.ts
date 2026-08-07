import { sql, ensureSchema } from "./db";
import { getBoundWorkspace } from "./workspaceContext";
import { DEFAULT_TERMS } from "./quotationDraft";
import {
  BRAND_VARIANTS,
  sanitizeBrandVariants,
  type BrandVariant,
} from "./brandVariants";
import {
  DEFAULT_TECH_PROPOSAL_ASSETS,
  type TechProposalAssets,
} from "./techProposalAssets";

// Re-export so existing server-side importers of `@/lib/settings` keep working.
// Client components must import these from `@/lib/techProposalAssets` directly
// (importing them from here would bundle the server-only DB layer).
export {
  DEFAULT_TECH_PROPOSAL_ASSETS,
  type TechProposalAssets,
} from "./techProposalAssets";

/**
 * The company a workspace's printed documents belong to. Every field here was
 * previously hardcoded, which meant every deployment printed one particular
 * company's address and phone numbers whether or not these were its documents.
 */
export interface CompanyDetails {
  legalName: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  taxNumber: string;
  bankDetails: string;
}

export const EMPTY_COMPANY_DETAILS: CompanyDetails = {
  legalName: "",
  address: "",
  phone: "",
  fax: "",
  email: "",
  website: "",
  taxNumber: "",
  bankDetails: "",
};

/**
 * Global, admin-editable presets for every printable quotation.
 *
 * - `defaultTerms` populates the Terms and Conditions block whenever a new
 *   quotation is created or a saved quotation has no stored terms.
 * - `footerText` is rendered at the bottom of every printable sheet.
 */
export interface AppSettings {
  defaultTerms: string[];
  footerText: string;
  /** Identity printed on quotations and proposals. */
  companyDetails: CompanyDetails;
  /**
   * Admin-managed brand bundles. Each pairs a logo with the two full-bleed
   * "company profile" sheets (cover + about-us) printed before a quotation,
   * so picking a logo in the Designer prints its matching company profile.
   */
  brandVariants: BrandVariant[];
  /** Central company images for the Technical Proposal (see techProposalAssets.ts). */
  techProposalAssets: TechProposalAssets;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultTerms: [...DEFAULT_TERMS],
  // Deliberately blank. The footer carries a company's postal address and
  // phone numbers, so there is no safe generic default — a hardcoded one
  // prints the wrong company's contact details on every quotation until an
  // admin notices. Each workspace supplies its own via Admin → Settings
  // (and, once provisioned, from its `companyDetails`).
  footerText: "",
  companyDetails: { ...EMPTY_COMPANY_DETAILS },
  brandVariants: [...BRAND_VARIANTS],
  techProposalAssets: { ...DEFAULT_TECH_PROPOSAL_ASSETS },
};

/** Coerce each company field to a string, defaulting to "". */
function normalizeCompanyDetails(value: unknown): CompanyDetails {
  const v = (value ?? {}) as Partial<CompanyDetails>;
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  return {
    legalName: s(v.legalName),
    address: s(v.address),
    phone: s(v.phone),
    fax: s(v.fax),
    email: s(v.email),
    website: s(v.website),
    taxNumber: s(v.taxNumber),
    bankDetails: s(v.bankDetails),
  };
}

/**
 * The footer line for printed sheets: an explicitly-set `footerText` wins,
 * otherwise one is composed from the company details so filling those in is
 * enough to get a correct footer without also retyping it here.
 */
export function resolveFooterText(settings: AppSettings): string {
  if (settings.footerText.trim()) return settings.footerText;
  const c = settings.companyDetails;
  const parts: string[] = [];
  if (c.address) parts.push(`Address: ${c.address}`);
  if (c.phone) parts.push(`Tel: ${c.phone}`);
  if (c.fax) parts.push(`Fax: ${c.fax}`);
  if (c.email) parts.push(c.email);
  return parts.join(" · ");
}

const KEY = "global";

/**
 * Coerce a persisted row into an AppSettings shape. Only fills in defaults
 * for fields that are MISSING or the wrong type — an empty string or empty
 * array is a legitimate admin choice and must be preserved, otherwise the
 * admin has no way to clear a value.
 *
 * Handles the case where the jsonb column comes back as a raw JSON STRING
 * rather than a parsed object. Under `prepare: false` (mandatory for the
 * Supabase transaction pooler), postgres.js can't introspect the column
 * type and occasionally surfaces jsonb as text — this is the same
 * normalisation QuotationViewer applies to `items_json` / `config_json`.
 * Without this unwrap, every settings read returned all-defaults on the
 * serverless deploy, which is why the Save toast flashed "Saved." and the
 * form immediately re-seeded to the built-in defaults.
 */
function normalize(value: unknown): AppSettings {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  const v = (raw ?? {}) as Partial<AppSettings>;
  return {
    defaultTerms: Array.isArray(v.defaultTerms)
      ? v.defaultTerms.map((t) => String(t ?? ""))
      : [...DEFAULT_APP_SETTINGS.defaultTerms],
    footerText:
      typeof v.footerText === "string"
        ? v.footerText
        : DEFAULT_APP_SETTINGS.footerText,
    companyDetails: normalizeCompanyDetails(v.companyDetails),
    // `sanitizeBrandVariants` falls back to the built-in defaults when the
    // field is missing (legacy rows) or empty, so printing always has at
    // least one brand bundle to resolve against.
    brandVariants: sanitizeBrandVariants(v.brandVariants),
    techProposalAssets: normalizeTechProposalAssets(v.techProposalAssets),
  };
}

/** Coerce each central Technical-Proposal image to a string, defaulting to "". */
function normalizeTechProposalAssets(value: unknown): TechProposalAssets {
  const v = (value ?? {}) as Partial<TechProposalAssets>;
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  return {
    authorizedCert: s(v.authorizedCert),
    teamCerts: s(v.teamCerts),
    pmCert: s(v.pmCert),
    references: s(v.references),
  };
}

// Tiny per-process cache so a single request's multiple settings reads
// (Designer + QuotationViewer + layout gate) don't each hit the DB. Short
// TTL so admin edits propagate across warm lambdas within seconds.
const CACHE_TTL_MS = 5_000;
// Hard ceiling on a single DB read. With postgres `max: 1` + transaction
// pooler, a hung query on another request serialises behind this one, so
// we cannot afford to wait indefinitely. On timeout we serve the last
// cached value if we have one; otherwise we assume DEFAULTS and let the
// real fetch finish in the background for the next request.
const READ_TIMEOUT_MS = 8_000;
// Both caches are keyed PER WORKSPACE. One warm lambda serves several
// workspaces, and a shared entry would hand workspace B the terms, footer,
// logos and company details belonging to workspace A — a cross-workspace leak
// of exactly the settings this feature exists to keep separate.
const globalForSettings = globalThis as unknown as {
  __mtAppSettingsCache?: Map<string, { at: number; data: AppSettings }>;
  __mtAppSettingsInFlight?: Map<string, Promise<AppSettings>>;
};

/** Cache identity of the settings row being read. */
function settingsKey(): string {
  return getBoundWorkspace()?.slug ?? "single";
}

function cacheMap(): Map<string, { at: number; data: AppSettings }> {
  if (!globalForSettings.__mtAppSettingsCache) {
    globalForSettings.__mtAppSettingsCache = new Map();
  }
  return globalForSettings.__mtAppSettingsCache;
}

function readCached(): { at: number; data: AppSettings } | undefined {
  return cacheMap().get(settingsKey());
}

function writeCached(data: AppSettings): void {
  cacheMap().set(settingsKey(), { at: Date.now(), data });
}

async function queryDb(): Promise<AppSettings> {
  await ensureSchema();
  const q = sql();
  const rows = (await q`
    select value from app_settings where key = ${KEY} limit 1
  `) as Array<{ value: unknown }>;
  const data =
    rows.length === 0 ? { ...DEFAULT_APP_SETTINGS } : normalize(rows[0].value);
  writeCached(data);
  return data;
}

function readFromDb(): Promise<AppSettings> {
  // Coalesce concurrent callers onto a single in-flight query so multiple
  // callers hitting the same cold lambda don't each open a fresh round-trip.
  const key = settingsKey();
  if (!globalForSettings.__mtAppSettingsInFlight) {
    globalForSettings.__mtAppSettingsInFlight = new Map();
  }
  const pending = globalForSettings.__mtAppSettingsInFlight;
  let inflight = pending.get(key);
  if (!inflight) {
    inflight = queryDb().finally(() => {
      pending.delete(key);
    });
    pending.set(key, inflight);
  }
  // Swallow the background rejection so unhandled-rejection noise doesn't
  // leak out; the raced copy below still surfaces errors to the caller.
  inflight.catch(() => {});
  return inflight;
}

/**
 * Returns the current app settings. `fresh: true` skips the in-process
 * cache so the admin Settings tab always seeds from the latest persisted
 * row (critical on Vercel where each lambda keeps its own cache).
 *
 * Reads race against an 8s timeout. If the query is still outstanding we
 * hand back the last-known cache (or defaults, if none exists) and let
 * the background fetch populate the cache for the next request. This is
 * the "wait, but never wait forever" shape — the earlier 400ms timeout
 * lied to callers on every cold start, and removing the timeout entirely
 * deadlocked callers on a slow pooler.
 */
export async function getAppSettings(
  opts: { fresh?: boolean } = {},
): Promise<AppSettings> {
  const cached = readCached();
  if (!opts.fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }
  const inflight = readFromDb();
  const timeout = new Promise<"TIMEOUT">((resolve) =>
    setTimeout(() => resolve("TIMEOUT"), READ_TIMEOUT_MS),
  );
  try {
    const result = await Promise.race([inflight, timeout]);
    if (result !== "TIMEOUT") return result;
  } catch {
    return cached?.data ?? { ...DEFAULT_APP_SETTINGS };
  }
  return cached?.data ?? { ...DEFAULT_APP_SETTINGS };
}

/**
 * Upsert the global settings row with a partial patch and return the
 * row PostgreSQL actually wrote. Throws if the upsert no-ops (e.g. the
 * jsonb cast rejected the payload) so the admin never sees a false
 * "Saved." toast.
 */
export async function saveAppSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  await ensureSchema();
  const q = sql();
  const currentRows = (await q`
    select value from app_settings where key = ${KEY} limit 1
  `) as Array<{ value: unknown }>;
  const current = currentRows[0]
    ? normalize(currentRows[0].value)
    : { ...DEFAULT_APP_SETTINGS };
  const next = normalize({ ...current, ...patch });
  const json = JSON.stringify(next);
  const rows = (await q`
    insert into app_settings (key, value, updated_at)
    values (${KEY}, ${json}::jsonb, now())
    on conflict (key) do update
      set value = excluded.value,
          updated_at = now()
    returning value
  `) as Array<{ value: unknown }>;
  if (rows.length === 0) {
    throw new Error(
      "app_settings upsert did not return a row — the database rejected the payload",
    );
  }
  const saved = normalize(rows[0].value);
  writeCached(saved);
  return saved;
}
