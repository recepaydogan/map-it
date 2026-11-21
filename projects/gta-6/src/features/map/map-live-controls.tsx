import { LocateFixed, Navigation } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { cn } from "../../lib/cn";

interface MapLiveControlsProps {
  compact?: boolean;
  followingLivePosition: boolean;
  onCenterLivePosition: () => void;
  onToggleFollowLivePosition?: () => void;
  className?: string;
}

const MapLiveControls = ({
  compact = false,
  followingLivePosition,
  onCenterLivePosition,
  onToggleFollowLivePosition,
  className,
}: MapLiveControlsProps) => {
  const { t } = useTranslation();
  const centerLabel = t("map.controls.centerLivePosition");
  const followLabel = t(followingLivePosition
    ? "chrome.stopFollowingLivePosition"
    : "chrome.followLivePosition");
  const iconSize = compact ? 15 : 17;

  return (
    <div className={cn("map-control-stack map-live-control", className)} data-map-ui>
      <Tooltip label={centerLabel} side="left" className="map-control-tooltip">
        <button
          type="button"
          onClick={onCenterLivePosition}
          className="map-control-button"
          aria-label={centerLabel}
        >
          <LocateFixed size={iconSize} aria-hidden="true" />
        </button>
      </Tooltip>
      {onToggleFollowLivePosition && (
        <Tooltip label={followLabel} side="left" className="map-control-tooltip">
          <button
            type="button"
            onClick={onToggleFollowLivePosition}
            className={cn("map-control-button", followingLivePosition && "map-control-active")}
            aria-label={followLabel}
            aria-pressed={followingLivePosition}
          >
            <Navigation
              size={iconSize}
              fill={followingLivePosition ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        </Tooltip>
      )}
    </div>
  );
};

export default MapLiveControls;
