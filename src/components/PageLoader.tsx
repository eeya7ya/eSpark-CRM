import BrandLoader from "@/components/brand/BrandLoader";

/**
 * Hero-screen loader — the eSpark mark drawing itself, with a message below.
 * Used by every `loading.tsx` route skeleton and full-card loading state.
 *
 * No "use client", no runtime style injection: the keyframes live in
 * globals.css, so the mark animates on the very first paint — including inside
 * server-rendered route loaders, before any client JS runs. That removes the
 * "loader shows up / starts late" delay.
 *
 *   <PageLoader />                              — defaults.
 *   <PageLoader label="Building your deal…" />  — custom message.
 *   <PageLoader fullScreen />                   — pads to the viewport.
 */
export default function PageLoader({
  label = "Hang tight, almost there…",
  fullScreen = false,
  className = "",
}: {
  label?: string;
  fullScreen?: boolean;
  className?: string;
}) {
  const wrapperClass = fullScreen
    ? `flex min-h-[60vh] w-full flex-col items-center justify-center gap-7 ${className}`
    : `flex w-full flex-col items-center justify-center gap-6 py-10 ${className}`;

  return (
    <div role="status" aria-live="polite" className={wrapperClass}>
      <BrandLoader size={96} />
      <p className="m-0 text-center text-[1.05rem] font-semibold tracking-wide text-espark-muted">
        {label}
      </p>
    </div>
  );
}
