import type { MapIsometricInfo } from "./map-isometric-types";
import type { MapCoordinate } from "./types";

export interface MapIsometricImagePoint {
  x: number;
  y: number;
}

const getScale = (mapInfo: MapIsometricInfo) => mapInfo.scale || 1;

/** Positive floors are stacked over ground, so their camera remains anchored
 * to ground. Basement views are isolated and use their selected floor. */
export const getIsometricCameraFloor = (floor: number) => floor >= 0 ? 0 : floor;

export const worldToIsometricImage = (
  coordinate: MapCoordinate,
  floor: number,
  mapInfo: MapIsometricInfo,
): MapIsometricImagePoint => {
  const scale = getScale(mapInfo);
  return {
    x: (mapInfo.x0 + (coordinate.x - coordinate.y) * mapInfo.sqr / 2) / scale,
    y: (mapInfo.y0 + (coordinate.x + coordinate.y) * mapInfo.sqr / 4 - floor * mapInfo.sqr * 1.5) / scale,
  };
};

export const isometricImageToWorld = (
  point: MapIsometricImagePoint,
  floor: number,
  mapInfo: MapIsometricInfo,
): MapCoordinate => {
  const scale = getScale(mapInfo);
  const projectedX = (point.x * scale - mapInfo.x0) / mapInfo.sqr;
  const projectedY = (point.y * scale - mapInfo.y0 + floor * mapInfo.sqr * 1.5) / mapInfo.sqr;
  return {
    x: projectedX + projectedY * 2,
    y: -projectedX + projectedY * 2,
  };
};

export const mapZoomToImageZoom = (mapZoom: number, mapInfo: MapIsometricInfo) =>
  mapZoom * getScale(mapInfo) / mapInfo.sqr;
