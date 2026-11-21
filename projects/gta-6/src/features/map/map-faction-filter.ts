import type { MapPoint } from "./types";

export const MAP_FACTIONS = ["Horde", "Alliance", "Neutral"] as const;
export type MapFaction = typeof MAP_FACTIONS[number];

const CHARACTER_FACTIONS: Record<"alliance" | "horde", readonly MapFaction[]> = {
  alliance: ["Alliance", "Neutral"],
  horde: ["Horde", "Neutral"],
};

export const getCharacterMapFactions = (side: "alliance" | "horde") => CHARACTER_FACTIONS[side];

export const isQuestPoint = (point: MapPoint) =>
  point.category === "quest" || point.category === "dungeon-quest"
  || point.category === "repeatable-quest";

export const isPointVisibleForFactions = (point: MapPoint, selected: readonly MapFaction[]) => {
  if (selected.length === 0 || selected.length === MAP_FACTIONS.length) return true;
  const faction = "questInfo" in point ? point.questInfo?.faction : undefined;
  const trainerFaction = "trainerFaction" in point ? point.trainerFaction : undefined;
  const knownFaction = faction ?? trainerFaction;
  if (knownFaction) return selected.includes(knownFaction);
  // Unclassified quests and trainers have no verified faction. Keep unrelated
  // map layers visible, but do not assign these records to a faction.
  return !isQuestPoint(point) && !("questOffers" in point && point.questOffers?.length)
    && point.category !== "class-trainer" && point.category !== "profession-trainer";
};

export const filterPointsForFactions = (
  points: MapPoint[], selected: readonly MapFaction[], linkedQuestPoints: MapPoint[] = [],
) => {
  if (selected.length === 0 || selected.length === MAP_FACTIONS.length) return points;

  const offerFactions = new Map<string, MapFaction>();
  for (const point of linkedQuestPoints) {
    if (!("questGiverMarkerId" in point) || !point.questGiverMarkerId
      || !("questId" in point) || !point.questId || !point.questInfo?.faction) continue;
    offerFactions.set(`${point.questGiverMarkerId}:${point.questId}`, point.questInfo.faction);
  }

  return points.flatMap((point) => {
    if (!("questOffers" in point) || !point.questOffers?.length) {
      return isPointVisibleForFactions(point, selected) ? [point] : [];
    }
    const offers = point.questOffers.filter((offer) => {
      const faction = offerFactions.get(`${point.id}:${offer.id}`) ?? point.questInfo?.faction;
      return !!faction && selected.includes(faction);
    });
    if (!offers.length) return [];
    return offers.length === point.questOffers.length ? [point] : [{ ...point, questOffers: offers }];
  });
};
