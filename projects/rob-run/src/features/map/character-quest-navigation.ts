import type { MapLocation } from "./types";
import type { MapPoint } from "./types";

export const TRACKED_QUEST_MARKER_SCALE = 1.35;

/** Pick giver pins once, keeping separate spawn locations without duplicate quest pins. */
export function getCharacterQuestGivers(points: MapLocation[], questIds: readonly string[]) {
  const ids = new Set(questIds);
  const quests = points.filter(point => point.questId && ids.has(point.questId));
  const giverIds = new Set(quests.map(point => point.questGiverMarkerId).filter(Boolean));
  const givers = points.filter(point => giverIds.has(point.id)
    || point.questOffers?.some(offer => ids.has(offer.id)));
  const found = new Set(givers.map(point => point.id));
  return [...givers, ...quests.filter(point => !point.questGiverMarkerId || !found.has(point.questGiverMarkerId))];
}

/** Tracking overrides category, faction, search, found and favorite visibility filters. */
export function mergeTrackedQuestPoints(visible: MapPoint[], tracked: MapLocation[]): MapPoint[] {
  const ids = new Set(visible.map(point => point.id));
  return [...visible, ...tracked.filter(point => !ids.has(point.id))];
}

export interface CharacterQuestDestination {
  questMarkerId: string;
  giverMarkerId: string;
  giverName: string;
  region: string;
}

/** Use exact quest IDs: distinct quests can share a title. */
export function indexCharacterQuestDestinations(points: MapLocation[]) {
  const index = new Map<string, CharacterQuestDestination>();
  for (const point of points) {
    if (point.questId && point.questGiverMarkerId && point.questGiverName) {
      if (!index.has(point.questId)) index.set(point.questId, { questMarkerId: point.id,
        giverMarkerId: point.questGiverMarkerId, giverName: point.questGiverName, region: point.region });
    }
  }
  for (const point of points) {
    for (const offer of point.questOffers ?? []) {
      if (!index.has(offer.id)) index.set(offer.id, { questMarkerId: point.id, giverMarkerId: point.id,
        giverName: point.name, region: point.region });
    }
  }
  return index;
}
