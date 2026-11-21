import { MapPinPlus, Minus, Plus, Route } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { cn } from "../../lib/cn";
import { getNormalizedMarkerZoom } from "./map-marker-zoom";
import type { MapProjectionMode } from "./map-projection";

interface MapBottomControlsProps {
  zoom: number;
  projection: MapProjectionMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  placementMode: boolean;
  onTogglePlacement?: () => void;
  dungeonRouteVisible?: boolean;
  onToggleDungeonRoute?: () => void;
}

const MapBottomControls = ({
  zoom,
  projection,
  onZoomIn,
  onZoomOut,
  placementMode,
  onTogglePlacement,
  dungeonRouteVisible,
  onToggleDungeonRoute,
}: MapBottomControlsProps) => {
  const { t } = useTranslation();
  const addMarkerLabel = t("map.controls.addMarker");
  const routeLabel = t("dungeonJournal.mapRoute");
  const zoomPercentage = Math.max(1, Math.round(getNormalizedMarkerZoom(zoom, projection) * 100));

  return (
    <div className="map-bottom-controls" data-map-ui data-tour="map-controls">
      {onToggleDungeonRoute && <Tooltip label={routeLabel} side="left" contentClassName="marker-tooltip-content">
        <button type="button" onClick={onToggleDungeonRoute} aria-label={routeLabel}
          aria-pressed={dungeonRouteVisible}
          className="map-bottom-pin">
          <Route size={17} className={dungeonRouteVisible ? "text-accent" : undefined} aria-hidden="true" />
        </button>
      </Tooltip>}
      {onTogglePlacement && <Tooltip label={addMarkerLabel} side="left" contentClassName="marker-tooltip-content">
        <button type="button" onClick={onTogglePlacement} data-tour="map-tools"
          aria-label={addMarkerLabel}
          aria-pressed={placementMode}
          className={cn("map-bottom-pin", placementMode && "map-control-active")}>
          <MapPinPlus size={17} aria-hidden="true" />
        </button>
      </Tooltip>}
      <div className="flex items-center gap-2">
        <div className="map-bottom-zoom" role="group" aria-label={t("map.controls.zoomControls")}>
          <button type="button" onClick={onZoomOut} aria-label={t("map.controls.zoomOut")} title={t("map.controls.zoomOut")}>
            <Minus size={15} aria-hidden="true" />
          </button>
          <output aria-label={t("map.controls.zoomLevel", { value: zoomPercentage })}>
            {zoomPercentage}%
          </output>
          <button type="button" onClick={onZoomIn} aria-label={t("map.controls.zoomIn")} title={t("map.controls.zoomIn")}>
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MapBottomControls;
