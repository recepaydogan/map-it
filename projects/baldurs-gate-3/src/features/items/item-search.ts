import {
  bestFuzzyScore,
  bestMatchScore,
  createMapSearchQuery,
  NO_MATCH,
  prepareSearchText,
  type PreparedSearchText,
} from "../map/map-search-match.ts";
import type { ItemDatabaseEntry } from "./types.ts";

interface ItemSearchDocument {
  item: ItemDatabaseEntry;
  names: PreparedSearchText[];
}

const collapseStylizedLetters = (value: string) => value.replace(/(\p{L})\1{2,}/giu, "$1");

export const createItemSearchDocuments = (
  items: ItemDatabaseEntry[],
  locale: string,
): ItemSearchDocument[] => items.map((item) => {
  const values = [
    item.localizedNames[locale],
    item.localizedNames.en,
    item.name,
    item.subtype,
  ].filter((value): value is string => Boolean(value));
  const aliases = values.flatMap((value) => [value, collapseStylizedLetters(value)]);
  return {
    item,
    names: [...new Set(aliases)].map(prepareSearchText),
  };
});

export const searchItemDocuments = (
  documents: ItemSearchDocument[],
  rawQuery: string,
  locale: string,
): ItemDatabaseEntry[] => {
  const query = createMapSearchQuery(rawQuery);
  if (query.empty) {
    return documents.map(({ item }) => item).sort((left, right) => (
      (left.localizedNames[locale] ?? left.name).localeCompare(
        right.localizedNames[locale] ?? right.name,
        locale,
      )
    ));
  }

  const collect = (score: (names: PreparedSearchText[]) => number) => documents
    .map((document) => ({ ...document, score: score(document.names) }))
    .filter(({ score: match }) => match !== NO_MATCH);
  let matches = collect((names) => bestMatchScore(names, query));
  if (matches.length === 0) matches = collect((names) => bestFuzzyScore(names, query));

  return matches.sort((left, right) => (
    left.score - right.score
    || (left.item.localizedNames[locale] ?? left.item.name).localeCompare(
      right.item.localizedNames[locale] ?? right.item.name,
      locale,
    )
  )).map(({ item }) => item);
};
