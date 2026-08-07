"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Shared with the pre-paint script in the root layout — keep the two in sync. */
export const THEME_STORAGE_KEY = "espark-theme";

/**
 * The CRM defaults to **light**, unlike the eSpark marketing site which opens
 * dark. An operations tool is used all day next to printed A4 paperwork, and
 * light keeps the screen consistent with what comes out of the printer. Dark is
 * opt-in and remembered per browser.
 */
export const DEFAULT_THEME: Theme = "light";

function applyTheme(next: Theme) {
  const root = document.documentElement;
  // Suppress transitions for one frame so the page doesn't cross-fade colour
  // by colour, which reads as a flicker across a dense CRM screen.
  root.classList.add("theme-switching");
  root.classList.remove("light", "dark");
  root.classList.add(next);
  root.style.colorScheme = next;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialised to the default rather than by reading the DOM, so the server
  // and first client render agree. The pre-paint script has already put the
  // correct class on <html>; the effect below reconciles React's copy of it.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    let stored: Theme | null = null;
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === "light" || raw === "dark") stored = raw;
    } catch {
      // Private-mode / blocked storage — fall back to the default silently.
    }
    const initial = stored ?? DEFAULT_THEME;
    setThemeState(initial);
    // The pre-paint script already set this, so this is a no-op in the common
    // case; it matters when storage was unreadable then and readable now.
    document.documentElement.classList.add(initial);
    document.documentElement.classList.remove(
      initial === "dark" ? "light" : "dark",
    );
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Not persisting is acceptable; the toggle still works for this session.
    }
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
