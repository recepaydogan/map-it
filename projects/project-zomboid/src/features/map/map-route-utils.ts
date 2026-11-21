import type { MapCoordinate } from "./types.ts";
import type { MapDistanceUnit } from "./map-display-preferences.ts";

export const MAX_ROUTE_WAYPOINTS = 32;
export const MAX_SAVED_ROUTES_PER_MAP = 8;
export const MAX_ROUTE_NAME_LENGTH = 80;

const MAP_ROUTE_COLORS = [
  "#c97855",
  "#84a878",
  "#e2b86f",
  "#5d7f9d",
  "#b85f59",
  "#806da8",
  "#6f9b8a",
  "#d08f5b",
] as const;

export const getMapRouteColor = (routeId: string) => {
  const hash = [...routeId].reduce((value, character) => (
    Math.imul(value, 31) + character.charCodeAt(0)
  ) | 0, 0);
  return MAP_ROUTE_COLORS[Math.abs(hash) % MAP_ROUTE_COLORS.length]!;
};

export const getRouteLegDistances = (points: MapCoordinate[]) => points.slice(1).map((point, index) => {
  const previous = points[index]!;
  return Math.hypot(point.x - previous.x, point.y - previous.y);
});

export const getRouteDistance = (points: MapCoordinate[]) => getRouteLegDistances(points)
  .reduce((total, distance) => total + distance, 0);

const METERS_PER_MILE = 1609.344;

export const formatRouteDistance = (
  tiles: number,
  unit: MapDistanceUnit,
  locale: string,
) => {
  if (unit === "tiles") {
    return `${Math.round(tiles).toLocaleString(locale)} tiles`;
  }
  if (unit === "metric" && tiles < 1000) {
    return `~${Math.round(tiles).toLocaleString(locale)} m`;
  }
  const divisor = unit === "metric" ? 1000 : METERS_PER_MILE;
  const distance = tiles / divisor;
  const maximumFractionDigits = distance < 10 ? 1 : 0;
  const suffix = unit === "metric" ? "km" : "mi";
  return `~${distance.toLocaleString(locale, { maximumFractionDigits })} ${suffix}`;
};
