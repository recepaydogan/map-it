import { ExternalLink, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getPointAppearance } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { requestMapPointInMain } from "./map-window-bridge";
import type { MapPoint } from "./types";

interface OverlayPointCardProps {
  point: MapPoint;
  onClose: () => void;
}

/**
 * What the in-game minimap shows for a tapped marker: the name, where it is,
 * and a way to open the full details in the desktop app. The overlay has no
 * room for the sidebar, and the desktop window is one hotkey away.
 */
const OverlayPointCard = ({ point, onClose }: OverlayPointCardProps) => {
  const { t } = useTranslation();
  const appearance = getPointAppearance(point);
  const subtitle = [point.label, point.region].filter(Boolean).join(" · ");

  return (
    <section className="overlay-point-card" aria-label={point.name} data-map-ui>
      <span className={cn("overlay-point-card-icon", appearance.markerClass)}>
        <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[12px] font-semibold text-white">{point.name}</strong>
        <span className="mt-0.5 block truncate text-[10px] text-white/70">
          {[subtitle, `${point.x}, ${point.y}`].filter(Boolean).join(" · ")}
        </span>
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
