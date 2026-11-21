import type { MapCoordinate, MapMetadata, UserMapMarker } from "../types";
import type { LootRunTarget } from "./loot-run-types";

export type LootRunStart =
  | { mode: "current" }
  | { mode: "town"; townId: string }
  | { mode: "point"; point: MapCoordinate | null }
  | { mode: "base"; markerId: string };

export const resolveLootRunStart = (
  start: LootRunStart,
  data: MapMetadata | null | undefined,
  current: MapCoordinate | null,
  markers: UserMapMarker[],
) => {
  if (!data) return null;
  const point = start.mode === "current" ? current
    : start.mode === "town" ? data.towns.find(({ id }) => id === start.townId)
      : start.mode === "point" ? start.point
        : markers.find(({ id }) => id === start.markerId);
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < data.bounds.minX || point.x > data.bounds.maxX
    || point.y < data.bounds.minY || point.y > data.bounds.maxY) return null;
  return { x: point.x, y: point.y };
};

export const LOOT_RUN_BASE_RADIUS = 1_600;

export const scopeLootRunTargets = (targets: LootRunTarget[], start: LootRunStart, origin: MapCoordinate | null) =>
  start.mode === "town"
    ? targets.filter(({ location }) => location.townId === start.townId)
    : start.mode === "base"
      ? targets.filter(({ location }) => origin
        && Math.hypot(location.x - origin.x, location.y - origin.y) <= LOOT_RUN_BASE_RADIUS)
      : targets;
