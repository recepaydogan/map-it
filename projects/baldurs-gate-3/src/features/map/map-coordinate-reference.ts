import type { MapCoordinate, MapCoordinateReference } from "./types";

const normalize = (value: number, start: number, length: number) => (value - start) / length;

/** Projects source-world X/Y coordinates onto a map raster. */
export const worldToMapCoordinate = (
  coordinate: MapCoordinate,
  reference: MapCoordinateReference,
): MapCoordinate => {
  const normalizedX = normalize(
    coordinate.x,
    reference.worldBounds.x,
    reference.worldBounds.width,
  );
  const normalizedY = normalize(
    coordinate.y,
    reference.worldBounds.y,
    reference.worldBounds.height,
  );
  return {
    x: reference.imageBounds.x + normalizedX * reference.imageBounds.width,
    y: reference.imageBounds.y
      + (reference.flipY ? 1 - normalizedY : normalizedY) * reference.imageBounds.height,
  };
};

/** Projects a source-world direction without applying the reference's origin. */
export const worldToMapDirection = (
  direction: MapCoordinate,
  reference: MapCoordinateReference,
): MapCoordinate => {
  const x = direction.x * reference.imageBounds.width / reference.worldBounds.width;
  const y = direction.y * reference.imageBounds.height / reference.worldBounds.height
    * (reference.flipY ? -1 : 1);
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
};

/** Restores source-world X/Y coordinates from a raster point. */
export const mapToWorldCoordinate = (
  coordinate: MapCoordinate,
  reference: MapCoordinateReference,
): MapCoordinate => {
  const normalizedX = normalize(
    coordinate.x,
    reference.imageBounds.x,
    reference.imageBounds.width,
  );
  const rasterY = normalize(
    coordinate.y,
    reference.imageBounds.y,
    reference.imageBounds.height,
  );
  const normalizedY = reference.flipY ? 1 - rasterY : rasterY;
  return {
    x: reference.worldBounds.x + normalizedX * reference.worldBounds.width,
    y: reference.worldBounds.y + normalizedY * reference.worldBounds.height,
  };
};
