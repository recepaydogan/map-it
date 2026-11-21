import type { MapSearchGroup } from "./map-fuzzy-search.ts";
import type { MapPoint } from "./types.ts";

/** A selectable result row. */
export interface MapSearchRow {
  id: string;
  point: MapPoint;
}

export const locationRowId = (point: MapPoint) =>
  `place-${"mapId" in point && point.mapId ? point.mapId : "current"}-${point.id}`;

/**
 * Every row the player can walk to with the arrow keys, in the order they are
 * rendered. Built from the same input as the list itself so the keyboard walk
 * and the screen can't drift apart.
 */
export const buildMapSearchRows = (
  locations: MapSearchGroup[],
  otherMapLocations: MapSearchGroup[] = [],
): MapSearchRow[] => [...locations, ...otherMapLocations]
  .map(({ point }) => ({ id: locationRowId(point), point }));
