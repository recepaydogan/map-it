import type { SearchLocation } from "../map/map-global-search";
import { isLinkedQuestOfferPoint } from "../map/map-quest-filter.ts";
import type { MapQuestInfo } from "../map/types";
import type { ItemSourceRecord } from "./use-item-research";

export interface ItemSourceMapLocation {
  mapId: string;
  markerId: string;
  name: string;
  region?: string;
  category?: string;
  iconPath?: string;
  coordinates?: { x: number; y: number };
  questFaction?: MapQuestInfo["faction"];
}

export const itemSourceNpcCategories = new Set([
  "npc", "creature", "enemy", "boss", "rare", "rare-elite", "rare-creature", "elite",
  "merchant", "repair-vendor", "ammunition-vendor", "reagent-vendor", "class-trainer",
  "profession-trainer", "flight-master", "battlemaster", "innkeeper", "stable-master",
  "banker", "auctioneer", "transmogrifier", "hunter-pet",
]);
const objectCategories = new Set(["object", "treasure", "chest", "book"]);
const normalizedName = (name: string) => name.trim().toLocaleLowerCase("en").replace(/[’‘]/g, "'");

export function indexItemSourceMapLocations(locations: SearchLocation[]) {
  const npcs = new Map<string, ItemSourceMapLocation[]>();
  const quests = new Map<string, ItemSourceMapLocation[]>();
  const objects = new Map<string, ItemSourceMapLocation[]>();
  const markers = new Map<string, ItemSourceMapLocation>();
  const linkedOffers: { mapId: string; questId: string; giverId: string; ids: string[]; faction?: MapQuestInfo["faction"] }[] = [];
  const append = (index: Map<string, ItemSourceMapLocation[]>, key: string, location: ItemSourceMapLocation) => {
    const matches = index.get(key) ?? [];
    const existing = matches.findIndex((entry) => entry.mapId === location.mapId && entry.markerId === location.markerId);
    if (existing === -1) matches.push(location);
    else if (location.questFaction) matches[existing] = location;
    index.set(key, matches);
  };
  for (const { mapId, mapName, point } of locations) {
    if ("hiddenFromMap" in point && point.hiddenFromMap) continue;
    if (isLinkedQuestOfferPoint(point)) {
      linkedOffers.push({ mapId, questId: point.questId, giverId: point.questGiverMarkerId,
        ids: [point.id, ...(point.aliasIds ?? [])], faction: point.questInfo?.faction });
      continue;
    }
    const location = { mapId, markerId: point.id, name: point.name,
      region: point.region || mapName,
      category: point.category,
      iconPath: "iconPath" in point ? point.iconPath : undefined,
      coordinates: "referenceCoordinates" in point ? point.referenceCoordinates : undefined };
    markers.set(`${mapId}:${point.id}`, location);
    if ("aliasIds" in point) for (const alias of point.aliasIds ?? []) markers.set(`${mapId}:${alias}`, location);
    if ("entityId" in point && point.entityId && itemSourceNpcCategories.has(point.category)) append(npcs, point.entityId, location);
    if ("questId" in point && point.questId) append(quests, point.questId, { ...location, questFaction: point.questInfo?.faction });
    if ("questOffers" in point) for (const quest of point.questOffers ?? []) append(quests, quest.id, location);
    if (objectCategories.has(point.category)) append(objects, normalizedName(point.name), location);
  }
  for (const { mapId, questId, giverId, ids, faction } of linkedOffers) {
    const giver = markers.get(`${mapId}:${giverId}`);
    if (!giver) continue;
    const location = { ...giver, questFaction: faction };
    append(quests, questId, location);
    for (const id of ids) markers.set(`${mapId}:${id}`, location);
  }
  return { npcs, quests, objects, markers };
}

export type ItemSourceMapIndex = ReturnType<typeof indexItemSourceMapLocations>;

/** Resolve identities in their own namespace; matching a loot source never verifies its loot. */
export function getItemSourceMapLocations(source: ItemSourceRecord, index?: ItemSourceMapIndex): ItemSourceMapLocation[] {
  const explicit = source.mapId && source.markerId
    ? index?.markers.get(`${source.mapId}:${source.markerId}`)
      ?? { mapId: source.mapId, markerId: source.markerId, name: source.n ?? "" }
    : undefined;
  const matches = source.t === "drop" || source.t === "vendor"
    ? source.npc ? index?.npcs.get(String(source.npc)) : undefined
    : source.t === "quest" && source.q ? index?.quests.get(String(source.q))
    : source.t === "object" && source.n ? index?.objects.get(normalizedName(source.n)) : undefined;
  const unique = new Map<string, ItemSourceMapLocation>();
  for (const location of [...(explicit ? [explicit] : []), ...(matches ?? [])]) {
    unique.set(`${location.mapId}:${location.markerId}`, location);
  }
  return [...unique.values()];
}
