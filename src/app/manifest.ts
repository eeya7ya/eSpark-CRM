import type { MetadataRoute } from "next";

/**
 * PWA manifest — makes eSpark installable ("Add to Home Screen" /
 * "Install app") on desktop and mobile. Served at /manifest.webmanifest
 * by Next.js. Icons are padded square renders of the brand logo (see
 * public/icons). The browser tab favicon (src/app/icon.png) is the bare
 * glyph instead, cropped tight so it still reads at 16px.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "eSpark CRM",
    short_name: "eSpark",
    description:
      "Quotation design, material pricing and lead management for engineering and contracting teams.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#eae5e1",
    theme_color: "#4c626a",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
