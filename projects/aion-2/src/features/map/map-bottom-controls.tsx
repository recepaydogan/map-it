import { Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getNormalizedMarkerZoom } from "./map-marker-zoom";
import type { MapProjectionMode } from "./map-projection";

interface MapBottomControlsProps {
  zoom: number;
  projection: MapProjectionMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const MapBottomControls = ({
  zoom,
  projection,
  onZoomIn,
  onZoomOut,
}: MapBottomControlsProps) => {
  const { t } = useTranslation();
  const zoomPercentage = Math.max(1, Math.round(getNormalizedMarkerZoom(zoom, projection) * 100));

  return (
    <div className="map-bottom-controls" data-map-ui>
      <div className="map-bottom-zoom" data-tour="map-zoom" role="group" aria-label={t("map.controls.zoomControls")}>
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
  );
};

export default MapBottomControls;
