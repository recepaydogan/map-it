import { memo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getCategoryConfig } from "./map-config";
import type { MapQuestGroup } from "./map-marker-overlap";
import MapPointIcon from "./map-point-icon";
import { screenPointStyle } from "./map-projection";

const questIcon = getCategoryConfig("quest");

interface MapQuestGroupMarkerProps {
  group: MapQuestGroup;
  left: number;
  top: number;
  priority: number;
  scale: number;
  label: string;
  tooltipSide: "left" | "right";
  onSelect: (group: MapQuestGroup) => void;
}

const MapQuestGroupMarker = ({ group, left, top, priority, scale, label, tooltipSide, onSelect }: MapQuestGroupMarkerProps) => {
  const [tooltipLayer, setTooltipLayer] = useState<HTMLElement | null>(null);
  const markerSize = 27 * scale;
  const showTooltip = (target: Element) => setTooltipLayer(target.closest<HTMLElement>(".map-marker-layer"));

  return <>
    <div className="map-marker-anchor map-marker-anchor-quest-group pointer-events-none absolute"
      style={{ ...screenPointStyle(left, top), "--marker-priority": priority } as CSSProperties}>
      <button type="button" data-map-marker-control data-quest-group-count={group.members.length}
        className="map-quest-group-marker pointer-events-auto relative grid cursor-pointer place-items-center rounded-full border border-accent bg-black/60 text-accent shadow-[0_2px_8px_rgba(0,0,0,0.65)] hover:border-white focus-visible:outline-2 focus-visible:outline-accent"
        style={{ width: markerSize, height: markerSize }}
        aria-label={label}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerEnter={(event) => showTooltip(event.currentTarget)}
        onPointerLeave={(event) => {
          if (event.currentTarget !== document.activeElement) setTooltipLayer(null);
        }}
        onFocus={(event) => showTooltip(event.currentTarget)}
        onBlur={(event) => {
          if (!event.currentTarget.matches(":hover")) setTooltipLayer(null);
        }}
        onClick={(event) => { event.stopPropagation(); setTooltipLayer(null); onSelect(group); }}>
        <MapPointIcon fallback={questIcon.icon} source={questIcon.nativeIconPath} size={20 * scale} />
        <span className="map-quest-group-count absolute grid min-w-3 place-items-center rounded-full border border-accent/70 bg-black/70 px-0.5 text-[8px] font-bold leading-3 text-accent"
          style={{ right: -4 * Math.min(1, scale), bottom: -4 * Math.min(1, scale),
            transform: `scale(${Math.min(1, scale)})`, transformOrigin: "bottom right" }} aria-hidden="true">
          {group.members.length}
        </span>
      </button>
    </div>
    {tooltipLayer && createPortal(<span className="map-quest-group-tooltip" data-tooltip-side={tooltipSide} aria-hidden="true"
      style={{ left: tooltipSide === "right" ? left + markerSize / 2 + 8 : left - markerSize / 2 - 8,
        top, transform: tooltipSide === "right" ? "translateY(-50%)" : "translate(-100%, -50%)" }}>
      {label}
    </span>, tooltipLayer)}
  </>;
};

export default memo(MapQuestGroupMarker);
