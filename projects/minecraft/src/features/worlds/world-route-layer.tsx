import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Navigation } from "lucide-react";
import type { BiomeCanvasState } from "../generation/biome-canvas.ts";
import { projectWorldDirectionArrows, projectWorldPoint, projectWorldPolyline } from "./world-polyline-projection.ts";
import type { CalculatedWorldRoute, WorldRoutePoint } from "./world-route-types.ts";
import { useWorldMapFrameView } from "./world-map-frame-context";

interface WorldRouteLayerProps {
  route: CalculatedWorldRoute | null;
  startPoint?: WorldRoutePoint | null;
  destinationPoint?: WorldRoutePoint | null;
  showStartMarker?: boolean;
  view: BiomeCanvasState | null;
}

const WorldRouteLayer = ({ route, startPoint, destinationPoint, showStartMarker = true, view: settledView }: WorldRouteLayerProps) => {
  const { t } = useTranslation();
  const view = useWorldMapFrameView(settledView);
  const paths = useMemo(() => projectWorldPolyline(route?.points ?? [], view, 16), [route, view]);
  const directionArrows = useMemo(() => projectWorldDirectionArrows(route?.points ?? [], view), [route, view]);
  const effectiveStart = route?.points[0] ?? startPoint ?? null;
  const effectiveDestination = route?.points.at(-1) ?? destinationPoint ?? null;
  const projectedStart = effectiveStart ? projectWorldPoint(effectiveStart, view) : null;
  const projectedDestination = effectiveDestination ? projectWorldPoint(effectiveDestination, view) : null;
  if (!paths.length && !(showStartMarker && projectedStart) && !projectedDestination) return null;

  return <>
    {paths.length > 0 && (
      <svg className="pointer-events-none absolute inset-0 z-[7] h-full w-full overflow-hidden"
        aria-label={t("worldRoute.mapLayer")} role="img" viewBox={`0 0 ${view?.width ?? 1} ${view?.height ?? 1}`} preserveAspectRatio="none">
        {paths.map((path, index) => <g key={index}>
          <polyline points={path.map(point => point.join(",")).join(" ")} fill="none" stroke="rgba(9,11,10,.82)"
            strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={path.map(point => point.join(",")).join(" ")} fill="none" stroke="var(--color-accent)"
            strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={path.map(point => point.join(",")).join(" ")} fill="none" stroke="rgba(255,255,255,.78)"
            strokeWidth="1" strokeDasharray="2 9" strokeLinecap="round" strokeLinejoin="round" />
        </g>)}
        {directionArrows.map((arrow, index) => (
          <path
            key={`${Math.round(arrow.x)}:${Math.round(arrow.y)}:${index}`}
            transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}
            d="M 7 0 L -5 -5 L -2 0 L -5 5 Z"
            fill="rgba(255,255,255,.94)"
            stroke="rgba(9,11,10,.9)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    )}
    <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden" aria-label={t("worldRoute.mapLayer")}>
      {showStartMarker && projectedStart && (
        <button
          type="button"
          data-world-map-pan-target
          data-name={t("worldRoute.start")}
          aria-label={`${t("worldRoute.start")} · X ${Math.round(effectiveStart!.x)}, Z ${Math.round(effectiveStart!.z)}`}
          className="map-marker map-marker-custom-amber pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer shadow-lg"
          style={{ left: projectedStart.x, top: projectedStart.y }}
        >
          <Navigation size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
      {projectedDestination && (
        <button
          type="button"
          data-world-map-pan-target
          data-name={t("worldRoute.destination")}
          aria-label={`${t("worldRoute.destination")} · X ${Math.round(effectiveDestination!.x)}, Z ${Math.round(effectiveDestination!.z)}`}
          className="map-marker map-marker-custom-red pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer shadow-lg"
          style={{ left: projectedDestination.x, top: projectedDestination.y }}
        >
          <MapPin size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
    </div>
  </>;
};

export default WorldRouteLayer;
