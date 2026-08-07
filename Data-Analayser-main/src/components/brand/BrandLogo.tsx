"use client";

import BrandGlyph from "./BrandGlyph";

/**
 * BrandLogo — the eSpark lockup: the theme-aware node glyph next to the
 * wordmark. Fully vector and token-driven, so it is crisp at any size and
 * legible on both themes.
 *
 * The wordmark is a single solid colour (the theme ink), matching the brand
 * deck — no per-letter gradient. Used in the CRM top bar and sign-in screen.
 * Printed documents deliberately use the raster `/logo.png` instead, because
 * the PDF pipeline rasterises through html2canvas and a fixed dark-ink asset
 * reproduces more reliably than a token-coloured SVG.
 */
export default function BrandLogo({
  wordmark = "eSpark",
  showGlyph = true,
  className = "",
  glyphClassName = "h-9",
  wordmarkClassName = "text-2xl",
  tone = "theme",
}: {
  wordmark?: string;
  showGlyph?: boolean;
  className?: string;
  glyphClassName?: string;
  wordmarkClassName?: string;
  /** See BrandGlyph — `current` inherits the surrounding colour instead of
   *  the theme tokens, for panels that own their own palette. */
  tone?: "theme" | "current";
}) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className}`}
      dir="ltr"
      style={{ direction: "ltr" }}
    >
      {showGlyph && (
        <BrandGlyph
          className={`w-auto shrink-0 ${glyphClassName}`}
          title={wordmark}
          tone={tone}
        />
      )}
      <span
        className={`font-bold tracking-tight leading-none whitespace-nowrap ${
          tone === "current" ? "" : "text-espark-ink"
        } ${wordmarkClassName}`}
      >
        {wordmark}
      </span>
    </span>
  );
}
