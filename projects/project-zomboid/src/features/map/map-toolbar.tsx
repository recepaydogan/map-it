import { MapPinPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { PERSONAL_MARKERS_UI_ENABLED } from "./map-config";
import MapLiveControls from "./map-live-controls";
import useMarkerIntro from "./use-marker-intro";

interface MapToolbarProps {
  placementMode: boolean;
  onTogglePlacement: () => void;
  livePositionAvailable: boolean;
  followingLivePosition: boolean;
  onToggleFollowLivePosition?: () => void;
  onCenterLivePosition: () => void;
}

const MapToolbar = ({
  placementMode,
  onTogglePlacement,
  livePositionAvailable,
  followingLivePosition,
  onToggleFollowLivePosition,
  onCenterLivePosition,
}: MapToolbarProps) => {
  const { t } = useTranslation();
  const markerIntro = useMarkerIntro();

  return (
    <>
      {PERSONAL_MARKERS_UI_ENABLED && (
        <div className="map-control-stack map-marker-controls" data-map-ui data-tour="map-tools">
          <button
            type="button"
            onClick={() => {
              markerIntro.dismiss();
              onTogglePlacement();
            }}
            className={cn("map-control-button", placementMode && "map-control-active",
              markerIntro.highlighted && "map-marker-intro")}
            aria-label={t("map.controls.addMarker")}
            title={t("map.controls.addMarker")}
            aria-pressed={placementMode}
          >
            <MapPinPlus size={17} aria-hidden="true" />
          </button>
        </div>
      )}

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
