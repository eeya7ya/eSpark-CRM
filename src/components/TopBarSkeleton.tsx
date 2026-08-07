import BrandLogo from "@/components/brand/BrandLogo";

/**
 * Static, no-DB, no-auth version of <TopBar /> used by every loading.tsx
 * boundary. Keeping the header in place during navigation stops the whole
 * page from visibly jumping while the real server component finishes
 * rendering — the user gets an instant response instead of staring at the
 * previous page for a couple of seconds.
 *
 * The lockup must match TopBar's exactly (same glyph and wordmark sizes) or the
 * brand would visibly resize the moment the real header swaps in.
 */
export default function TopBarSkeleton() {
  return (
    <header className="sticky top-0 z-40 border-b border-espark-border/60 bg-espark-surface/70 backdrop-blur-xl shadow-es-soft">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="h-9 w-[68px] rounded-xl border border-espark-border/70 bg-espark-surface/70" />
          <BrandLogo
            glyphClassName="h-7 sm:h-8"
            wordmarkClassName="text-lg sm:text-xl"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 rounded-full border border-espark-border/60 bg-espark-surface/60" />
          <span className="h-6 w-28 rounded-full bg-espark-soft/60 animate-pulse" />
          <span className="h-7 w-20 rounded-xl bg-espark-ink/80" />
        </div>
      </div>
    </header>
  );
}
