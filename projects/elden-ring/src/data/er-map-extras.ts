import raw from "./generated/er-map-extras.json";
import type { MapLayer, Marker } from "./types";

/**
 * Two map layers the app never had, both straight from the game's params
 * (data/src/build-er-map-extras.mjs):
 *
 *  • **Summoning pools** — `SignPuddleParam`, 213 of them, named via PlaceName. Real
 *    coordinates in the same world grid every other marker uses, so they're just markers.
 *  • **Map fragments** — `WorldMapPieceParam`, the rectangle each "Map: <Region>" item
 *    actually reveals, joined to the real goods item. Drawn as an optional overlay.
 *
 * These live OUTSIDE er-markers.json on purpose: that file is the frozen, hand-verified
 * marker set, and the rule is that nothing regenerates its coordinates. Merging here at
 * import time adds a layer without ever touching it.
 */

/** A map fragment: the item, and the stretch of world it uncovers (NOMINAL pixel rect). */
export interface ErFragment {
  id: string;
  /** The real item name, e.g. "Map: Limgrave, West". */
  name: string;
  /** The game's own name for the area it opens, e.g. "Limgrave West". */
  region: string;
  layer: MapLayer;
  itemId: number;
  iconId: number;
  /** `goods:<id>` — drills straight into the item's codex page. */
  itemKey: string;
  eventFlagId: number;
  rect: { x: number; y: number; w: number; h: number };
  description?: string;
}

const data = raw as unknown as {
  patch: string;
  summonPools: Marker[];
  fragments: ErFragment[];
};

/** Every co-op summoning pool, already Marker-shaped (category "summon-pool"). */
export const erSummonPools: Marker[] = data.summonPools;

export const erFragments: ErFragment[] = data.fragments;

/** The fragments that reveal part of a given map layer. */
export const erFragmentsForLayer = (layer: MapLayer): ErFragment[] =>
  data.fragments.filter((f) => f.layer === layer);

/** "Map: Limgrave, West" → "Limgrave, West" — the on-map label needs no "Map:" prefix,
 *  the rectangle already says it's a map fragment. */
export const fragmentLabel = (f: ErFragment): string => f.name.replace(/^Map:\s*/i, "");
