import { memo, type CSSProperties } from "react";
import { cn } from "../../lib/cn";
import { getMapMarkerPriority, getPointAppearance, isResourceMarkerCategory } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { isQuestPoint } from "./map-faction-filter";
import { screenPointStyle } from "./map-projection";
import type { MapPoint } from "./types";

interface MapPointMarkerProps {
  point: MapPoint;
  label: string;
  tooltipLabel?: string;
  left: number;
  top: number;
  selected: boolean;
  showSelectedTooltip?: boolean;
  completed?: boolean;
  preview?: boolean;
  markerScale: number;
  onSelect: (point: MapPoint) => void;
}

/** Only zoom changes the anchor; panning translates the shared parent layer. */
const MapPointMarker = ({ point, label, tooltipLabel = label, left, top, selected, showSelectedTooltip = true, completed = false, preview = false, markerScale, onSelect }: MapPointMarkerProps) => {
  const appearance = getPointAppearance(point);
  const resource = isResourceMarkerCategory(point.category);
  const quest = isQuestPoint(point);
  const markerSize = (quest ? 27 : selected ? 36 : 32) * markerScale;
  const iconSize = (quest ? 27
    : point.category === "point-of-interest" ? (appearance.itemArt ? 16 : 14)
    : appearance.itemArt ? (selected ? 30 : 28) : (selected ? 21 : 18)) * markerScale;
  return (
    <div className={cn("map-marker-anchor pointer-events-none absolute",
      selected && "map-marker-anchor-selected", resource && "map-marker-anchor-resource",
      preview && "map-marker-preview", preview && resource && "map-marker-preview-resource")}
      style={{ ...screenPointStyle(left, top), "--marker-priority": getMapMarkerPriority(point.category) } as CSSProperties}
      aria-hidden={preview || undefined}>
      <button
        type="button"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(point);
        }}
        className={cn(
          "map-marker cursor-pointer",
          preview ? "pointer-events-none" : "pointer-events-auto",
          appearance.markerClass,
          appearance.itemArt && "map-item-art",
          selected && "map-marker-selected",
        )}
        style={{ width: markerSize, height: markerSize, "--marker-size-scale": markerScale } as CSSProperties}
        aria-label={label}
        data-name={tooltipLabel}
        data-map-marker-control
        data-map-selected-marker={selected || undefined}
        tabIndex={preview ? -1 : undefined}
      >
        <MapPointIcon
          fallback={appearance.icon}
          source={appearance.nativeIconPath}
          size={iconSize}
          strokeWidth={2.4}
        />
        {completed && <span className="map-marker-found-badge" aria-hidden="true" />}
        {selected && showSelectedTooltip && !preview && <span className="map-marker-selected-tooltip" data-map-selected-tooltip aria-hidden="true">
          {tooltipLabel}
        </span>}
      </button>
    </div>
  );
};

export default memo(MapPointMarker);
