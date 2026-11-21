import type { MapIsometricFloor } from "./map-isometric-types";

export const getIsometricPyramidMaximumLevel = (floor: MapIsometricFloor) =>
  floor.pyramidMaximumLevel ?? floor.levels.at(-1) ?? 0;

export const isTileInIsometricRanges = (
  tileRanges: NonNullable<MapIsometricFloor["tileRanges"]>,
  level: number,
  tileX: number,
  tileY: number,
) => tileRanges[String(level)]?.some(([row, minimumColumn, maximumColumn]) =>
  row === tileY && tileX >= minimumColumn && tileX <= maximumColumn) ?? false;
