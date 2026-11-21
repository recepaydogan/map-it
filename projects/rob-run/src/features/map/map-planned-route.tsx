import { worldToScreen, type MapProjectionMode } from "./map-projection";
import type { MapMetadata, MapPoint, MapView } from "./types";

interface MapPlannedRouteProps {
  points: MapPoint[];
  dungeonRoutes?: MapMetadata["dungeonRoutes"];
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
}

const MapPlannedRoute = ({ points, dungeonRoutes, view, width, height, projection }: MapPlannedRouteProps) => {
  const gathering = points.length > 1;
  if ((!gathering && !dungeonRoutes?.length) || width <= 0 || height <= 0) return null;
  const routes = [
    ...(dungeonRoutes ?? []),
    ...(gathering ? [{ points: [...points, points[0]!], optional: true }] : []),
  ];
  return <svg className="pointer-events-none absolute inset-0 overflow-hidden" width={width} height={height}
    aria-hidden="true" data-map-gathering-route={gathering || undefined}
    data-map-dungeon-route={Boolean(dungeonRoutes?.length) || undefined}>
    {routes.map(({ points: route, optional }, index) => {
      const path = route.map((point) => worldToScreen(point, view, width, height, projection))
        .map(({ left, top }) => `${left},${top}`).join(" ");
      return <g key={index}>
        <polyline points={path} fill="none" stroke="rgba(10, 14, 17, 0.9)" strokeWidth="7" strokeLinejoin="round" />
        <polyline points={path} fill="none" stroke="var(--color-accent)" strokeWidth="3"
          strokeDasharray={optional ? "8 6" : undefined} strokeLinejoin="round" />
      </g>;
    })}
  </svg>;
};

export default MapPlannedRoute;
