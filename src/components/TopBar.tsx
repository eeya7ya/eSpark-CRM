"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, LogOut, ArrowLeft, HelpCircle } from "@/lib/icons";
import type { SessionUser } from "@/lib/auth";
import NotificationsBell, {
  clearNotificationsCache,
} from "@/components/NotificationsBell";
import SideNav from "@/components/SideNav";
import HelpCenter from "@/components/HelpCenter";
import AppFooter from "@/components/AppFooter";
import BrandLogo from "@/components/brand/BrandLogo";
import ThemeToggle from "@/components/ThemeToggle";

interface ModuleRole {
  module: string;
  role: string;
}

// Module roles barely change within a session, and every page mounts its
// own TopBar — cache the first fetch so navigation doesn't re-hit
// /api/auth/me on each page. A hard reload naturally refreshes it.
let moduleRolesCache: ModuleRole[] | null = null;

/**
 * V1.3a app chrome. The top bar is now intentionally minimal — brand,
 * the LHS-drawer toggle, the notification bell, and the user/sign-out
 * controls. All module navigation (CRM, Storage, Pricing, Projects) and
 * Admin moved into the collapsible SideNav drawer so the bar stays
 * clean and fills the full width. The fixed AppFooter (version bar) and
 * the SideNav are rendered here so every page that mounts <TopBar/>
 * gets the full chrome with no per-page wiring.
 */
export default function TopBar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const [moduleRoles, setModuleRoles] = useState<ModuleRole[] | null>(
    moduleRolesCache
  );
  const [navOpen, setNavOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // The dashboard ("/") is the top of the hierarchy — nothing to go back to —
  // so the global Back control is hidden there and shown on every other page.
  const showBack = pathname !== "/";

  function goBack() {
    // history.length > 1 means there's a real previous entry to pop. When the
    // page was opened directly (deep link, new tab), fall back to the
    // dashboard so the button is never a dead end.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  useEffect(() => {
    if (moduleRolesCache) return;
    let cancelled = false;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { module_roles?: ModuleRole[] }) => {
        if (Array.isArray(data.module_roles)) {
          moduleRolesCache = data.module_roles;
          if (!cancelled) setModuleRoles(data.module_roles);
        }
      })
      .catch(() => {
        if (!cancelled) setModuleRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    moduleRolesCache = null;
    clearNotificationsCache();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-espark-border/60 bg-espark-surface/70 backdrop-blur-xl shadow-es-soft">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {showBack && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Go back to the previous page"
                title="Back"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-espark-border/70 bg-espark-surface/70 px-3 text-espark-ink/80 shadow-sm hover:border-espark-primary/40 hover:text-espark-primary transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden text-xs font-semibold sm:inline">Back</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-espark-border/70 bg-espark-surface/70 px-3 text-espark-ink/80 shadow-sm hover:border-espark-primary/40 hover:text-espark-primary transition-colors"
            >
              <Menu className="h-4 w-4" />
              <span className="hidden text-xs font-semibold sm:inline">Menu</span>
            </button>
            <Link
              href="/"
              className="group flex min-w-0 items-center gap-3"
              aria-label="eSpark · Dashboard"
            >
              {/* Vector lockup rather than a raster: it re-colours itself with
                  the theme, so one asset serves both light and dark chrome. */}
              <BrandLogo
                className="transition-transform group-hover:scale-[1.02]"
                glyphClassName="h-7 sm:h-8"
                wordmarkClassName="text-lg sm:text-xl"
              />
              <span className="hidden rounded-full bg-gradient-to-r from-espark-primary/10 to-espark-accent/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-espark-primary/80 md:inline-block">
                Dashboard
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Open help center"
              title="Help"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-espark-border/70 bg-espark-surface/70 px-3 text-espark-ink/80 shadow-sm hover:border-espark-primary/40 hover:text-espark-primary transition-colors"
            >
              {/* A question mark reads as "help" at 16px; the lifebuoy's spokes
                  collapsed into an unreadable wheel at this size. */}
              <HelpCircle className="h-4 w-4" strokeWidth={2.25} />
              <span className="hidden text-xs font-semibold sm:inline">Help</span>
            </button>
            <NotificationsBell />
            <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-espark-border/60 bg-espark-surface/60 px-3 py-1 text-[11px] font-medium text-espark-ink/70 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {user.display_name || user.username}
              <span className="text-espark-ink/40">· {user.role}</span>
            </span>
            <button
              onClick={logout}
              aria-label="Sign out"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-espark-ink to-espark-ink/80 px-3 py-1.5 text-xs font-semibold text-espark-on-ink shadow-sm transition-all hover:from-espark-primary hover:to-espark-primary/80 hover:shadow-md"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <SideNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        user={user}
        moduleRoles={moduleRoles}
      />
      <HelpCenter
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        user={user}
        moduleRoles={moduleRoles}
      />
      <AppFooter />
    </>
  );
}
