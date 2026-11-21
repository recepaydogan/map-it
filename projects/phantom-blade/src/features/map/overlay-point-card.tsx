import { getMapPointDisplayName } from "./map-point-display-name";
import { ExternalLink, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getPointAppearance } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { requestMapPointInMain } from "./map-window-bridge";
import type { MapPoint } from "./types";

interface OverlayPointCardProps {
  point: MapPoint;
  regionName: string;
  onClose: () => void;
}

/**
 * What the in-game minimap shows for a tapped marker: the name, where it is,
 * and a way to open the full details in the desktop app. The overlay has no
 * room for the sidebar, and the desktop window is one hotkey away.
 */
const OverlayPointCard = ({ point, regionName, onClose }: OverlayPointCardProps) => {
  const { t } = useTranslation();
  const appearance = getPointAppearance(point);
  const subtitle = [point.label, regionName].filter(Boolean).join(" · ");

  return (
    <section className="overlay-point-card" aria-label={getMapPointDisplayName(point)} data-map-ui>
      <span className={cn("overlay-point-card-icon", appearance.markerClass, appearance.itemArt && "map-item-art")}>
        <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath} size={appearance.itemArt ? 20 : 15} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[12px] font-semibold text-white">{getMapPointDisplayName(point)}</strong>
        {subtitle && <span className="mt-0.5 block truncate text-[10px] text-white/70">{subtitle}</span>}
      </span>
      <button
        type="button"
        onClick={() => requestMapPointInMain(point.id)}
        className="overlay-point-card-action"
        aria-label={t("map.details.openInApp")}
        title={t("map.details.openInApp")}
      >
        <ExternalLink size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="overlay-point-card-action"
        aria-label={t("chrome.close")}
        title={t("chrome.close")}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </section>
  );
};

export default OverlayPointCard;
