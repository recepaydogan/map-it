import { MapPinPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapToolbarProps {
  placementMode: boolean;
  onTogglePlacement: () => void;
}

/**
 * The marker action sits above the zoom controls.
 */
const MapToolbar = ({
  placementMode,
  onTogglePlacement,
}: MapToolbarProps) => {
  const { t } = useTranslation();
  const addMarkerLabel = t("map.controls.addMarker");

  return (
    <div className="map-control-stack map-marker-controls" data-map-ui data-tour="map-tools">
      <button
        type="button"
        onClick={onTogglePlacement}
        className={cn("map-control-button", placementMode && "map-control-active")}
        aria-label={addMarkerLabel}
        aria-pressed={placementMode}
      >
        <MapPinPlus size={17} aria-hidden="true" />
      </button>
    </div>
  );
};

export default MapToolbar;
