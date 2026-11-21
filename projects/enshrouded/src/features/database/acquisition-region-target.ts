import { getMapRegionTargetId } from "../map/map-focus-request.ts";
import type { MapMetadata } from "../map/types";
import type { ItemAcquisitionSource } from "./item-database-types";

export function getAcquisitionRegionTarget(
  source: ItemAcquisitionSource,
  maps: ReadonlyMap<string, Pick<MapMetadata, "regions" | "bounds">>,
): string | undefined {
  if (!source.mapId || !source.region) return;
  const map = maps.get(source.mapId);
  if (!map) return;
  const matches = map.regions.filter((region) => region.name === source.region);
  // Ambiguous names and invalid coordinates must never create a navigation link.
  if (matches.length !== 1) return;
  const region = matches[0];
  const { minX, minY, maxX, maxY } = map.bounds;
  if (!region.id || !Number.isFinite(region.x) || !Number.isFinite(region.y)
    || region.x < minX || region.x > maxX || region.y < minY || region.y > maxY) return;
  return getMapRegionTargetId(region.id);
}
