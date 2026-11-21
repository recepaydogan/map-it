import { isUserMapMarker, type MapPoint } from "./types";

// The wiki places Hollow Cyclops in these halls, but does not pinpoint its position inside them.
const hollowCyclopsHallIds = new Set([
  "HollowHalls-Revelwood",
  "HollowHalls-NomadHighlands",
  "HollowHalls-Kindlewastes",
]);

export const isLinkedQuestOfferPoint = (point: MapPoint): boolean =>
  "questGiverMarkerId" in point && !!point.questGiverMarkerId && !!point.questId;

/** One giver can appear in several filters without creating duplicate pins. */
export const getPointFilterCategories = (point: MapPoint): string[] => {
  if (isUserMapMarker(point)) return [point.category];
  if (point.category === "wiki-hollow_halls" && hollowCyclopsHallIds.has(point.id)) {
    return [point.category, "bestiary-hollow-bosses"];
  }
  if (point.category === "bestiary-bosses") return [`bestiary-${point.label.toLowerCase()}-bosses`];
  if (point.category === "bestiary-fell") {
    const floraAndFauna = /critter|boar|vine|crab|vulture|gazer|flayer|stalker|depthdweller/i.test(point.name);
    return [floraAndFauna ? "bestiary-fell-flora-fauna" : "bestiary-fell-militia"];
  }
  if (point.category.startsWith("bestiary-")) return [`${point.category}-enemies`];
  if (!point.questOffers?.length) {
    return point.questNpcDungeonIds?.length ? ["dungeon-quest"] : [point.category];
  }
  const kinds = new Set(point.questOffers.map((offer) => offer.kind ?? "normal"));
  return [
    ...(kinds.has("normal") ? ["npc"] : []),
    ...(kinds.has("repeatable") ? ["repeatable-quest"] : []),
    ...(kinds.has("dungeon") ? ["dungeon-quest"] : []),
  ];
};
