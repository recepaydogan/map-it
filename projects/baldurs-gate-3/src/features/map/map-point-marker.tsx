import { memo } from "react";
import { cn } from "../../lib/cn";
import { getPointAppearance } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { screenPointStyle } from "./map-projection";
import type { MapItemSprite } from "./use-map-item-visuals";
import type { MapPoint } from "./types";

interface MapPointMarkerProps {
  point: MapPoint;
  left: number;
  top: number;
  sprite?: MapItemSprite;
  selected?: boolean;
  fanned?: boolean;
  preview?: boolean;
  onSelect: (point: MapPoint) => void;
}

/** Anchors only change with zoom; panning translates their shared parent. */
const MapPointMarker = ({ point, left, top, sprite, selected = false, fanned = false, preview = false, onSelect }: MapPointMarkerProps) => {
  const appearance = getPointAppearance(point);
  return (
    <div className={cn("map-marker-anchor pointer-events-none absolute",
      fanned && "map-marker-anchor-fan", preview && "map-marker-preview")}
      style={screenPointStyle(left, top)} aria-hidden={preview || undefined}>
      <button type="button"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onClick={(event) => { event.stopPropagation(); onSelect(point); }}
        className={cn("map-marker cursor-pointer", preview ? "pointer-events-none" : "pointer-events-auto",
          appearance.markerClass, selected && "map-marker-selected", fanned && "map-marker-fan-foot")}
        aria-label={point.name} data-name={point.name} data-map-marker-control
        tabIndex={preview ? -1 : undefined}>
        <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath} sprite={sprite}
          size={selected ? 21 : 18} strokeWidth={point.category === "secret" ? 1.8 : 2.4} />
      </button>
    </div>
  );
};

export default memo(MapPointMarker);
