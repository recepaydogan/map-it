import type { MapCoordinate } from "./types";

export const distanceFromSearchOrigin = (
  point: MapCoordinate,
  origin: MapCoordinate | null,
) => origin ? Math.hypot(point.x - origin.x, point.y - origin.y) : Number.POSITIVE_INFINITY;

export const lootSearchUtility = (
  weight: number,
  point: MapCoordinate,
  origin: MapCoordinate | null,
) => {
  if (!origin) return weight;
  const proximity = 100 / (1 + distanceFromSearchOrigin(point, origin) / 1_000);
  return weight * 0.7 + proximity * 0.3;
};
