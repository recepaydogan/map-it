import {
  bestFuzzyScore,
  bestMatchScore,
  createMapSearchQuery,
  matchScore,
  NO_MATCH,
  prepareSearchText,
  type PreparedSearchText,
} from "./map-search-match.ts";
import type { MapPoint } from "./types.ts";
import type { MapCoordinate } from "./types.ts";
import { distanceFromSearchOrigin } from "./map-search-ranking.ts";

export interface MapSearchDocument {
  point: MapPoint;
  /** Every name this point answers to, best first. */
  names: PreparedSearchText[];
  /** Weaker evidence — town, building type, room names, coordinates. A hit here
   *  is still a hit, it just can't outrank someone's actual name. */
  context: PreparedSearchText;
}

export interface MapSearchMatch {
  point: MapPoint;
  score: number;
}

/** One row per name+town rather than per building: a world can have hundreds of
 *  identical "House" entries and as individual rows they'd spend the whole
 *  result limit before anything ranked behind them got a slot. */
export interface MapSearchGroup {
  point: MapPoint;
  score: number;
  /** How many points collapsed into this row, including the one shown. */
  count: number;
}

/** Where a context-only hit sorts: behind every name hit, ahead of every typo. */
const CONTEXT_SCORE = 3;

export const createMapSearchDocument = (
  point: MapPoint,
  names: (string | undefined)[],
  context: string,
): MapSearchDocument => ({
  point,
  names: [...new Set(names.filter((name): name is string => Boolean(name)))]
    .map(prepareSearchText),
  context: prepareSearchText(context),
});

/**
 * Every point that answers `query`, best first.
 *
 * Two passes, never mixed: the strict tiers first, and typo matching only if
 * they came back empty — see map-search-match. A query with real answers is
 * never diluted by near misses, and the expensive pass runs at most once per
 * dead-end query.
 */
export const searchMapDocuments = (
  documents: MapSearchDocument[],
  rawQuery: string,
  origin: MapCoordinate | null = null,
): MapSearchMatch[] => {
  const query = createMapSearchQuery(rawQuery);
  if (query.empty) return [];

  const collect = (
    scoreNames: (values: PreparedSearchText[]) => number,
    scoreContext: (value: PreparedSearchText) => number,
  ) => {
    const matches: MapSearchMatch[] = [];
    for (const { point, names, context } of documents) {
      let score = scoreNames(names);
      if (score === NO_MATCH) {
        if (scoreContext(context) === NO_MATCH) continue;
        score = CONTEXT_SCORE;
      }
      matches.push({ point, score });
    }
    return matches;
  };

  let matches = collect(
    (values) => bestMatchScore(values, query),
    (value) => matchScore(value, query),
  );
  if (matches.length === 0) {
    // Names only on the rescue pass. A typo'd room type or building keyword is
    // not an answer anyone was reaching for, and skipping the context strings —
    // by far the longest text on a document — is most of what keeps this pass
    // off the frame budget.
    matches = collect((values) => bestFuzzyScore(values, query), () => NO_MATCH);
  }

  return matches.sort((left, right) =>
    left.score - right.score
    || distanceFromSearchOrigin(left.point, origin) - distanceFromSearchOrigin(right.point, origin)
    || left.point.name.localeCompare(right.point.name));
};

/**
 * Collapses matches that are the same ANSWER — same category, same name, same
 * town — keeping the best-scoring one as the point to fly to and counting the
 * rest. Input must already be sorted; the first survivor of a group is the one
 * shown.
 */
export const groupMapSearchMatches = (
  matches: MapSearchMatch[],
  limit: number,
): MapSearchGroup[] => {
  const groups = new Map<string, MapSearchGroup>();
  for (const { point, score } of matches) {
    const mapId = "mapId" in point ? point.mapId ?? "" : "";
    const key = `${mapId}|${point.category}|${point.region}|${point.name}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      continue;
    }
    groups.set(key, { point, score, count: 1 });
  }
  return [...groups.values()].slice(0, limit);
};
