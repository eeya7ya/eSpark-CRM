import type { Config } from "tailwindcss";

/**
 * eSpark design tokens.
 *
 * Every colour is driven by a CSS custom property holding **space-separated
 * RGB channels** (e.g. `--espark-primary: 76 98 106`), consumed here as
 * `rgb(var(--x) / <alpha-value>)`. That indirection is what lets the whole app
 * flip between the light and dark eSpark palettes by toggling a single `.dark`
 * class on <html>, while keeping Tailwind's opacity modifiers
 * (`bg-espark-primary/60`, `text-espark-ink/70`, …) working exactly as before.
 *
 * Palette source: the eSpark brand site (`src/app/globals.css` there) —
 * St. Pauls Blue, Arctic Grey, Minty Breeze, Tender Grey, Band Stone and
 * Classic White. Greys are the foundation; primary→accent forms the gradient
 * used on icons, headings and buttons.
 */

/** Shorthand: a token backed by a CSS variable, with alpha-modifier support. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  // Theme switching is class-based (`<html class="dark">`) rather than
  // media-based, because the CRM ships an explicit user-facing toggle and
  // must be able to force light for print regardless of OS preference.
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        espark: {
          /** Brand primary — St. Pauls Blue. Drives CTAs, active states, links. */
          primary: v("espark-primary"),
          /** Primary text colour ("ink"), inverts between themes. */
          ink: v("espark-ink"),
          /** Muted body/secondary text. */
          muted: v("espark-muted"),
          /** Panel + page-section background one step off the canvas. */
          soft: v("espark-soft"),
          /** Hairlines, dividers, input outlines. */
          border: v("espark-border"),
          /** Table headers and other "raised" strips. */
          header: v("espark-header"),
          /** Search-match / attention highlight. */
          highlight: v("espark-highlight"),
          /** Secondary accent — Minty Breeze. Pairs with primary in gradients. */
          accent: v("espark-accent"),
          /** Tertiary accent — Minty Breeze light. */
          accent2: v("espark-accent2"),
          /** Card / glass surface. Opaque token; use /60–/90 for glass. */
          surface: v("espark-surface"),
          /** The page canvas itself. */
          canvas: v("espark-canvas"),
          /** Label colour for text placed on an `espark-ink` fill. */
          "on-ink": v("espark-on-ink"),
          /** Modal backdrop — dark in both themes, by design. */
          scrim: v("espark-scrim"),
        },

        /**
         * Theme-aware status palette.
         *
         * The app expresses status with tinted Tailwind triplets
         * (`bg-red-50 text-red-700 border-red-200`). Left as literals those
         * would stay pale-on-pale in dark mode, so the shades actually used
         * are re-pointed at CSS variables and re-tinted under `.dark`. This
         * fixes ~2,400 usages without touching a single component file.
         */
        red: {
          50: v("c-red-50"),
          100: v("c-red-100"),
          200: v("c-red-200"),
          300: v("c-red-300"),
          400: v("c-red-400"),
          500: v("c-red-500"),
          600: v("c-red-600"),
          700: v("c-red-700"),
          800: v("c-red-800"),
          900: v("c-red-900"),
        },
        emerald: {
          50: v("c-emerald-50"),
          100: v("c-emerald-100"),
          200: v("c-emerald-200"),
          300: v("c-emerald-300"),
          400: v("c-emerald-400"),
          500: v("c-emerald-500"),
          600: v("c-emerald-600"),
          700: v("c-emerald-700"),
          800: v("c-emerald-800"),
          900: v("c-emerald-900"),
        },
        amber: {
          50: v("c-amber-50"),
          100: v("c-amber-100"),
          200: v("c-amber-200"),
          300: v("c-amber-300"),
          400: v("c-amber-400"),
          500: v("c-amber-500"),
          600: v("c-amber-600"),
          700: v("c-amber-700"),
          800: v("c-amber-800"),
          900: v("c-amber-900"),
        },
        cyan: {
          50: v("c-cyan-50"),
          100: v("c-cyan-100"),
          200: v("c-cyan-200"),
          300: v("c-cyan-300"),
          400: v("c-cyan-400"),
          500: v("c-cyan-500"),
          600: v("c-cyan-600"),
          700: v("c-cyan-700"),
          800: v("c-cyan-800"),
          900: v("c-cyan-900"),
        },
        rose: {
          50: v("c-rose-50"),
          100: v("c-rose-100"),
          200: v("c-rose-200"),
          300: v("c-rose-300"),
          400: v("c-rose-400"),
          500: v("c-rose-500"),
          600: v("c-rose-600"),
          700: v("c-rose-700"),
          800: v("c-rose-800"),
          900: v("c-rose-900"),
        },
        gray: {
          50: v("c-gray-50"),
          100: v("c-gray-100"),
          200: v("c-gray-200"),
          300: v("c-gray-300"),
          400: v("c-gray-400"),
          500: v("c-gray-500"),
          600: v("c-gray-600"),
          700: v("c-gray-700"),
          800: v("c-gray-800"),
          900: v("c-gray-900"),
        },
        slate: {
          50: v("c-gray-50"),
          100: v("c-gray-100"),
          200: v("c-gray-200"),
          300: v("c-gray-300"),
          400: v("c-gray-400"),
          500: v("c-gray-500"),
          600: v("c-gray-600"),
          700: v("c-gray-700"),
          800: v("c-gray-800"),
          900: v("c-gray-900"),
        },
      },
      fontFamily: {
        // Geist is the eSpark brand face; Cairo carries Arabic (it has no
        // Latin metrics conflict because it only ever applies under [dir=rtl]).
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        arabic: ["var(--font-cairo)", "Cairo", "Segoe UI", "Tahoma", "sans-serif"],
      },
      backgroundImage: {
        // Ambient canvas glow, tinted with the eSpark primary/accent pair
        // instead of the old red/indigo/cyan. Channels come from the same
        // variables as everything else, so it re-tints with the theme.
        "es-canvas":
          "radial-gradient(1200px 600px at 10% -10%, rgb(var(--espark-primary) / 0.10), transparent 60%), radial-gradient(900px 500px at 100% 10%, rgb(var(--espark-accent) / 0.10), transparent 60%), radial-gradient(800px 500px at 50% 110%, rgb(var(--espark-accent2) / 0.08), transparent 60%), linear-gradient(180deg, rgb(var(--espark-canvas)) 0%, rgb(var(--espark-soft)) 100%)",
        "es-glow":
          "linear-gradient(135deg, rgb(var(--espark-primary) / 0.9) 0%, rgb(var(--espark-primary-light) / 0.9) 50%, rgb(var(--espark-accent) / 0.9) 100%)",
      },
      boxShadow: {
        "es-soft":
          "0 1px 2px rgb(var(--espark-shadow) / 0.04), 0 8px 24px -12px rgb(var(--espark-shadow) / 0.12)",
        "es-lift":
          "0 4px 12px rgb(var(--espark-shadow) / 0.06), 0 24px 60px -20px rgb(var(--espark-accent) / 0.25)",
      },
      keyframes: {
        "es-float": {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "es-pulse-soft": {
          "0%,100%": { opacity: "0.7" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "es-float": "es-float 6s ease-in-out infinite",
        "es-pulse-soft": "es-pulse-soft 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
