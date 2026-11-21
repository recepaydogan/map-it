import type { MapMarkerAddress, MapMetadata, MapPoint, MapRegion } from "./types";
import { getMapCompanionSources } from "./map-companion-sources.ts";

import type { SearchSourceContext } from "./map-global-search";

export const GUIDE_NAVIGATION_ZOOM = 0.9;

export interface MapFocusRequest {
  searchQuery?: string;
  referenceId?: string;
  searchItemId?: string;
  searchMarkerIds?: string[];
  region?: string;
  allRegions?: boolean;
  sourceContext?: SearchSourceContext;
  mapId?: string;
  pointId?: string;
  preserveZoom?: boolean;
  zoom?: number;
  centerOnPoint?: boolean;
  destination?: { name: string; x: number; y: number; companionId?: string; returnTo?: MapMarkerAddress };
  regionOnly?: boolean;
}

export interface MapReferenceSearch {
  referenceId: string;
  name: string;
  region: string;
  allRegions?: boolean;
}

export const getMapRegionTargetId = (regionId: string) => `region:${regionId}`;

export const createMapRegionFocusPoint = (region: MapRegion): MapPoint => ({
  id: getMapRegionTargetId(region.id), name: region.name, x: region.x, y: region.y,
  category: "custom", subtype: "region", regionId: region.id, region: region.name, label: "",
});

export const createMapOverviewFocusPoint = (map: Pick<MapMetadata, "id" | "bounds" | "displayName">): MapPoint => ({
  id: `map-overview:${map.id}`, name: map.displayName,
  x: (map.bounds.minX + map.bounds.maxX) / 2,
  y: (map.bounds.minY + map.bounds.maxY) / 2,
  category: "custom", subtype: "map-overview", regionId: "map-overview", region: map.displayName, label: "",
});

export function resolveMapFocusPoint(request: MapFocusRequest, map: Pick<MapMetadata, "id" | "bounds" | "displayName"> & Partial<Pick<MapMetadata, "regions" | "navigationBounds">>, points: MapPoint[]): MapPoint | undefined {
  if (request.mapId && request.mapId !== map.id) return;
  const bounds = map.navigationBounds ?? map.bounds;
  if (!request.destination) {
    const point = points.find((point) => point.id === request.pointId
      || (request.pointId !== undefined && "aliasIds" in point && point.aliasIds?.includes(request.pointId)));
    if (point) return point;
    const region = map.regions?.find((region) => getMapRegionTargetId(region.id) === request.pointId);
    if (!region || !Number.isFinite(region.x) || !Number.isFinite(region.y)
      || region.x < bounds.minX || region.x > bounds.maxX
      || region.y < bounds.minY || region.y > bounds.maxY) return;
    return createMapRegionFocusPoint(region);
  }
  const { name, x, y, returnTo } = request.destination;
  const { minX, minY, maxX, maxY } = bounds;
  if (!name || !Number.isFinite(x) || !Number.isFinite(y) || x < minX || x > maxX || y < minY || y > maxY) return;
  if (request.destination.companionId) {
    const companionId = request.destination.companionId;
    const source = points.find((point) => Math.abs(point.x - x) < 0.01 && Math.abs(point.y - y) < 0.01
      && getMapCompanionSources(point).some(({ companion }) => companion.id === companionId));
    if (source) return source;
  }
  return {
    id: `arrival-${map.id}-${x}-${y}`, name, x, y,
    category: "custom", subtype: "coordinate", regionId: "coordinate", region: map.displayName, label: "", returnTo,
  };
}
