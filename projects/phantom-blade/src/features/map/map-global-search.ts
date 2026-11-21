import { bestFuzzyScore, bestMatchScore, createMapSearchQuery, matchScore, NO_MATCH, prepareSearchText } from "./map-search-match.ts";
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
export interface SearchSourceContext {
  item: Pick<SearchItem, "id" | "name" | "icon">;
  source: Omit<SearchItemSource, "location">;
}

export const createSearchSourceContext = (item: SearchItemResult, source: SearchItemSource): SearchSourceContext => ({
  item: { id: item.id, name: item.name, icon: item.icon },
  source: { kind: source.kind, originKind: source.originKind, via: source.via, price: source.price, rates: source.rates },
});

export function prepareGlobalSearch(catalog: GlobalSearchCatalog) {
  return {
    locations: catalog.locations.map(location => ({ location,
      names: (location.names ?? [location.point.name]).map(prepareSearchText),
      context: prepareSearchText([location.mapName, location.point.region, location.point.label, location.point.category].join(" ")),
    })),
    items: catalog.items.map(item => ({ item, names: [prepareSearchText(item.name)] })),
  };
}

/** Add native translated search terms while preserving English aliases and source records. */
export function localizePreparedSearch(prepared: ReturnType<typeof prepareGlobalSearch>, translate: (text: string, key?: string) => string, mapLabel: (id: string, source: string) => string) {
  return {
    locations: prepared.locations.map(row => {
      const reference = "reference" in row.location.point ? row.location.point.reference : undefined;
      return { ...row,
      names: [...row.names, ...(row.location.names ?? [row.location.point.name]).map(name => prepareSearchText(translate(name,
        name === row.location.point.name && reference ? `Wiki:${reference.id}:/name` : undefined)))],
      context: prepareSearchText([row.location.mapName, mapLabel(row.location.mapId, row.location.mapName), translate(row.location.point.region), translate(row.location.point.label), row.location.point.category].join(" ")),
    }; }),
    items: prepared.items.map(row => ({ ...row, names: [...row.names, prepareSearchText(translate(row.item.name, `Wiki:${row.item.id}:/name`))] })),
  };
}

export function searchGlobalCatalog(prepared: ReturnType<typeof prepareGlobalSearch>, rawQuery: string, currentMapId: string) {
  const query = createMapSearchQuery(rawQuery);
  if (query.empty) return { locations: [], items: [] };
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
  return { locations: locations.slice(0, 8), items: items.slice(0, 5).map(({ item }) => item) };
}

const sourceOrder: Record<SearchSourceKind, number> = { pickup: 0, purchase: 1, gather: 2, loot: 3, quest: 4, reward: 5, craft: 6, container: 7, companion: 8, related: 9 };
export const sortSearchSources = (sources: SearchItemSource[], locations: SearchLocation[], currentMapId: string) => [...sources].sort((a, b) =>
  sourceOrder[a.kind] - sourceOrder[b.kind]
  || Number(locations[b.location]?.mapId === currentMapId) - Number(locations[a.location]?.mapId === currentMapId)
  || (locations[a.location]?.point.name ?? "").localeCompare(locations[b.location]?.point.name ?? ""));
