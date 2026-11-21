import type { MapCoordinate, MapSpawnData, MapSpawnPoint } from "./types";

export const getVisibleSpawnPoints = (data: MapSpawnData, professionId: string | null) =>
  professionId
    ? data.points.filter(({ professions }) => professions.includes(professionId))
    : data.points;

/**
 * The point's professions as full catalogue entries, in the catalogue's own
 * order — sorted by translated label, where the point stores raw game ids.
 */
export const getSpawnPointProfessions = (data: MapSpawnData, point: MapSpawnPoint) =>
  data.professions.filter(({ id }) => point.professions.includes(id));

export const getTownSpawnPointCount = (data: MapSpawnData, townId: string) =>
  data.points.filter((point) => point.townId === townId).length;

export const findSpawnPointAtCoordinate = (
  data: MapSpawnData,
  coordinate: MapCoordinate,
  professionId: string | null,
  tolerance: number,
): MapSpawnPoint | null => {
  let nearest: { point: MapSpawnPoint; distance: number } | null = null;
  for (const point of getVisibleSpawnPoints(data, professionId)) {
    const distance = Math.hypot(point.x - coordinate.x, point.y - coordinate.y);
    if (distance > tolerance || (nearest && distance >= nearest.distance)) continue;
    nearest = { point, distance };
  }
  return nearest?.point ?? null;
};
