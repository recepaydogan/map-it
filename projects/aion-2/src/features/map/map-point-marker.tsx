import { memo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { ACTIVE_EVENT_MARKER_PRIORITY, getPointAppearance, getPointTooltipOffsetY, SELECTED_MARKER_PRIORITY } from "./map-config";
import MapPointIcon from "./map-point-icon";
import MapMarkerTooltip from "./map-marker-tooltip";
import MapMarkerFoundBadge from "./map-marker-found-badge";
import { getMapMarkerIconSize } from "./map-marker-icon-size";
import MapNativeHitShape from "./map-native-hit-shape";
import { useMapMarkerArtPath } from "./use-map-marker-art-path";
import { screenPointStyle } from "./map-projection";
import type { MapPoint } from "./types";

interface MapPointMarkerProps {
  point: MapPoint;
  label: string;
  left: number;
  top: number;
  selected: boolean;
  activeEvent?: boolean;
  found?: boolean;
  preview?: boolean;
  hideTooltip?: boolean;
  tooltipOnSelected?: boolean;
  tooltipPosition?: { left: number; top: number };
  markerScale?: number;
  onSelect: (point: MapPoint) => void;
  onToggleCompleted?: (point: MapPoint) => void;
}

/** Only zoom changes the anchor; panning translates the shared parent layer. */
const MapPointMarker = ({ point, label, left, top, selected, activeEvent = false, found = false, preview = false, hideTooltip = false, tooltipOnSelected = false, tooltipPosition, markerScale = 1, onSelect, onToggleCompleted }: MapPointMarkerProps) => {
  const appearance = getPointAppearance(point);
  const markerSize = (appearance.markerSize ?? (selected ? 36 : 32)) * markerScale;
  const [tooltipLayer, setTooltipLayer] = useState<HTMLElement | null>(null);
  const [artHovered, setArtHovered] = useState(false);
  const nativeSource = appearance.nativeIconPath;
  const { path: artPath, loading: artLoading } = useMapMarkerArtPath(nativeSource, !preview);
  const artHitArea = Boolean(nativeSource && !preview && (artPath !== null || artLoading));
  const iconSize = getMapMarkerIconSize(appearance.markerSize ?? 32, appearance.itemArt, selected) * markerScale;
  const artScale = appearance.markerClass.includes("map-marker-large-native-icon") ? 1.55
    : appearance.markerClass.includes("map-service-art") ? 1.4 : 1;
  const showTooltip = (target: Element) => {
    if (!preview) setTooltipLayer(target.closest<HTMLElement>(".map-marker-layer"));
  };
  return (
    <>
      <div className="map-marker-anchor pointer-events-none absolute"
        style={{ ...screenPointStyle(left, top), zIndex: activeEvent ? ACTIVE_EVENT_MARKER_PRIORITY : selected ? SELECTED_MARKER_PRIORITY : appearance.markerPriority }} aria-hidden={preview || undefined}>
        <button
          type="button"
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerEnter={(event) => showTooltip(event.currentTarget)}
          onPointerLeave={(event) => {
            if (event.currentTarget !== document.activeElement) setTooltipLayer(null);
          }}
          onFocus={(event) => showTooltip(event.currentTarget)}
          onBlur={(event) => {
            if (!event.currentTarget.matches(":hover") && !artHovered) setTooltipLayer(null);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(point);
          }}
          onContextMenu={(event) => {
            if (!onToggleCompleted || preview || point.subtype === "coordinate") return;
            event.preventDefault();
            event.stopPropagation();
            onToggleCompleted(point);
          }}
          style={{ width: markerSize, height: markerSize }}
          className={cn(
            "map-marker cursor-pointer",
            preview || artHitArea ? "pointer-events-none" : "pointer-events-auto",
            appearance.markerClass,
            appearance.itemArt && "map-item-art",
            selected && "map-marker-selected",
            artHovered && "map-marker-art-hovered",
          )}
          aria-label={label || point.label}
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
          {found && <MapMarkerFoundBadge scale={Math.min(1, markerScale)} />}
        </button>
        {artPath !== null && !preview && <MapNativeHitShape path={artPath} size={iconSize} scale={artScale}
          onEnter={(target) => { setArtHovered(true); showTooltip(target); }}
          onLeave={() => { setArtHovered(false); setTooltipLayer(null); }}
          onClick={(event) => { event.stopPropagation(); onSelect(point); }}
          onContextMenu={(event) => {
            if (!onToggleCompleted || point.subtype === "coordinate") return;
            event.preventDefault();
            event.stopPropagation();
            onToggleCompleted(point);
          }} />}
      </div>
      {!preview && !hideTooltip && (!selected || tooltipOnSelected) && tooltipLayer && createPortal(
        <MapMarkerTooltip label={label || point.label}
          left={tooltipPosition?.left ?? left} top={tooltipPosition?.top ?? top}
          markerSize={markerSize} offsetY={getPointTooltipOffsetY(point)} />,
        tooltipLayer,
      )}
    </>
  );
};

export default memo(MapPointMarker);
