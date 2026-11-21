import { memo, type CSSProperties } from "react";
import { cn } from "../../lib/cn";
import { getMapPointPriority, getPointAppearance, keepsMapMarkerPriorityOnHover } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { isQuestPoint } from "./map-faction-filter";
import { screenPointStyle } from "./map-projection";
import { getMapMarkerIconSize, MAP_MARKER_SIZES } from "./map-marker-zoom";
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
  canvasArtwork?: boolean;
  trackedQuest?: boolean;
  markerScale: number;
  onSelect: (point: MapPoint) => void;
}

/** Only zoom changes the anchor; panning translates the shared parent layer. */
const MapPointMarker = ({ point, label, tooltipLabel = label, left, top, selected, showSelectedTooltip = true, completed = false, preview = false, canvasArtwork = false, trackedQuest = false, markerScale, onSelect }: MapPointMarkerProps) => {
  const appearance = getPointAppearance(point);
  const quest = isQuestPoint(point);
  const variant = selected ? "selected" : "normal";
  const markerSize = MAP_MARKER_SIZES[quest ? "quest" : variant] * markerScale;
  const iconSize = getMapMarkerIconSize(point.category, quest, appearance.itemArt, variant) * markerScale;
  return (
    <div className={cn("map-marker-anchor pointer-events-none absolute",
      selected && "map-marker-anchor-selected",
      keepsMapMarkerPriorityOnHover(point.category) && "map-marker-anchor-fixed-priority",
      preview && "map-marker-preview")}
      style={{ ...screenPointStyle(left, top), zIndex: appearance.areaPin ? 0 : undefined,
        "--marker-priority": trackedQuest ? 90 : getMapPointPriority(point) } as CSSProperties}
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
          canvasArtwork && "map-marker-canvas-artwork",
        )}
        style={{ width: markerSize, height: markerSize, "--marker-size-scale": markerScale } as CSSProperties}
        aria-label={label}
        data-name={tooltipLabel}
        data-map-tracked-quest={trackedQuest || undefined}
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
