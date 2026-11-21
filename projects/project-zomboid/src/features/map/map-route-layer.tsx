import { memo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { screenPointStyle, worldToScreen, type MapProjectionMode } from "./map-projection";
import MapRouteDraftCard from "./map-route-draft-card";
import { useRouteFeedback } from "./route-feedback-context";
import { MAX_ROUTE_WAYPOINTS, formatRouteDistance } from "./map-route-utils";
import type { MapMetadata, MapRouteWaypoint, MapView } from "./types";
import { useCalculatedMapRoute } from "./use-calculated-map-route";
import { useMapDisplayPreferences } from "./use-map-display-preferences";

interface MapRouteLayerProps {
  data: MapMetadata;
  points: MapRouteWaypoint[];
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  active: boolean;
  hideCard: boolean;
  showStops: boolean;
  resilient: boolean;
  color: string;
  onUndo: () => void;
  onCancel: () => void;
  onSave: () => void;
}

const MapRouteLayer = ({
  data,
  points,
  view,
  width,
  height,
  projection,
  active,
  hideCard,
  showStops,
  resilient,
  color,
  onUndo,
  onCancel,
  onSave,
}: MapRouteLayerProps) => {
  const { t, i18n } = useTranslation();
  const { preferences } = useMapDisplayPreferences();
  const calculation = useCalculatedMapRoute(data, points, resilient);
  useRouteFeedback(calculation.status);
  const projectedStops = points.map((point) => worldToScreen(point, view, width, height, projection));
  const projectedRoute = calculation.route.points
    .map((point) => worldToScreen(point, view, width, height, projection));
  const pathPoints = projectedRoute.map(({ left, top }) => `${left},${top}`).join(" ");
  const maximumReached = points.length >= MAX_ROUTE_WAYPOINTS;
  const routeStyle = { "--map-route-color": color } as CSSProperties;

  if (points.length === 0 && !active) return null;

  const routeMessage = (() => {
    if (calculation.status === "calculating") return t("map.route.calculating");
    if (calculation.status === "error") return t("map.route.unavailable");
    if (maximumReached) return t("map.route.maximumReached", { count: MAX_ROUTE_WAYPOINTS });
    if (points.length === 0) return t("map.route.pickStart");
    if (points.length === 1) return t("map.route.addStop");
    return formatRouteDistance(calculation.route.distance, preferences.distanceUnit, i18n.language);
  })();

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-live="polite" style={routeStyle}>
      {projectedRoute.length >= 2 && (
        <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <polyline points={pathPoints} className="map-route-line-shadow" />
          <polyline points={pathPoints} className="map-route-line" />
        </svg>
      )}
      {showStops && projectedStops.map((point, index) => (
        <span
          key={points[index]!.id}
          className="map-route-point"
          style={screenPointStyle(point.left, point.top)}
          title={points[index]!.label ?? t("map.route.stop", { number: index + 1 })}
          aria-hidden="true"
        >
          {index + 1}
        </span>
      ))}
      {!hideCard && active && (
        <MapRouteDraftCard
          message={routeMessage}
          stopCount={points.length}
          onUndo={onUndo}
          onCancel={onCancel}
          onSave={onSave}
        />
      )}
    </div>
  );
};

export default memo(MapRouteLayer);
