import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMap, useMapEvents } from "react-leaflet";
import * as L from "leaflet";
import { Locate, Map as MapIcon, Minus, Plus } from "lucide-react";
import { useMapStore } from "../../store/map-store";
import { useMapExperience } from "../map-experience/map-experience";
import { cn } from "../../lib/cn";
import { frameMapBounds } from "./frame-map-bounds";

interface MapControlsProps {
  /** Map bounds to recenter onto. */
  bounds: L.LatLngBoundsExpression;
}

/**
 * Floating zoom / recenter cluster, bottom-right and away from the ad rail edge.
 * Map selection now lives in the top-left world switcher, so this corner is just
 * camera controls — one job per corner. Rendered inside the map so it can drive
 * the Leaflet instance; pointer events are isolated from map drag/zoom.
 */
const MapControls = ({ bounds }: MapControlsProps) => {
  const { game } = useMapExperience();
  const showFragments = useMapStore((s) => s.showFragments);
  const setShowFragments = useMapStore((s) => s.setShowFragments);

  return (
    <MapCameraControls
      bounds={bounds}
      showFragments={game === "elden-ring" ? showFragments : undefined}
      onToggleFragments={game === "elden-ring" ? () => setShowFragments(!showFragments) : undefined}
    />
  );
};

interface MapCameraControlsProps extends MapControlsProps {
  showFragments?: boolean;
  onToggleFragments?: () => void;
}

export const MapCameraControls = ({
  bounds,
  showFragments,
  onToggleFragments,
}: MapCameraControlsProps) => {
  const { t } = useTranslation();
  const map = useMap();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);

  return (
    <div
      ref={ref}
      // Clears the home-indicator / gesture bar on a phone; `sm:` restores the
      // flat 20px inset the desktop and Overwolf layouts have always used.
      // Both insets add --anchor-ad-height (index.css): on the web the bottom anchor
      // ad is a fixed strip Nitro draws over the map, and these are the controls
      // it would otherwise cover. 0 in Overwolf and whenever no anchor is showing.
      className="absolute bottom-[calc(max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))+var(--anchor-ad-height))] right-[max(0.75rem,env(safe-area-inset-right))] z-[1000] flex flex-col items-end gap-2 sm:bottom-[calc(1.25rem+var(--anchor-ad-height))] sm:right-5"
    >
      <ZoomReadout />
      <div className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/90 shadow-lg shadow-black/30 backdrop-blur-md">
        <ControlButton label={t("chrome.zoomIn")} onClick={() => map.zoomIn()}>
          <Plus size={16} aria-hidden="true" />
        </ControlButton>
        <div className="h-px bg-border" />
        <ControlButton label={t("chrome.zoomOut")} onClick={() => map.zoomOut()}>
          <Minus size={16} aria-hidden="true" />
        </ControlButton>
        <div className="h-px bg-border" />
        <ControlButton
          label={t("chrome.recenter")}
          // Shared framing rule (contain on desktop, cover on a phone) — and it
          // re-measures first, because the map never remounts and a container
          // that resized since the last camera update would otherwise be fitted
          // against a stale size and land jammed in a corner.
          onClick={() => frameMapBounds(map, bounds, { animate: true })}
        >
          <Locate size={15} aria-hidden="true" />
        </ControlButton>
        {/* Map-fragment reveal rects — Elden Ring only (Nightreign has no map items). */}
        {onToggleFragments && (
          <>
            <div className="h-px bg-border" />
            <ControlButton
              label={t("chrome.toggleFragments")}
              active={showFragments}
              onClick={onToggleFragments}
            >
              <MapIcon size={15} aria-hidden="true" />
            </ControlButton>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Live zoom percentage. Leaflet zoom is logarithmic (scale = 2^zoom), so zoom 0
 * reads as 100%. Updates on every zoom event.
 */
const ZoomReadout = () => {
  const map = useMap();
  const [percent, setPercent] = useState(() => Math.round(2 ** map.getZoom() * 100));
  // Leaflet fires many intermediate `zoom` events per frame while animating a
  // zoom. Coalesce them to one update per frame and skip the setState when the
  // rounded percent is unchanged, so this readout doesn't re-render every frame.
  const rafRef = useRef(0);

  useMapEvents({
    zoom() {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setPercent((prev) => {
          const next = Math.round(2 ** map.getZoom() * 100);
          return next === prev ? prev : next;
        });
      });
    },
  });

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface/90 px-2.5 py-1 font-mono text-[12px] tabular-nums text-zinc-300 shadow-lg shadow-black/30 backdrop-blur-md">
      {percent}%
    </div>
  );
};

interface ControlButtonProps {
  label: string;
  onClick: () => void;
  /** Toggle buttons light up in the game accent while their layer is on. */
  active?: boolean;
  children: React.ReactNode;
}

const ControlButton = ({ label, onClick, active, children }: ControlButtonProps) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={label}
    aria-pressed={active === undefined ? undefined : active}
    className={cn(
      // 32px on touch, same as every other map control (see MapActionButton);
      // 36px from `sm` up. The size compounds here — this stack is three or four
      // buttons tall, so anything bigger runs a tall column down the corner of a
      // 390px screen and reads as the heaviest thing on the map.
      "grid h-8 w-8 place-items-center transition-colors hover:bg-surface-hover hover:text-white cursor-pointer sm:h-9 sm:w-9",
      active ? "bg-accent-soft text-accent" : "text-zinc-300",
    )}
  >
    {children}
  </button>
);

export default MapControls;
