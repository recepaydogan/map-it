import type { MapPoint } from "./types";

/** No game-specific factions are defined for the Enshrouded starter map. */
export const MAP_FACTIONS = ["All"] as const;
export type MapFaction = typeof MAP_FACTIONS[number];

export const isQuestPoint = (point: MapPoint) =>
  point.category === "quest" || point.category === "dungeon-quest"
  || point.category === "repeatable-quest";

export const isPointVisibleForFactions = (point: MapPoint, selected: readonly MapFaction[]) => {
  void point;
  void selected;
  return true;
};
