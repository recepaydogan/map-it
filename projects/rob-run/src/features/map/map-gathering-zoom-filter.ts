import { getCategoryConfig } from "./map-config";
import { getNormalizedMarkerZoom } from "./map-marker-zoom";
import type { MapProjectionMode } from "./map-projection";
import type { MapPoint } from "./types";

export const isZoomLimitedGatheringPoint = (point: MapPoint) => {
  const group = getCategoryConfig(point.category).groupId;
  return group === "herbs" || group === "mining" || group === "fishing";
};

/** Count before zoom filtering; match the percentage shown in the controls. */
export const shouldFilterGatheringForZoom = (
  markerCount: number,
  zoom: number,
  projection: MapProjectionMode,
) => markerCount > 5_000 && Math.round(getNormalizedMarkerZoom(zoom, projection) * 100) < 5;

export const filterGatheringForZoom = (points: MapPoint[], filtered: boolean) =>
  filtered ? points.filter((point) => !isZoomLimitedGatheringPoint(point)) : points;
