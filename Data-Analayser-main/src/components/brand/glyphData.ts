/**
 * eSpark brand glyph - shared geometry.
 *
 * The four nodes (learn · build · energy · share) and the connectors between
 * them are the heart of the eSpark mark. This data is the single source of
 * truth, consumed by:
 *   • BrandGlyph / BrandLogo - the static, theme-aware logo (navbar, footer, hero)
 *   • SparkIntro             - the animated opening
 *
 * Coordinates match the original brand "Shorts" SVG (viewBox 0 0 1920 900), so
 * the animated intro and the static logo are pixel-identical in composition.
 */

export const NODE_R = 48;

export interface GlyphNode {
  /** node id / short label */
  id: string;
  /** node centre */
  cx: number;
  cy: number;
  /** transform that places the lucide-style icon inside the node */
  iconTransform: string;
  /** the icon path data (drawn in the signature gradient) */
  iconPath: string;
}

export const NODES: GlyphNode[] = [
  {
    id: "learn",
    cx: 110,
    cy: 170,
    iconTransform:
      "translate(110 170) scale(0.8889) translate(-37.5 24.5) scale(0.1 -0.1)",
    iconPath:
      "M280 431 c-52 -21 -131 -50 -174 -66 l-79 -28 35 -14 35 -14 -2 -60 c-1 -33 -5 -62 -8 -66 -4 -3 -4 -17 -1 -30 7 -28 -17 -69 -46 -78 -11 -3 -20 -10 -20 -14 0 -13 77 -44 93 -38 19 7 29 64 19 102 -5 17 -7 35 -5 42 2 6 -1 14 -6 18 -12 7 -15 73 -5 99 4 11 13 14 29 10 13 -3 33 1 47 9 72 47 310 47 389 0 23 -14 31 -13 87 7 52 19 74 40 41 40 -5 0 -81 27 -170 60 -88 33 -161 60 -162 59 -1 -1 -45 -18 -97 -38z M293 310 c-95 -13 -103 -20 -103 -90 l0 -59 57 26 c81 37 196 37 277 0 l57 -26 -3 62 c-3 61 -3 62 -38 73 -51 17 -175 24 -247 14z",
  },
  {
    id: "build",
    cx: 318,
    cy: 346,
    iconTransform:
      "translate(318 346) scale(0.8889) translate(-33.0 29.0) scale(0.1 -0.1)",
    iconPath:
      "M306 302 c-64 -293 -62 -282 -37 -282 24 0 20 -14 81 264 56 257 58 276 31 276 -16 0 -25 -34 -75 -258z M92 367 c-39 -40 -72 -75 -72 -79 0 -14 146 -148 162 -148 37 0 28 25 -33 86 l-63 64 63 64 c61 61 70 86 33 86 -10 0 -50 -33 -90 -73z M454 429 c-3 -6 22 -40 59 -78 l66 -66 -65 -58 c-65 -60 -76 -80 -48 -91 17 -6 174 127 174 148 0 18 -144 156 -162 156 -9 0 -20 -5 -24 -11z",
  },
  {
    id: "energy",
    cx: 133,
    cy: 526,
    iconTransform:
      "translate(133 526) scale(0.8889) translate(-21.0 35.5) scale(0.1 -0.1)",
    iconPath:
      "M173 511 l-152 -196 85 -3 c46 -1 84 -7 84 -12 0 -5 -23 -73 -50 -152 -28 -78 -46 -138 -41 -133 4 6 75 96 156 200 l147 190 -86 3 c-85 3 -87 3 -80 25 4 12 26 78 49 147 24 69 43 126 42 126 -1 1 -70 -87 -154 -195z",
  },
  {
    id: "share",
    cx: 218,
    cy: 720,
    iconTransform:
      "translate(218 720) scale(0.8889) translate(-33.0 30.0) scale(0.1 -0.1)",
    iconPath:
      "M209 556 c-14 -30 8 -75 51 -106 37 -26 59 -21 100 26 52 60 27 122 -40 97 -17 -6 -32 -7 -36 -2 -12 20 -64 10 -75 -15z M450 510 c0 -63 2 -70 20 -70 14 0 20 -7 20 -22 l0 -21 23 21 c18 17 36 22 75 22 l52 0 0 70 0 70 -95 0 -95 0 0 -70z m160 30 c0 -6 -28 -10 -65 -10 -37 0 -65 4 -65 10 0 6 28 10 65 10 37 0 65 -4 65 -10z m0 -30 c0 -6 -28 -10 -65 -10 -37 0 -65 4 -65 10 0 6 28 10 65 10 37 0 65 -4 65 -10z m3 -35 c-5 -18 -133 -18 -133 0 0 13 11 15 68 13 38 -2 66 -7 65 -13z M338 395 c-6 -28 6 -34 16 -9 8 22 7 34 -3 34 -5 0 -11 -11 -13 -25z M216 384 c-9 -23 113 -234 136 -234 35 0 28 24 -35 133 -63 110 -88 135 -101 101z M404 345 c-10 -8 -14 -15 -7 -15 19 0 43 11 43 21 0 13 -14 11 -36 -6z M500 330 c-42 -42 -32 -109 21 -139 80 -45 163 74 96 137 -30 29 -89 30 -117 2z m73 -39 c35 -18 34 -27 -3 -46 -40 -21 -40 -20 -40 26 0 22 3 39 8 37 4 -2 19 -10 35 -17z M166 306 c-33 -43 -33 -45 5 -111 l31 -54 46 6 c26 3 48 7 50 8 3 3 -98 185 -103 185 -1 0 -14 -15 -29 -34z M337 300 c10 -17 21 -26 26 -21 15 15 -3 51 -24 51 -20 0 -20 -1 -2 -30z M405 260 c3 -5 16 -10 28 -10 18 0 19 2 7 10 -20 13 -43 13 -35 0z M67 215 c-97 -67 -25 -164 78 -104 l35 21 -22 37 c-12 20 -27 44 -32 54 -14 22 -14 22 -59 -8z M168 96 c-24 -18 13 -76 48 -76 l24 0 -20 39 c-24 48 -31 53 -52 37z",
  },
];

/** The three connectors that link node→node (drawn in the intro). */
export const CONNECTORS = [
  "M 156 182 C 255 195 316 230 318 298",
  "M 272 362 C 160 385 130 420 133 478",
  "M 152 570 C 205 610 218 620 217 672",
];

/** The full path the spark travels through all four nodes (intro only). */
export const SPARK_PATH =
  "M 156 182 C 255 195 316 230 318 298 C 318 330 302 352 272 362 C 160 385 130 420 133 478 C 133 505 141 546 152 570 C 205 610 218 620 217 672 C 218 690 218 700 218 706";

/** Signature gradient stops (135°, St. Pauls Blue → Minty Breeze). */
export const SIG_GRADIENT = { from: "#5B7884", to: "#8A9B8D" } as const;

/** Tight bounding box of the four-node glyph, for a padding-free viewBox. */
export const GLYPH_VIEWBOX = { minX: 48, minY: 108, width: 336, height: 676 } as const;

/**
 * Wordmark baseline anchor and font sizing in the 0 0 1920 900 canvas - the
 * text sits immediately to the right of the glyph, exactly as in the Shorts
 * source (only its size is scaled to fit long department names).
 */
export const WORDMARK_ANCHOR = { x: 315, y: 608 } as const;
export const WORDMARK_FONT_SIZE = 178;
export const WORDMARK_LETTER_SPACING = -3;

/**
 * Rough advance width of a wordmark at the base font size (Geist 700, the
 * baked letter-spacing). Deliberately a slight over-estimate so long names are
 * scaled down enough to never clip the canvas.
 */
export function estimateWordmarkWidth(
  text: string,
  fontSize: number = WORDMARK_FONT_SIZE
): number {
  const perChar = fontSize * 0.55 + WORDMARK_LETTER_SPACING;
  return text.length * perChar;
}
