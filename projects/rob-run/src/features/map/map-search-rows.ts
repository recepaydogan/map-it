import { createSearchSourceContext, type SearchItemResult, type SearchLocation, type SearchSourceContext, type SearchQuestResult, type SearchSourceKind } from "./map-global-search.ts";

export const SOURCE_PREVIEW = 3;
export type MapSearchRow = { id: string; target: SearchLocation; context?: SearchSourceContext } | { id: string; itemId: string };
export const locationRowId = (location: SearchLocation) => `place-${location.mapId}-${location.point.id}`;
export const sourceRowId = (itemId: string, index: number) => `source-${itemId}-${index}`;
export const moreRowId = (itemId: string) => `more-${itemId}`;
export const questRowId = ({ location, quest }: SearchQuestResult) => `quest-${quest.id}-${location.mapId}-${location.point.id}`;
export function groupSearchSources(item: SearchItemResult) {
  const groups = new Map<SearchSourceKind, { source: SearchItemResult["sources"][number]; index: number }[]>();
  item.sources.forEach((source, index) => {
    const entries = groups.get(source.kind) ?? [];
    entries.push({ source, index });
    groups.set(source.kind, entries);
  });
  return [...groups].map(([kind, entries]) => ({ kind, entries, id: `${item.id}-${kind}` }));
}

/** Rendered rows and keyboard navigation share exactly the same source limits. */
export function buildMapSearchRows(locations: SearchLocation[], items: SearchItemResult[], sourceLocations: SearchLocation[], limits: Record<string, number>, quests: SearchQuestResult[] = []): MapSearchRow[] {
  return [
    ...items.flatMap(item => groupSearchSources(item).flatMap(group => {
      const limit = limits[group.id] ?? SOURCE_PREVIEW;
      const rows: MapSearchRow[] = group.entries.slice(0, limit).flatMap(({ source, index }) => {
        const target = sourceLocations[source.location];
        return target ? [{ id: sourceRowId(item.id, index), target, context: createSearchSourceContext(item, source) }] : [];
      });
      if (group.entries.length > limit) rows.push({ id: moreRowId(group.id), itemId: group.id });
      return rows;
    })),
    ...quests.map(result => ({ id: questRowId(result), target: result.location })),
    ...locations.map(target => ({ id: locationRowId(target), target })),
  ];
}
