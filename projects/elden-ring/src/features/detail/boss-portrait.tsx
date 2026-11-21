import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";

/**
 * Boss portrait with a seamless swap between markers. Navigating from one boss to
 * another streams a fresh webp from the CDN; naively swapping <img src> blanks the
 * frame until the new bitmap decodes — a visible gap that flashes the panel. Instead
 * we keep the last decoded portrait on screen, preload the incoming one off-DOM, and
 * only swap once it's ready to paint. While it streams, the held portrait dims under
 * a moving shimmer (and a bare skeleton shimmers when there's no held image yet) — a
 * clear "loading" cue that never removes the previous image or flashes empty.
 *
 * A cached hit decodes within a frame, so a short delay keeps the loading cue from
 * flickering on instant swaps.
 */

/** Delay before the loading cue appears — long enough that a cached, sub-frame decode
 *  never flickers the shimmer, short enough that a real CDN fetch shows it promptly. */
const CUE_DELAY_MS = 90;

/** The last portrait that fully decoded, remembered ACROSS mounts. Should the panel
 *  subtree remount mid-navigation (a view switch that briefly drops the selection),
 *  a fresh BossPortrait still opens holding the previous portrait — so the dim+shimmer
 *  swap survives instead of resetting to a blank first-load. One panel is ever open,
 *  so a single shared slot is enough. */
let lastPortraitSrc: string | null = null;

const BossPortrait = ({ src, alt }: { src: string | null; alt: string }) => {
  // The portrait currently painted — the last src that fully decoded. Held on
  // screen while a new one loads so there's never a blank frame between markers.
  // Seeded from the cross-mount cache so a remount keeps the previous portrait.
  const [shownSrc, setShownSrc] = useState<string | null>(() => lastPortraitSrc);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // No portrait, or the target is already painted → nothing to preload. A cleared
    // src (boss → non-boss) is handled in render, so shownSrc is left untouched.
    if (!src || src === shownSrc) return;

    let cancelled = false;
    // Defer the loading cue: a cached image decodes near-instantly, so revealing the
    // dim+shimmer immediately would just flicker. Only show it if the load lingers.
    const cueTimer = setTimeout(() => {
      if (!cancelled) setLoading(true);
    }, CUE_DELAY_MS);

    const img = new Image();
    img.src = src;
    const commit = () => {
      if (cancelled) return;
      clearTimeout(cueTimer);
      lastPortraitSrc = src; // remember across mounts for the next open
      setShownSrc(src); // already decoded → swapping is a gap-free repaint
      setLoading(false);
    };
    // decode() resolves only once the bitmap is ready to paint (no half-drawn
    // flash); fall back to onload where it's missing or rejects (Safari quirks).
    if (img.decode) {
      img.decode().then(commit).catch(() => {
        if (cancelled) return;
        if (img.complete) commit(); // already loaded before the catch → don't wait forever
        else img.onload = commit;
      });
    } else {
      img.onload = commit;
    }
    // A failed fetch commits nothing: we keep holding the previous portrait (or
    // stay empty if there was none) rather than swap in a broken image.
    img.onerror = () => {
      if (cancelled) return;
      clearTimeout(cueTimer);
      setLoading(false);
    };

    return () => {
      cancelled = true;
      clearTimeout(cueTimer);
    };
  }, [src, shownSrc]);

  // Non-boss marker → hide (don't hold a stale portrait across the gap). Nothing
  // decoded yet and the cue hasn't fired → render nothing rather than an empty box.
  if (!src || (!shownSrc && !loading)) return null;

  return (
    <div className="px-4 pb-4">
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-[var(--radius-md)] border border-white/10 bg-white/[0.03]",
          // No held image yet → show a shimmering skeleton block so the loading
          // state reads clearly instead of a near-empty frame.
          loading && !shownSrc && "boss-portrait-skeleton",
        )}
      >
        {shownSrc && (
          <img
            src={shownSrc}
            alt={alt}
            decoding="async"
            className={cn(
              "h-full w-full object-cover boss-portrait-img",
              loading && "is-loading",
            )}
          />
        )}
        {loading && (
          <div className="pointer-events-none absolute inset-0 boss-portrait-shimmer" />
        )}
      </div>
    </div>
  );
};

export default BossPortrait;
