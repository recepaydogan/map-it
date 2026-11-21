import { createMapItemLookup, getLocationLootProfileIds } from "./map-loot-utils.ts";
import {
  bestFuzzyScore,
  bestMatchScore,
  createMapSearchQuery,
  NO_MATCH,
  prepareSearchText,
  type PreparedSearchText,
} from "./map-search-match.ts";
import type { MapLocation, MapMetadata } from "./types.ts";
import type { MapCoordinate } from "./types.ts";
import { distanceFromSearchOrigin, lootSearchUtility } from "./map-search-ranking.ts";
import { getSearchFloorGroupKey } from "./map-floor-visibility.ts";

/**
 * Searching the map by ITEM.
 *
 * A player asks "where do I find a screwdriver", not "which building is called
 * screwdriver". The loot data answers that — every location carries the profile
 * ids of the container tables that spawn in it, and every profile lists what it
 * can hand over — but only in the wrong direction: profile → items. This module
 * inverts it once per map, then answers item → the buildings that drop it.
 *
 * The inverted index is stored as parallel typed arrays rather than objects:
 * Knox Country is ~8.5k loot profiles averaging 31 items each, so the object
 * form would be a quarter of a million allocations sitting in memory for a
 * feature the player may never use. Five bytes per pair keeps it near 1.5 MB,
 * and building it stays a one-off ~250k-iteration pass that runs lazily on the
 * first keystroke.
 */

/** One item, with the locations that spawn it as indexes into the index's own
 *  location array — see the module comment for why these aren't objects. */
interface MapItemIndexEntry {
  id: string;
  name: string;
  /** The display name and the raw id's tail ("Base.Sledgehammer" →
   *  "Sledgehammer"), folded once. Localized data replaces the display name, so
   *  the tail is what keeps the English spelling searchable. */
  searchable: PreparedSearchText[];
  bestWeight: number;
  locations: Int32Array;
  /** Relative spawn likelihood, 1-100, aligned with `locations`. */
  weights: Uint8Array;
}

export interface MapItemSearchIndex {
  entries: MapItemIndexEntry[];
  locations: MapLocation[];
}

/** A building (or a group of identically named ones) that spawns the item. */
export interface MapItemSource {
  location: MapLocation;
  weight: number;
  /** How many identical buildings in the same town collapsed into this row. */
  count: number;
}

export interface MapItemSearchResult {
  id: string;
  name: string;
  bestWeight: number;
  /** Buildings before collapsing — what the player would actually have to visit. */
  locationCount: number;
  sources: MapItemSource[];
  /** Every spawning building, uncapped and ungrouped. The dropdown shows a
   *  shortlist; the map behind it filters down to all of them. */
  locationIds: string[];
}

/** Item rows a query gets. Small on purpose: the locations section shares the
 *  dropdown, and each item unfolds into source rows of its own. */
const ITEM_LIMIT = 4;

/** Source rows kept per item. Beyond this the tail is all 1-2% chances that no
 *  player would route to. */
const SOURCE_LIMIT = 12;

/**
 * The item → locations index for a map, or null while there is no data.
 *
 * Locations with several loot profiles keep the BEST weight for an item rather
 * than one row per profile: two tables in one building that both spawn nails is
 * still one building to visit.
 */
export const createMapItemSearchIndex = (
  data: MapMetadata | null | undefined,
): MapItemSearchIndex | null => {
  const profiles = data?.lootProfiles;
  if (!data || !profiles) return null;

  const locations = data.locations;
  const itemLookup = createMapItemLookup(data.items);
  const counts = new Map<string, number>();
  const merged = new Map<string, number>();

  /** What a location spawns, one entry per item, best weight kept. */
  const itemsOf = (location: MapLocation): Iterable<[string, number]> => {
    const profileIds = getLocationLootProfileIds(location);
    merged.clear();
    for (const profileId of profileIds) {
      for (const item of profiles[profileId]?.items ?? []) {
        const current = merged.get(item.id);
        if (current === undefined || item.weight > current) merged.set(item.id, item.weight);
      }
    }
    return merged;
  };

  // Pass one sizes every item's arrays, so pass two can fill them without a
  // single intermediate array or resize.
  for (const location of locations) {
    for (const [itemId] of itemsOf(location)) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  }

  const entries = new Map<string, MapItemIndexEntry>();
  const cursors = new Map<string, number>();
  for (const [itemId, count] of counts) {
    const alias = itemId.replace(/^.*[.]/, "");
    const name = itemLookup.get(itemId)?.name ?? alias;
    entries.set(itemId, {
      id: itemId,
      name,
      searchable: [...new Set([name, alias])].map(prepareSearchText),
      bestWeight: 0,
      locations: new Int32Array(count),
      weights: new Uint8Array(count),
    });
    cursors.set(itemId, 0);
  }

  for (let index = 0; index < locations.length; index += 1) {
    for (const [itemId, weight] of itemsOf(locations[index]!)) {
      const entry = entries.get(itemId)!;
      const cursor = cursors.get(itemId)!;
      entry.locations[cursor] = index;
      entry.weights[cursor] = Math.max(1, Math.min(100, Math.round(weight)));
      cursors.set(itemId, cursor + 1);
      if (weight > entry.bestWeight) entry.bestWeight = weight;
    }
  }

  return { entries: [...entries.values()], locations };
};

/**
 * The buildings that spawn `entry`, best lead first.
 *
 * Rows collapse on category+town+name — the tuple that makes two buildings the
 * same ANSWER to "where do I get it" — keeping the strongest chance/proximity
 * combination as the point to fly to and counting the rest.
 */
const collectSources = (
  entry: MapItemIndexEntry,
  locations: MapLocation[],
  origin: MapCoordinate | null,
) => {
  const grouped = new Map<string, MapItemSource>();
  const locationIds: string[] = [];
  for (let index = 0; index < entry.locations.length; index += 1) {
    const location = locations[entry.locations[index]!]!;
    const weight = entry.weights[index]!;
    locationIds.push(location.id);
    const key = `${location.category}|${location.town}|${location.name}|${getSearchFloorGroupKey(location)}`;
    const source = grouped.get(key);
    if (!source) {
      grouped.set(key, { location, weight, count: 1 });
      continue;
    }
    source.count += 1;
    if (lootSearchUtility(weight, location, origin)
      > lootSearchUtility(source.weight, source.location, origin)) {
      source.weight = weight;
      source.location = location;
    }
  }

  const sources = [...grouped.values()]
    .sort((left, right) =>
      lootSearchUtility(right.weight, right.location, origin)
      - lootSearchUtility(left.weight, left.location, origin) ||
      right.weight - left.weight ||
      distanceFromSearchOrigin(left.location, origin)
      - distanceFromSearchOrigin(right.location, origin) ||
      right.count - left.count ||
      left.location.town.localeCompare(right.location.town) ||
      left.location.name.localeCompare(right.location.name))
    .slice(0, SOURCE_LIMIT);
  return { sources, locationIds };
};

/**
 * Items matching `rawQuery`, each with the buildings that spawn it.
 *
 * Strict tiers first and typos only as a rescue, exactly like the location
 * search — and sources are collected for the shown items only, so a keystroke
 * costs a scan of the item names plus a handful of index reads.
 */
export const searchMapItems = (
  index: MapItemSearchIndex | null,
  rawQuery: string,
  origin: MapCoordinate | null = null,
): MapItemSearchResult[] => {
  const query = createMapSearchQuery(rawQuery);
  if (!index || query.empty) return [];

  const collect = (score: (entry: MapItemIndexEntry) => number) => {
    const scored: { entry: MapItemIndexEntry; score: number }[] = [];
    for (const entry of index.entries) {
      const value = score(entry);
      if (value !== NO_MATCH) scored.push({ entry, score: value });
    }
    return scored;
  };

  let scored = collect((entry) => bestMatchScore(entry.searchable, query));
  if (scored.length === 0) {
    scored = collect((entry) => bestFuzzyScore(entry.searchable, query));
  }

  const bestUtility = (entry: MapItemIndexEntry) => {
    let result = 0;
    for (let position = 0; position < entry.locations.length; position += 1) {
      result = Math.max(result, lootSearchUtility(
        entry.weights[position]!,
        index.locations[entry.locations[position]!]!,
        origin,
      ));
    }
    return result;
  };

  return scored
    .map(({ entry, score }) => ({ entry, score, utility: bestUtility(entry) }))
    .sort((left, right) =>
      left.score - right.score ||
      right.utility - left.utility ||
      left.entry.name.localeCompare(right.entry.name))
    .slice(0, ITEM_LIMIT)
    .map(({ entry }) => ({
      id: entry.id,
      name: entry.name,
      bestWeight: entry.bestWeight,
      locationCount: entry.locations.length,
      ...collectSources(entry, index.locations, origin),
    }));
};

/** Source rows an item shows before folding the rest behind a "+N more". */
export const SOURCE_PREVIEW = 3;

/** The sources actually on screen for an item — the shared definition, so the
 *  rendered rows and the keyboard walk can never disagree about what is there. */
export const visibleMapItemSources = (
  result: MapItemSearchResult,
  expanded: boolean,
): MapItemSource[] => (expanded ? result.sources : result.sources.slice(0, SOURCE_PREVIEW));
