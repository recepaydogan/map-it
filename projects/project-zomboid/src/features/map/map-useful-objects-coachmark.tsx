import { Eye, PackageSearch, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

const AD_RAIL_WIDTH = 440;
const COACHMARK_WIDTH = 280;
const EDGE_GAP = 16;
const ANCHOR_GAP = 12;

interface CoachmarkPosition {
  left: number;
  top: number;
  side: "right" | "over";
}

interface MapUsefulObjectsCoachmarkProps {
  anchor: HTMLDivElement | null;
  onShowRecommended: () => void;
  onDismiss: () => void;
}

/** Non-modal coachmark anchored to the Useful objects group and kept left of the ad rail. */
const MapUsefulObjectsCoachmark = ({
  anchor,
  onShowRecommended,
  onDismiss,
}: MapUsefulObjectsCoachmarkProps) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CoachmarkPosition | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return undefined;

    const updatePosition = () => {
      const anchorBox = anchor.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight ?? 190;
      const adRailLeft = window.innerWidth - AD_RAIL_WIDTH;
      const rightSideLeft = anchorBox.right + ANCHOR_GAP;
      const maximumLeft = adRailLeft - COACHMARK_WIDTH - EDGE_GAP;
      const fitsOnRight = rightSideLeft <= maximumLeft;
      const left = fitsOnRight
        ? rightSideLeft
        : Math.max(EDGE_GAP, Math.min(anchorBox.left, maximumLeft));
      const top = Math.max(
        EDGE_GAP,
        Math.min(anchorBox.top - 8, window.innerHeight - panelHeight - EDGE_GAP),
      );
      setPosition({ left, top, side: fitsOnRight ? "right" : "over" });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const observer = new ResizeObserver(updatePosition);
    observer.observe(anchor);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      observer.disconnect();
    };
  }, [anchor]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  if (!anchor || !position) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="region"
      aria-labelledby="useful-objects-coachmark-title"
      aria-describedby="useful-objects-coachmark-body"
      aria-live="polite"
      className="map-useful-objects-coachmark"
      data-side={position.side}
      style={{ left: position.left, top: position.top, width: COACHMARK_WIDTH }}
    >
      <div className="flex items-start gap-3">
        <span className="map-useful-objects-coachmark-icon" aria-hidden="true">
          <PackageSearch size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="useful-objects-coachmark-title" className="text-[13px] font-bold text-white">
            {t("map.usefulObjectsOnboarding.title")}
          </h2>
          <p id="useful-objects-coachmark-body" className="mt-1 text-[11px] leading-relaxed text-zinc-300">
            {t("map.usefulObjectsOnboarding.body")}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("map.usefulObjectsOnboarding.dismiss")}
          className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="h-8 cursor-pointer rounded-[var(--radius-md)] px-3 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/7 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("map.usefulObjectsOnboarding.gotIt")}
        </button>
        <button
          type="button"
          onClick={onShowRecommended}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3 text-[11px] font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Eye size={13} aria-hidden="true" />
          {t("map.usefulObjectsOnboarding.showRecommended")}
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default MapUsefulObjectsCoachmark;
