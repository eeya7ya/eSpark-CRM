import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Cairo } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ClickTracker from "@/components/ClickTracker";
import IconProvider from "@/components/IconProvider";
import { ThemeProvider, THEME_STORAGE_KEY } from "@/context/ThemeContext";

/**
 * Geist is the eSpark brand face. Self-hosted from `src/fonts` (the same
 * variable WOFF2 files the eSpark site ships) rather than fetched from Google,
 * so the CRM renders correctly on an air-gapped or offline-first install.
 */
const geistSans = localFont({
  src: [{ path: "../fonts/GeistVF.woff2", style: "normal" }],
  variable: "--font-geist-sans",
  display: "swap",
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ],
});

const geistMono = localFont({
  src: [{ path: "../fonts/GeistMonoVF.woff2", style: "normal" }],
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

/** Arabic companion face — Geist has no Arabic coverage. */
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "eSpark — Data Analytics & Quotation Platform",
  description: "Data analytics and quotation platform powered by AI.",
  applicationName: "eSpark",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "eSpark",
  },
};

export const viewport: Viewport = {
  // St. Pauls Blue — the eSpark primary.
  themeColor: "#4c626a",
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the stored theme before first paint.
 *
 * Without this the page would render with the default light class, then swap to
 * dark once React hydrates — a full-screen white flash for dark-mode users on
 * every navigation. Runs synchronously in <head>, so the class is on <html>
 * before the browser paints anything. Kept dependency-free and tiny; it is
 * inlined into every HTML response.
 */
const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="dark"&&t!=="light")t="light";var e=document.documentElement;e.classList.remove("light","dark");e.classList.add(t);e.style.colorScheme=t;}catch(_){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`light ${geistSans.variable} ${geistMono.variable} ${cairo.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen text-espark-ink antialiased selection:bg-espark-primary/20 selection:text-espark-ink">
        <ThemeProvider>
          <ServiceWorkerRegister />
          <ClickTracker />
          <IconProvider>{children}</IconProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
