import type { MapLocation } from "../map/types";
import type { MapReferenceSearch } from "../map/map-focus-request";
import type { ReferenceLocation } from "./reference-types";

export type ReferenceMapPoint = Pick<MapLocation, "x" | "y" | "category"> & Partial<Pick<MapLocation, "name" | "region" | "regionId" | "reference">>;
export type ReferenceMapPoints = ReadonlyMap<string, ReadonlyMap<string, ReferenceMapPoint>>;

export function groupCreatureReferenceLocations(
  locations: ReferenceLocation[], creatureName: string, maps: ReferenceMapPoints = new Map(),
) {
  const seen = new Set<string>();
  const suffix = ` · ${creatureName}`;
  return locations.flatMap((location) => {
    const fallbackRegion = location.name.endsWith(suffix)
      ? location.name.slice(0, -suffix.length)
      : location.name;
    const region = maps.get(location.mapId)?.get(location.markerId)?.region || fallbackRegion;
    const key = JSON.stringify([location.mapId, region]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ location, region }];
  });
}

export function groupQuestReferenceLocations(
  locations: ReferenceLocation[], maps: ReferenceMapPoints,
) {
  const seenEnemies = new Set<string>();
  const groups: { location: ReferenceLocation; region: string; search: MapReferenceSearch | undefined }[] = [];
  for (const location of groupReferenceLocations(locations, maps)) {
    const point = maps.get(location.mapId)?.get(location.markerId);
    if (point?.category !== "enemy" || point.reference?.category !== "creatures" || !point.name) {
      groups.push({ location, region: location.name, search: undefined });
      continue;
    }
    const region = point.region || location.name;
    const key = JSON.stringify([location.mapId, region, point.reference.id]);
    if (seenEnemies.has(key)) continue;
    seenEnemies.add(key);
    groups.push({ location, region, search: { referenceId: point.reference.id, name: point.name, region } });
  }
  return groups;
}

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
