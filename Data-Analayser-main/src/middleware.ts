import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";

/**
 * Edge middleware with two jobs:
 *
 *  1. Block every mutation API call from a viewer. Viewer accounts see
 *     everything but must never change anything, so any non-GET `/api/**`
 *     request is rejected with 403 when the session JWT has `role: viewer`.
 *     Individual route handlers don't need their own check.
 *
 *  2. Force an admin-set password to be replaced before the app is usable.
 *     When the session JWT carries `mustChange: true` (set on account
 *     creation / admin reset, and for every pre-existing user at upgrade),
 *     every page request is redirected to `/change-password` until the user
 *     sets their own password. The flag lives in the JWT so this stays a
 *     cheap, DB-free check at the edge.
 *
 * Carve-outs:
 *   - GET / HEAD / OPTIONS API calls pass through (reads).
 *   - `/api/auth/*` passes through so a logged-in (or must-change, or viewer)
 *     account can refresh `/auth/me`, change its password, and sign out.
 *   - A small allowlist of POSTs that are conceptually read-only.
 *   - `/login` and `/change-password` are always reachable so the gate can't
 *     trap the user in a redirect loop.
 *
 * If the cookie is missing or invalid the middleware does nothing — the page's
 * own `getSessionUser` gate (or the route handler's 401) takes over.
 */

const COOKIE = "mt_session";
const ALG = "HS256";

const AUTH_PASS_THROUGH = new Set<string>([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/change-password",
]);

const POST_READS = new Set<string>([
  "/api/database/search",
  // Click telemetry is conceptually read-only; let every role (incl. viewers)
  // post their clicks so the Syslog feed is complete.
  "/api/syslog",
]);

// Pages a must-change user may still reach (otherwise the redirect loops).
const PW_CHANGE_ALLOW = new Set<string>(["/change-password", "/login"]);

function isMutation(method: string): boolean {
  return (
    method === "POST" ||
    method === "PATCH" ||
    method === "PUT" ||
    method === "DELETE"
  );
}

async function readSession(req: NextRequest): Promise<JWTPayload | null> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Enforce that a session is used on its own workspace's hostname.
 *
 * Inert until `WORKSPACE_DOMAIN` is set (e.g. `espark.dev`), because until
 * workspaces get their own subdomains every deployment is served from one
 * host — and on a `*.vercel.app` hostname a naive subdomain check would reject
 * every request. Once wildcard domains are in place, setting the variable
 * turns `acme.espark.dev` into a hard boundary: a session for another
 * workspace is refused rather than silently served the wrong branding.
 *
 * Returns the workspace slug the host demands, or null if there is nothing to
 * enforce.
 */
function hostWorkspace(req: NextRequest): string | null {
  const domain = process.env.WORKSPACE_DOMAIN;
  if (!domain) return null;
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (!host.endsWith(`.${domain}`)) return null;
  const sub = host.slice(0, -(domain.length + 1));
  // Only a single leading label names a workspace; anything deeper is not one.
  if (!sub || sub.includes(".")) return null;
  return sub;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const payload = await readSession(req);

  // A session presented on a different workspace's hostname is discarded
  // rather than honoured. The page gate and route handlers then treat the
  // request as signed out, sending the user to that workspace's login.
  //
  // The platform surface is exempt: it is not a workspace, so it has no
  // matching hostname, and an operator who also holds a workspace account
  // should not have that session torn down for visiting it.
  const isPlatform =
    pathname.startsWith("/platform") || pathname.startsWith("/api/platform/");
  const required = isPlatform ? null : hostWorkspace(req);
  if (payload && required && payload.ws !== required) {
    const res = isApi
      ? NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(COOKIE);
    return res;
  }

  if (isApi) {
    if (!isMutation(req.method)) return NextResponse.next();
    if (AUTH_PASS_THROUGH.has(pathname)) return NextResponse.next();
    if (POST_READS.has(pathname)) return NextResponse.next();
    // The platform surface authenticates against its own cookie and control
    // database. Judging it by the workspace session's role would let a viewer
    // account in some workspace block an unrelated operator action.
    if (pathname.startsWith("/api/platform/")) return NextResponse.next();
    if (payload?.role === "viewer") {
      return NextResponse.json(
        { error: "Viewer accounts are read-only." },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  // Page request: hold a must-change user on /change-password until they set
  // their own password. The platform pages are exempt — they are a different
  // login entirely, and an operator should not be bounced to a workspace
  // password screen because they also hold a workspace account.
  if (
    payload?.mustChange === true &&
    !PW_CHANGE_ALLOW.has(pathname) &&
    !pathname.startsWith("/platform")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on the API (viewer guard) and on page routes (password-change gate),
  // but never on Next internals or static files (anything with a file
  // extension), so assets and RSC chunks are untouched.
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.).*)",
  ],
};
