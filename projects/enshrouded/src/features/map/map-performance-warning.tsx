import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getNormalizedMarkerZoom } from "./map-marker-zoom";
import type { MapProjectionMode } from "./map-projection";

const MARKER_WARNING_THRESHOLD = 2_000;
const ZOOM_WARNING_THRESHOLD = 0.02;

interface MapPerformanceWarningProps {
  markerCount: number;
  zoom: number;
  projection: MapProjectionMode;
}

const MapPerformanceWarning = ({
  markerCount,
  zoom,
  projection,
}: MapPerformanceWarningProps) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const visible = markerCount > MARKER_WARNING_THRESHOLD
    && getNormalizedMarkerZoom(zoom, projection) < ZOOM_WARNING_THRESHOLD;

  if (!visible || dismissed) return null;

  return (
    <div
      role="status"
      className={cn(
        "absolute right-[14px] bottom-[58px] z-20 flex w-fit max-w-[calc(100%_-_28px)] items-center gap-2.5",
        "rounded-[var(--radius-md)] border border-warning/40 bg-surface/95 px-3 py-2.5 text-xs text-white shadow-lg backdrop-blur-md",
      )}
      data-map-ui
    >
      <TriangleAlert size={16} className="shrink-0 text-warning" aria-hidden="true" />
      <p className="m-0 leading-5">{t("map.performanceWarning.body")}</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className={cn(
          "shrink-0 cursor-pointer rounded-[var(--radius-sm)] bg-white/10 px-2.5 py-1.5",
          "font-semibold text-white transition-colors hover:bg-white/15",
        )}
      >
        {t("map.performanceWarning.dismiss")}
      </button>
    </div>
  );
};

export default MapPerformanceWarning;
