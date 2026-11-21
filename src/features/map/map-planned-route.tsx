import { worldToScreen, type MapProjectionMode } from "./map-projection";
import type { MapPoint, MapView } from "./types";

interface MapPlannedRouteProps {
  points: MapPoint[];
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
}

const MapPlannedRoute = ({ points, view, width, height, projection }: MapPlannedRouteProps) => {
  if (points.length < 2 || width <= 0 || height <= 0) return null;
  const positions = points.map((point) => worldToScreen(point, view, width, height, projection));
  const path = [...positions, positions[0]!].map(({ left, top }) => `${left},${top}`).join(" ");
  return <svg className="pointer-events-none absolute inset-0 overflow-hidden" width={width} height={height}
    aria-hidden="true" data-map-gathering-route>
    <polyline points={path} fill="none" stroke="rgba(10, 14, 17, 0.9)" strokeWidth="7" strokeLinejoin="round" />
    <polyline points={path} fill="none" stroke="var(--color-accent)" strokeWidth="3"
      strokeDasharray="8 6" strokeLinejoin="round" />
  </svg>;
};

export default MapPlannedRoute;
