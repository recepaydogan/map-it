import { contentUrl } from "../../lib/content-url";

interface NpcPin {
  mapId: string;
  markerId: string;
  name: string;
  region: string;
}
interface SearchIndex {
  version: 1;
  locations: {
    mapId: string;
    point: { id: string; name: string; category: string; region?: string };
  }[];
}

const NPC_PIN_CATEGORIES = new Set([
  "profession-trainer", "merchant", "repair-vendor", "flight-master",
  "auctioneer", "banker", "stable-master", "innkeeper", "battlemaster", "transmogrifier", "npc",
]);
let request: Promise<Map<string, NpcPin[]>> | undefined;

export const loadDungeonNpcPins = () => {
  request ??= fetch(contentUrl("data/map-search/index.json")).then(async (response) => {
    if (!response.ok) throw new Error(`Map search: HTTP ${response.status}`);
    const data = await response.json() as SearchIndex;
    if (data.version !== 1 || !Array.isArray(data.locations)) throw new Error("Invalid map search index");
    const byName = new Map<string, NpcPin[]>();
    for (const { mapId, point } of data.locations) {
      if (!point.name || !NPC_PIN_CATEGORIES.has(point.category)) continue;
      const key = point.name.trim().toLocaleLowerCase("en");
      const pins = byName.get(key) ?? [];
      pins.push({ mapId, markerId: point.id, name: point.name, region: point.region ?? "" });
      byName.set(key, pins);
    }
    return byName;
  }).catch((error: unknown) => { request = undefined; throw error; });
  return request;
};

/** A shared name alone is insufficient when several NPC pins exist. */
export const matchingDungeonNpcPin = (pins: Map<string, NpcPin[]> | undefined, name: string, where: string) => {
  const matches = pins?.get(name.trim().toLocaleLowerCase("en")) ?? [];
  if (matches.length === 1) return matches[0];
  const regionMatches = matches.filter(({ region }) => region && where.toLocaleLowerCase("en")
    .includes(region.toLocaleLowerCase("en")));
  return regionMatches.length === 1 ? regionMatches[0] : undefined;
};
