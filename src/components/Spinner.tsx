import BrandLoader from "@/components/brand/BrandLoader";

/**
 * Inline brand loader — the eSpark mark in motion, scaled down for buttons,
 * panels and tab bodies. Shares its geometry and animation with the
 * full-screen PageLoader, so waiting looks the same everywhere in the app.
 *
 * No "use client", no runtime style injection: the keyframes live in
 * globals.css so the animation runs on first paint (server-rendered too)
 * instead of waiting for React to hydrate — that delay was the "loader
 * renders late" problem.
 *
 *   <Spinner />                          — bare 16-px indicator.
 *   <Spinner size={20} label="Loading…"/>— with text on the right.
 */
export default function Spinner({
  size = 16,
  className = "",
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 text-espark-ink/70 ${className}`}
    >
      {/* The mark is roughly half as wide as it is tall, so at inline sizes it
          is scaled up a little to hold the same optical weight as the text
          beside it. */}
      <BrandLoader size={Math.round(size * 1.5)} className="shrink-0" />
      {label && (
        <span className="text-xs font-medium text-espark-ink/70">{label}</span>
      )}
    </span>
  );
}
