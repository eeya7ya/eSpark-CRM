"use client";

import { Moon, Sun } from "@/lib/icons";
import { useTheme } from "@/context/ThemeContext";

/**
 * Light / dark switch for the app chrome.
 *
 * Printed output is deliberately unaffected — quotation and proposal sheets
 * pin their own fixed light palette (see `--espark-doc-*` in globals.css), so
 * an operator working in dark mode still prints on white paper.
 */
export default function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-espark-border bg-espark-surface/70 text-espark-ink/70 transition-colors hover:border-espark-primary/40 hover:bg-espark-soft hover:text-espark-primary ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
