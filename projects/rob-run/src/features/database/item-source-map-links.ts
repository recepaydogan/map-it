import type { SearchLocation } from "../map/map-global-search";
import type { ItemSourceRecord } from "./use-item-research";

export interface ItemSourceMapLocation {
  mapId: string;
  markerId: string;
  name: string;
  region?: string;
  coordinates?: { x: number; y: number };
}

const npcCategories = new Set([
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
  const append = (index: Map<string, ItemSourceMapLocation[]>, key: string, location: ItemSourceMapLocation) => {
    const matches = index.get(key) ?? [];
    if (!matches.some((entry) => entry.mapId === location.mapId && entry.markerId === location.markerId)) matches.push(location);
    index.set(key, matches);
  };
  for (const { mapId, mapName, point } of locations) {
    if ("hiddenFromMap" in point && point.hiddenFromMap) continue;
    const location = { mapId, markerId: point.id, name: point.name,
      region: point.region || mapName,
      coordinates: "referenceCoordinates" in point ? point.referenceCoordinates : undefined };
    markers.set(`${mapId}:${point.id}`, location);
    if ("aliasIds" in point) for (const alias of point.aliasIds ?? []) markers.set(`${mapId}:${alias}`, location);
    if ("entityId" in point && point.entityId && npcCategories.has(point.category)) append(npcs, point.entityId, location);
    if ("questId" in point && point.questId) append(quests, point.questId, location);
    if ("questOffers" in point) for (const quest of point.questOffers ?? []) append(quests, quest.id, location);
    if (objectCategories.has(point.category)) append(objects, normalizedName(point.name), location);
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
