import { bestFuzzyScore, bestMatchScore, createMapSearchQuery, createSearchTextPreparer, matchScore, NO_MATCH } from "./map-search-match.ts";
import { REMOVED_MAP_CATEGORY_IDS } from "./map-registry";
import type { ReferenceRewardRate } from "../reference/reference-types";
import type { MapPoint } from "./types";

export interface SearchLocation {
  mapId: string;
  mapName: string;
  point: MapPoint;
  count: number;
  names?: string[];
}
export interface SearchItem {
  id: string;
  name: string;
  category: string;
  grade: string;
  icon?: string;
  chunk: string;
  sourceCount: number;
}
export type SearchSourceKind = "loot" | "purchase" | "gather" | "craft" | "pickup" | "reward" | "quest" | "container" | "companion" | "related";
export interface SearchItemSource {
  location: number;
  kind: SearchSourceKind;
  originKind?: SearchSourceKind;
  via?: { id: string; name: string; category: string }[];
  price?: { amount: number; currency: string }[];
  rates?: ReferenceRewardRate[];
}
export interface GlobalSearchCatalog { version: 1; locations: SearchLocation[]; items: SearchItem[] }
export interface SearchItemResult extends SearchItem { sources: SearchItemSource[] }
export interface SearchQuestResult { location: SearchLocation; quest: { id: string; name: string; level?: number } }
export interface SearchSourceContext {
  item: Pick<SearchItem, "id" | "name" | "icon">;
  source: Omit<SearchItemSource, "location">;
}

export const createSearchSourceContext = (item: SearchItemResult, source: SearchItemSource): SearchSourceContext => ({
  item: { id: item.id, name: item.name, icon: item.icon },
  source: { kind: source.kind, originKind: source.originKind, via: source.via, price: source.price, rates: source.rates },
});

export function prepareGlobalSearch(catalog: GlobalSearchCatalog, gameText: (name: string, key?: string) => string = name => name) {
  const prepare = createSearchTextPreparer();
  const names = (values: string[]) => [...new Set(values)].map(prepare);
  return {
    locations: catalog.locations.map(location => ({ location,
      names: names(("questOffers" in location.point ? [location.point.name] : location.names ?? [location.point.name])
        .flatMap(name => [name, gameText(name, "entityId" in location.point ? `Creature:${location.point.entityId}:0` : undefined)])),
      context: prepare([location.mapName, location.point.region, location.point.label, location.point.category].join(" ")),
    })),
    items: catalog.items.map(item => ({ item, names: names([item.name, gameText(item.name, `ItemSparse:${item.id}:4`)]) })),
    quests: catalog.locations.flatMap(location => "questOffers" in location.point
      ? (location.point.questOffers ?? []).map(quest => ({ location, quest, names: names([quest.name, gameText(quest.name, `Quest:${quest.id}:0`)]) })) : []),
  };
}

export function searchGlobalCatalog(prepared: ReturnType<typeof prepareGlobalSearch>, rawQuery: string, currentMapId: string) {
  const query = createMapSearchQuery(rawQuery);
  if (query.empty) return { locations: [], items: [], quests: [] };
  const collectLocations = (fuzzy: boolean) => prepared.locations.flatMap(({ location, names, context }) => {
    if (REMOVED_MAP_CATEGORY_IDS.has(location.point.category)) return [];
    let score = (fuzzy ? bestFuzzyScore : bestMatchScore)(names, query);
    if (!fuzzy && score === NO_MATCH && matchScore(context, query) !== NO_MATCH) score = 3;
    return score === NO_MATCH ? [] : [{ ...location, score }];
  });
  let locations = collectLocations(false);
  if (!locations.length) locations = collectLocations(true);
  locations.sort((a, b) => a.score - b.score
    || Number(b.point.category === "boss") - Number(a.point.category === "boss")
    || Number(b.mapId === currentMapId) - Number(a.mapId === currentMapId)
    || a.point.name.localeCompare(b.point.name));
  const collectItems = (fuzzy: boolean) => prepared.items.flatMap(({ item, names }) => {
    const score = (fuzzy ? bestFuzzyScore : bestMatchScore)(names, query);
    return score === NO_MATCH ? [] : [{ item, score }];
  });
  let items = collectItems(false);
  if (!items.length) items = collectItems(true);
  items.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id));
  const collectQuests = (fuzzy: boolean) => prepared.quests.flatMap(({ location, quest, names }) => {
    const score = (fuzzy ? bestFuzzyScore : bestMatchScore)(names, query);
    return score === NO_MATCH ? [] : [{ location, quest, score }];
  });
  let quests = collectQuests(false);
  if (!quests.length) quests = collectQuests(true);
  quests.sort((a, b) => a.score - b.score
    || Number(b.location.mapId === currentMapId) - Number(a.location.mapId === currentMapId)
    || a.quest.name.localeCompare(b.quest.name) || a.location.point.name.localeCompare(b.location.point.name));
  return { locations: locations.slice(0, 8), items: items.slice(0, 5).map(({ item }) => item), quests: quests.slice(0, 8) };
}

const sourceOrder: Record<SearchSourceKind, number> = { pickup: 0, purchase: 1, gather: 2, loot: 3, quest: 4, reward: 5, craft: 6, container: 7, companion: 8, related: 9 };
export const sortSearchSources = (sources: SearchItemSource[], locations: SearchLocation[], currentMapId: string) => [...sources].sort((a, b) =>
  sourceOrder[a.kind] - sourceOrder[b.kind]
  || Number(locations[b.location]?.mapId === currentMapId) - Number(locations[a.location]?.mapId === currentMapId)
  || (a.kind === "loot" && b.kind === "loot"
    ? Math.max(-1, ...b.rates?.map(rate => rate.percent) ?? []) - Math.max(-1, ...a.rates?.map(rate => rate.percent) ?? []) : 0)
  || (locations[a.location]?.point.name ?? "").localeCompare(locations[b.location]?.point.name ?? ""));
