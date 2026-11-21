import { isUserMapMarker, type MapPoint } from "./types";

export const isLinkedQuestOfferPoint = (point: MapPoint): boolean =>
  "questGiverMarkerId" in point && !!point.questGiverMarkerId && !!point.questId;

/** One giver can appear in several filters without creating duplicate pins. */
export const getPointFilterCategories = (point: MapPoint): string[] => {
  if (isUserMapMarker(point)) return [point.category];
  if (!point.questOffers?.length) {
    return point.questNpcDungeonIds?.length ? ["dungeon-quest"] : [point.filterCategoryId ?? point.category];
  }
  const kinds = new Set(point.questOffers.map((offer) => offer.kind ?? "normal"));
  return [
    ...(kinds.has("normal") ? ["npc"] : []),
    ...(kinds.has("repeatable") ? ["repeatable-quest"] : []),
    ...(kinds.has("dungeon") ? ["dungeon-quest"] : []),
  ];
};
