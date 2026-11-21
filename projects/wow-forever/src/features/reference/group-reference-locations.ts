import type { MapLocation } from "../map/types";
import type { ReferenceLocation } from "./reference-types";

export type ReferenceMapPoint = Pick<MapLocation, "x" | "y" | "category">;
export type ReferenceMapPoints = ReadonlyMap<string, ReadonlyMap<string, ReferenceMapPoint>>;

// Map-image units, independent of the current zoom level.
export const REFERENCE_LOCATION_RADIUS = 32;

/** Keep a real map target for each nearby group; never merge by name alone. */
export function groupReferenceLocations(
  locations: ReferenceLocation[],
  maps: ReferenceMapPoints,
): ReferenceLocation[] {
  const seen = new Set<string>();
  const groups = new Map<string, ReferenceMapPoint[]>();
  return locations.filter((location) => {
    const identity = JSON.stringify([location.mapId, location.markerId]);
    if (seen.has(identity)) return false;
    seen.add(identity);

    const point = maps.get(location.mapId)?.get(location.markerId);
    // Unresolved coordinates must not hide potentially distinct destinations.
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return true;
    const key = JSON.stringify([location.mapId, location.name, point.category]);
    const representatives = groups.get(key) ?? [];
    if (representatives.some((other) =>
      Math.hypot(point.x - other.x, point.y - other.y) <= REFERENCE_LOCATION_RADIUS)) return false;

    // Compare with retained destinations, so a chain cannot swallow distant points.
    representatives.push(point);
    groups.set(key, representatives);
    return true;
  });
}
