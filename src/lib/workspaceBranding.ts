import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { hasControlPlane, getWorkspaceBySlugCached } from "./controlDb";

/**
 * Pre-login branding: the parts of a workspace's identity the app needs before
 * (or without) a session — its name in the UI, and its colour palette.
 *
 * These live in the control database rather than the workspace's own, because
 * the login screen has to render them before there is any session to bind a
 * workspace from. Everything a signed-in user sees on printed documents —
 * logos, company details, terms — stays in the workspace's own `app_settings`.
 */

export interface WorkspaceBranding {
  /** Replaces "eSpark" in the UI chrome. */
  appName: string;
  /** One line under the sign-in heading. */
  loginTagline: string;
  /** Logo shown in the app chrome. Empty falls back to the built-in mark. */
  logoUrl: string;
  /**
   * Overrides for the `--espark-*` design tokens, as space-separated RGB
   * channels ("14 52 96") to match how globals.css declares them. Only the
   * keys present are overridden, so a workspace can restyle just its primary
   * colour without having to restate the whole palette.
   */
  palette: Record<string, string>;
}

/** Tokens a workspace may override. Anything else in `palette` is ignored. */
const ALLOWED_TOKENS = new Set([
  "primary",
  "primary-light",
  "accent",
  "accent2",
  "ink",
  "muted",
  "canvas",
  "surface",
  "soft",
  "header",
  "border",
  "highlight",
  "on-ink",
]);

/** `"14 52 96"` — three 0-255 channels, which is what the tokens hold. */
const RGB_TRIPLET = /^\d{1,3} \d{1,3} \d{1,3}$/;

export const NO_BRANDING: WorkspaceBranding = {
  appName: "",
  loginTagline: "",
  logoUrl: "",
  palette: {},
};

/**
 * Coerce a stored branding blob into a usable shape, dropping anything
 * unrecognised. Values reach the page inside a `<style>` block, so each is
 * validated against a strict pattern rather than trusted — a stored value must
 * never be able to close the tag or inject a declaration of its own.
 */
export function normalizeBranding(raw: Record<string, unknown>): WorkspaceBranding {
  const s = (x: unknown, max: number) =>
    typeof x === "string" ? x.slice(0, max) : "";
  const palette: Record<string, string> = {};
  const rawPalette = raw.palette;
  if (rawPalette && typeof rawPalette === "object") {
    for (const [key, value] of Object.entries(rawPalette)) {
      if (!ALLOWED_TOKENS.has(key)) continue;
      if (typeof value !== "string" || !RGB_TRIPLET.test(value)) continue;
      if (value.split(" ").some((n) => Number(n) > 255)) continue;
      palette[key] = value;
    }
  }
  return {
    appName: s(raw.appName, 60),
    loginTagline: s(raw.loginTagline, 160),
    logoUrl: s(raw.logoUrl, 500),
    palette,
  };
}

/**
 * Branding for the current request.
 *
 * Prefers the signed-in session's workspace. Failing that it falls back to the
 * `espark_ws` cookie — the workspace this browser last signed into — so a
 * returning user sees their own colours on the login screen rather than a
 * generic one. That cookie is user-controlled, but it selects nothing more
 * than a palette and a name, so the worst it can do is show the wrong
 * branding to whoever set it.
 */
export async function getRequestBranding(): Promise<WorkspaceBranding> {
  if (!hasControlPlane()) return NO_BRANDING;
  try {
    const jar = await cookies();
    let slug = "";

    const token = jar.get("mt_session")?.value;
    if (token) {
      const authSecret = process.env.AUTH_SECRET;
      if (authSecret && authSecret.length >= 16) {
        try {
          const { payload } = await jwtVerify(
            token,
            new TextEncoder().encode(authSecret),
            { algorithms: ["HS256"] },
          );
          slug = String(payload.ws || "");
        } catch {
          // An expired or invalid session just means we fall through to the
          // remembered-workspace cookie below.
        }
      }
    }
    if (!slug) slug = jar.get("espark_ws")?.value || "";
    if (!slug) return NO_BRANDING;

    const ws = await getWorkspaceBySlugCached(slug);
    if (!ws || ws.status !== "active") return NO_BRANDING;
    return normalizeBranding(ws.branding);
  } catch {
    // Branding is decoration. It must never be the reason a page fails.
    return NO_BRANDING;
  }
}

/**
 * The CSS overriding the design tokens for this workspace, or "" when there is
 * nothing to override. Emitted server-side into the document head so the
 * correct palette is present on first paint — the tokens are consumed as
 * `rgb(var(--espark-x) / <alpha>)`, so redefining them restyles the whole app
 * with no client JavaScript and no flash of the default colours.
 */
export function paletteCss(branding: WorkspaceBranding): string {
  const entries = Object.entries(branding.palette);
  if (entries.length === 0) return "";
  const decls = entries
    .map(([token, value]) => `--espark-${token}:${value};`)
    .join("");
  return `:root{${decls}}`;
}
