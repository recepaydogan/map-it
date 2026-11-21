import { MapPinPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { cn } from "../../lib/cn";
import MapLiveControls from "./map-live-controls";

interface MapToolbarProps {
  placementMode: boolean;
  onTogglePlacement: () => void;
  livePositionAvailable: boolean;
  followingLivePosition: boolean;
  onToggleFollowLivePosition?: () => void;
  onCenterLivePosition: () => void;
}

/**
 * The floating tool stack in the map's top-right corner (place a marker) and,
 * while a live position exists, the centre/follow controls bottom-right.
 */
const MapToolbar = ({
  placementMode,
  onTogglePlacement,
  livePositionAvailable,
  followingLivePosition,
  onToggleFollowLivePosition,
  onCenterLivePosition,
}: MapToolbarProps) => {
  const { t } = useTranslation();
  const addMarkerLabel = t("map.controls.addMarker");

  return (
    <>
      <div className="map-control-stack map-marker-controls" data-map-ui data-tour="map-tools">
        <Tooltip label={addMarkerLabel} side="left" className="map-control-tooltip">
          <button
            type="button"
            onClick={onTogglePlacement}
            className={cn("map-control-button", placementMode && "map-control-active")}
            aria-label={addMarkerLabel}
            aria-pressed={placementMode}
          >
            <MapPinPlus size={17} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {livePositionAvailable && (
        <MapLiveControls
          className="map-desktop-live-controls"
          followingLivePosition={followingLivePosition}
          onCenterLivePosition={onCenterLivePosition}
          onToggleFollowLivePosition={onToggleFollowLivePosition}
        />
      )}
    </>
  );
};

export default MapToolbar;
