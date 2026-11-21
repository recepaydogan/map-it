import type { MapCoordinate } from "./types";

/** Ties between equally good matches go to the place nearest the origin. */
export const distanceFromSearchOrigin = (
  point: MapCoordinate,
  origin: MapCoordinate | null,
) => origin ? Math.hypot(point.x - origin.x, point.y - origin.y) : Number.POSITIVE_INFINITY;
