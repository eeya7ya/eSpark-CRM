"use client";

import { NODES, NODE_R, CONNECTORS, GLYPH_VIEWBOX } from "./glyphData";

/**
 * BrandGlyph — the four-node eSpark mark as an inline, theme-aware SVG.
 *
 * Ported from the eSpark brand site so the CRM and the public site draw the
 * identical mark from the identical geometry (`glyphData.ts` is a byte-for-byte
 * copy). Only the colour source differs: the site reads `--foreground` /
 * `--background`, the CRM reads its own `--espark-ink` / `--espark-surface`
 * tokens, which carry the same meaning.
 *
 * Rendered as a high-contrast monochrome mark: node bodies take the theme ink
 * (dark on light, bright on dark) with the icons knocked out in the surface
 * colour. Being vector, it stays sharp from a 28px navbar chip to a full hero,
 * and it needs no second asset for dark mode.
 */
export default function BrandGlyph({
  className,
  title = "eSpark",
  tone = "theme",
  knockoutColor,
}: {
  className?: string;
  title?: string;
  /**
   * Colour of the icons knocked out of each node disc. Defaults suit a mark
   * drawn on the surface it was designed for; override it when the mark is
   * tinted for a background the defaults do not anticipate — a dark mark on a
   * light ground needs a LIGHT knockout, and `tone="current"`'s black one
   * would simply disappear into the disc.
   */
  knockoutColor?: string;
  /**
   * `theme` (default) paints the mark with the app's ink/surface tokens, so it
   * follows the light/dark toggle. `current` paints it with `currentColor` and
   * knocks the icons out as transparent — for surfaces that set their own
   * colour and sit outside the themed chrome, such as the sign-in panel, which
   * is always the dark "night" treatment.
   */
  tone?: "theme" | "current";
}) {
  const { minX, minY, width, height } = GLYPH_VIEWBOX;
  const markColor = tone === "current" ? "currentColor" : "rgb(var(--espark-ink))";
  const knockout =
    knockoutColor ??
    (tone === "current" ? "rgb(0 0 0 / 0.55)" : "rgb(var(--espark-surface))");

  return (
    <svg
      className={className}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title}
      style={{ overflow: "visible" }}
    >
      {/* Connectors — thick and bright enough to stay visible at navbar size. */}
      {CONNECTORS.map((d, i) => (
        <path
          key={`c${i}`}
          d={d}
          fill="none"
          stroke={markColor}
          strokeOpacity={0.9}
          strokeWidth={16}
          strokeLinecap="round"
        />
      ))}

      {/* Nodes: solid ink disc with a knocked-out icon. */}
      {NODES.map((n) => (
        <g key={n.id}>
          <circle cx={n.cx} cy={n.cy} r={NODE_R} fill={markColor} />
          <g transform={n.iconTransform} fill={knockout}>
            <path d={n.iconPath} />
          </g>
        </g>
      ))}
    </svg>
  );
}
