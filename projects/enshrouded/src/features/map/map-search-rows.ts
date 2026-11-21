import { createSearchSourceContext, type SearchItemResult, type SearchLocation, type SearchSourceContext } from "./map-global-search.ts";

export const SOURCE_PREVIEW = 3;
export type MapSearchRow = { id: string; target: SearchLocation; context?: SearchSourceContext } | { id: string; itemId: string };
export const locationRowId = (location: SearchLocation) => `place-${location.mapId}-${location.point.id}`;
export const sourceRowId = (itemId: string, index: number) => `source-${itemId}-${index}`;
export const moreRowId = (itemId: string) => `more-${itemId}`;

/** Rendered rows and keyboard navigation share exactly the same source limits. */
export function buildMapSearchRows(locations: SearchLocation[], items: SearchItemResult[], sourceLocations: SearchLocation[], limits: Record<string, number>): MapSearchRow[] {
  return [
    ...locations.map(target => ({ id: locationRowId(target), target })),
    ...items.flatMap(item => {
      const limit = limits[item.id] ?? SOURCE_PREVIEW;
      const rows: MapSearchRow[] = item.sources.slice(0, limit).flatMap((source, index) => {
        const target = sourceLocations[source.location];
        return target ? [{ id: sourceRowId(item.id, index), target, context: createSearchSourceContext(item, source) }] : [];
      });
      if (item.sources.length > limit) rows.push({ id: moreRowId(item.id), itemId: item.id });
      return rows;
    }),
  ];
}
