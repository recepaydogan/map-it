import type { StructurePoint } from "../generation/structure-viewport-stream.ts";
import type { StructureFilterState } from "./world-structure-filter-state.ts";
import { pointReference, type WorldPersonalState } from "./world-types.ts";
import type { SavedStructureOccurrence } from "./saved-structure-occurrence.ts";

export const visibleSavedStructureOccurrences = (
  occurrences: readonly Readonly<SavedStructureOccurrence>[],
  dimension: string,
  personal: Pick<WorldPersonalState, "found" | "favorites">,
  filter: Readonly<StructureFilterState>,
): readonly Readonly<SavedStructureOccurrence>[] => {
  const categories = new Set(filter.visibleCategories);
  const found = new Set(personal.found);
  const favorites = new Set(personal.favorites);
  return Object.freeze(occurrences.filter(occurrence => {
    const reference = pointReference(dimension, occurrence.id);
    return categories.has(occurrence.type)
      && (!filter.hideFound || !found.has(reference))
      && (!filter.favoritesOnly || favorites.has(reference));
  }));
};

/**
 * Saved structure starts and seed candidates remain different evidence records.
 * This predicate is presentation-only and prevents a nearby prediction from
 * obscuring stronger saved-world evidence of the same configured type.
 */
export const savedOccurrenceCoversCandidate = (
  occurrence: Readonly<SavedStructureOccurrence>,
  candidate: Readonly<Pick<StructurePoint, "type" | "x" | "z">>,
  margin = 16,
): boolean => {
  if (!Number.isFinite(margin) || margin < 0) throw new Error("Invalid saved structure display margin");
  return occurrence.type === candidate.type
    && candidate.x >= occurrence.boundingBox[0] - margin
    && candidate.x <= occurrence.boundingBox[3] + margin
    && candidate.z >= occurrence.boundingBox[2] - margin
    && candidate.z <= occurrence.boundingBox[5] + margin;
};

export const predictedStructuresWithoutSavedDuplicates = (
  candidates: readonly Readonly<StructurePoint>[],
  occurrences: readonly Readonly<SavedStructureOccurrence>[],
  margin = 16,
): readonly Readonly<StructurePoint>[] => Object.freeze(candidates.filter(candidate =>
  !occurrences.some(occurrence => savedOccurrenceCoversCandidate(occurrence, candidate, margin))));
