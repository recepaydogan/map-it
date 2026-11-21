import { createMapSearchQuery, matchScore, NO_MATCH, prepareSearchText } from "../map/map-search-match.ts";

export interface StructureSearchEntry {
  id: string;
  name: string;
  items: readonly string[];
}

/** Search both place names and the items obtainable at those places. */
export const searchStructureTypes = (entries: readonly StructureSearchEntry[], rawQuery: string): string[] => {
  const query = createMapSearchQuery(rawQuery);
  if (query.empty) return [];
  return entries.filter(entry => [entry.name, entry.id, ...entry.items]
    .some(value => matchScore(prepareSearchText(value), query) !== NO_MATCH))
    .map(entry => entry.id);
};
