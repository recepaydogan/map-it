import { erMarkers } from "./er-markers-data";
import { erMausoleums } from "./er-mausoleums";
import { erSummonPools } from "./er-map-extras";
import { localizeErMapText } from "./er-map-text";
import { erSpiritsprings, erWaygates } from "./er-spiritsprings";
import { itemAcquisitionSources } from "./item-acquisition-sources";
import { markerArtUrl } from "./marker-art";
import type { Game, Marker } from "./types";

/**
 * No mock data. Markers are real or absent.
 *  - Nightreign: real, from generated NikVince data (nightreign-data.ts).
 *  - Elden Ring: real overworld markers extracted from the player's game
 *    (WorldMapPointParam → er-markers-data.ts). DLC/underground + boss/item-drop
 *    positions land in later extraction phases.
 *
 * The 213 co-op summoning pools (SignPuddleParam → er-map-extras.ts), the spiritsprings
 * and waygates (map MSBs → er-spiritsprings.ts) and the walking mausoleums (map MSBs →
 * er-mausoleums.ts) are merged in HERE rather than baked into er-markers.json: that file
 * is the frozen, hand-verified marker set and nothing is allowed to regenerate its
 * coordinates. Appending separately-built layers at import time gives the map the pins
 * without ever rewriting the original.
 */
const erAllMarkers = (base: Marker[]): Marker[] => [
  ...base,
  ...erSummonPools,
  ...erSpiritsprings,
  ...erWaygates,
  ...erMausoleums,
];

// LIVE BINDINGS — reassigned by rebuildMarkerIndexes() when the language changes
// (erMarkers itself is a live binding swapped to localized copies). Consumers read
// these at render time, so they pick up the localized data after a rebuild.
export let markersByGame: Record<Game, Marker[]> = {
  "elden-ring": erAllMarkers(erMarkers),
  nightreign: [],
};

/**
 * Every map location of a given item, keyed by its unique itemKey (group:id).
 * Powers the detail panel's "Where to find" — one click answers "where can I
 * actually get this?". Built once; the same item dropped in 3 spots → 3 entries.
 */
const buildItemLocationIndex = (): Map<string, Marker[]> => {
  const index = new Map<string, Marker[]>();
  for (const m of erMarkers) {
    if (!m.itemKey) continue;
    const list = index.get(m.itemKey);
    if (list) list.push(m);
    else index.set(m.itemKey, [m]);
  }
  return index;
};
export let markersByItemKey = buildItemLocationIndex();

/** Map locations of an item (by unique key), most useful fields only. */
export const itemLocations = (itemKey: string): Marker[] =>
  markersByItemKey.get(itemKey) ?? [];

/** One boss/enemy that drops a given item, with its real drop chance. */
export interface DropSource {
  /** Marker id of the source — click to fly the map to that boss. */
  markerId: string;
  /** Boss / miniboss display name. */
  name: string;
  /** "boss" | "miniboss" — drives the category color/glyph fallback. */
  category: string;
  /** "Guaranteed" | "N% drop" — the real ItemLotParam chance, or undefined. */
  note?: string;
  /** The exact extracted map-symbol art the marker shows (boss "Enemy" / miniboss
   * "mini-boss"), so the drop-source chip is pixel-identical to its map pin. */
  iconUrl?: string;
}

/**
 * The inverse of every combatant's `drops` list: itemKey → who drops it (+ %).
 * The drop chances are already computed at build time (ItemLotParam basePoint
 * share, stored as each drop's `note`); here we just invert boss→items into
 * item→bosses so the item detail page can answer "what drops this, and how
 * often". Only boss/miniboss markers carry a real chance — a landmark's "drops"
 * are guaranteed chest contents that already appear as their own pins under
 * "Where to find", so they're excluded here to avoid a redundant listing.
 */
const buildDropSourceIndex = (): Map<string, DropSource[]> => {
  const index = new Map<string, DropSource[]>();
  for (const m of erMarkers) {
    if (m.category !== "boss" && m.category !== "miniboss") continue;
    if (!m.drops?.length) continue;
    if (/^(Field Boss|Boss)$/.test(m.name)) continue; // generic fallback, no real name
    for (const d of m.drops) {
      if (!d.itemKey) continue;
      let list = index.get(d.itemKey);
      if (!list) index.set(d.itemKey, (list = []));
      // Many same-named boss instances drop alike (every Tree Sentinel) — the
      // first-class fact is "Tree Sentinel drops X at 5%", so list each name once.
      if (list.some((s) => s.name === m.name)) continue;
      list.push({
        markerId: m.id,
        name: m.name,
        category: m.category,
        note: d.note,
        iconUrl: markerArtUrl(m),
      });
    }
  }
  // Guaranteed first, then by drop chance descending, then name — the order a
  // player cares about when deciding where to farm.
  const weight = (s: DropSource) =>
    s.note === "Guaranteed" ? 1000 : parseInt(s.note ?? "0", 10) || 0;
  for (const list of index.values())
    list.sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name));
  return index;
};
export let dropSourcesByItemKey = buildDropSourceIndex();

/** Bosses/enemies that drop a given item (by unique key), with drop chances. */
export const itemDropSources = (itemKey: string): DropSource[] =>
  dropSourcesByItemKey.get(itemKey) ?? [];

/** A verified merchant that sells a given item. */
export interface MerchantSource {
  markerId: string;
  name: string;
  region?: string;
}

/**
 * Merchant inventory comes from the seller's own talk script joined to
 * ShopLineupParam. Landmark proximity loot and conditional bell-bearing resale
 * stock are excluded by the generated acquisition-source index.
 */
/** Verified merchants that sell a given item (by unique key). */
export const itemMerchants = (itemKey: string): MerchantSource[] =>
  itemAcquisitionSources(itemKey)
    .filter((source) => source.kind === "merchant")
    .map((source) => ({
      markerId: source.markerId,
      name: localizeErMapText(source.name),
      region: source.region ? localizeErMapText(source.region) : undefined,
    }));

/**
 * Rebuild every marker-derived index from the current (possibly localized)
 * `erMarkers`. Called by data/localized-data.ts after the language changes so the
 * "where to find" / "dropped by" / "sold by" panels show localized names too.
 */
export const rebuildMarkerIndexes = (): void => {
  markersByGame = { "elden-ring": erAllMarkers(erMarkers), nightreign: [] };
  markersByItemKey = buildItemLocationIndex();
  dropSourcesByItemKey = buildDropSourceIndex();
};
