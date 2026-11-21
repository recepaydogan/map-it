import type { MapSearchGroup } from "./map-fuzzy-search.ts";
import { visibleMapItemSources, type MapItemSearchResult } from "./map-item-search.ts";
import type { MapPoint } from "./types.ts";

/** A selectable row. The same building can appear both as a place and under an
 *  item that spawns it, so the row — not the point — is what has an identity. */
export interface MapSearchRow {
  id: string;
  point: MapPoint;
}

export const locationRowId = (point: MapPoint) => `place-${point.id}`;
export const sourceRowId = (itemId: string, point: MapPoint) => `source-${itemId}-${point.id}`;

/**
 * Every row the player can walk to with the arrow keys, in the order they are
 * rendered. Built from the same inputs as the list itself so the keyboard walk
 * and the screen can't drift apart — including which sources are unfolded.
 */
export const buildMapSearchRows = (
  locations: MapSearchGroup[],
  items: MapItemSearchResult[],
  openItems: ReadonlySet<string>,
): MapSearchRow[] => [
  ...locations.map(({ point }) => ({ id: locationRowId(point), point })),
  ...items.flatMap((item) => visibleMapItemSources(item, openItems.has(item.id))
    .map(({ location }) => ({ id: sourceRowId(item.id, location), point: location }))),
];
