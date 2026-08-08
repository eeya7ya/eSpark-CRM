import { NODES, NODE_R, CONNECTORS, SPARK_PATH, GLYPH_VIEWBOX } from "./glyphData";

/**
 * The eSpark mark in motion — the app's loading indicator.
 *
 * The connectors are laid down as a dim track, a bright segment runs along the
 * signature spark path, and each of the four nodes lights in turn behind it.
 * It is the brand mark drawing itself rather than a generic spinner, which is
 * the whole point: waiting is the moment the app is most looked at.
 *
 * Deliberately NOT a client component, and it injects no styles at runtime —
 * the keyframes live in globals.css. That matters because every `loading.tsx`
 * route skeleton is server-rendered: the animation has to run on the very
 * first paint, before any JavaScript loads, or the loader itself appears late.
 *
 * The path is normalised with `pathLength={1}`, so the dash geometry below is
 * expressed as a fraction of the path and does not need its true length.
 */
export default function BrandLoader({
  size = 68,
  className = "",
}: {
  /** Rendered height in px. The mark is taller than it is wide. */
  size?: number;
  className?: string;
}) {
  const { minX, minY, width, height } = GLYPH_VIEWBOX;

  return (
    <svg
      className={className}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      height={size}
      width={(size * width) / height}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      {/* The route the spark runs along, held faintly so the mark reads as a
          whole shape even at the start of the loop. */}
      {CONNECTORS.map((d, i) => (
        <path
          key={`track${i}`}
          d={d}
          fill="none"
          stroke="rgb(var(--espark-border))"
          strokeWidth={16}
          strokeLinecap="round"
        />
      ))}

      {/* The spark itself: a short bright segment chasing the path. */}
      <path
        className="espark-loader-spark"
        d={SPARK_PATH}
        pathLength={1}
        fill="none"
        stroke="rgb(var(--espark-primary))"
        strokeWidth={16}
        strokeLinecap="round"
      />

      {/* Nodes light in sequence, each timed to when the spark reaches it. */}
      {NODES.map((n, i) => (
        <circle
          key={n.id}
          className="espark-loader-node"
          cx={n.cx}
          cy={n.cy}
          r={NODE_R}
          fill="rgb(var(--espark-primary))"
          style={{ animationDelay: `${i * 0.28}s` }}
        />
      ))}
    </svg>
  );
}
