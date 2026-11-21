import { Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getNormalizedMarkerZoom } from "./map-marker-zoom";
import type { MapProjectionMode } from "./map-projection";

interface OverlayMinimapZoomControlsProps {
  zoom: number;
  minimum: number;
  maximum: number;
  projection: MapProjectionMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const OverlayMinimapZoomControls = ({
  zoom,
  minimum,
  maximum,
  projection,
  onZoomIn,
  onZoomOut,
}: OverlayMinimapZoomControlsProps) => {
  const { t } = useTranslation();
  const zoomPercentage = Math.max(
    1,
    Math.round(getNormalizedMarkerZoom(zoom, projection) * 100),
  );
  const zoomLevelLabel = t("map.controls.zoomLevel", { value: zoomPercentage });

  return (
    <div className="overlay-minimap-zoom-controls" data-map-ui>
      <div className="overlay-minimap-zoom-buttons">
        <button
          type="button"
          onClick={onZoomIn}
          className="map-control-button"
          aria-label={t("map.controls.zoomIn")}
          title={t("map.controls.zoomIn")}
          disabled={zoom >= maximum}
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          className="map-control-button"
          aria-label={t("map.controls.zoomOut")}
          title={t("map.controls.zoomOut")}
          disabled={zoom <= minimum}
        >
          <Minus size={15} aria-hidden="true" />
        </button>
      </div>
      <output
        className="overlay-minimap-zoom-readout"
        aria-label={zoomLevelLabel}
        title={zoomLevelLabel}
        aria-live="polite"
      >
        {zoomPercentage}%
      </output>
    </div>
  );
};

export default OverlayMinimapZoomControls;
