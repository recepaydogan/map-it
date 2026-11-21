import type { StructurePoint } from "../generation/structure-viewport-stream.ts";
import { pointReference, type DimensionView, type WorldPersonalState } from "./world-types.ts";

export interface StructureFilterState {
  visibleCategories: readonly string[];
  expandedGroup: string | null;
  search: string;
  hideFound: boolean;
  favoritesOnly: boolean;
  registryRevision?: number;
}

export interface StructureCategoryMigration {
  revision: number;
  added: readonly string[];
}

export const readStructureFilter = (view: DimensionView | undefined, categoryIds: readonly string[], groupIds: readonly string[] = [],
  registryRevision = 0, migrations: readonly StructureCategoryMigration[] = []): StructureFilterState => {
  const known = new Set(categoryIds);
  const saved = view?.visibleCategories;
  const savedRevision = view?.structureFilterRevision ?? 0;
  const added = new Set(migrations.filter(item => item.revision > savedRevision && item.revision <= registryRevision)
    .flatMap(item => item.added));
  const visibleCategories = saved === null || saved === undefined ? [...categoryIds]
    : categoryIds.filter(id => known.has(id) && (saved.includes(id) || added.has(id)));
  return {
    visibleCategories,
    expandedGroup: view?.expandedGroup && (!groupIds.length || groupIds.includes(view.expandedGroup)) ? view.expandedGroup : null,
    search: (view?.filterSearch ?? "").slice(0, 512),
    hideFound: view?.hideFound ?? false,
    favoritesOnly: view?.favoritesOnly ?? false,
    registryRevision,
  };
};

export const applyStructureFilter = (view: DimensionView, state: StructureFilterState): DimensionView => ({
  ...view, visibleCategories: [...state.visibleCategories], expandedGroup: state.expandedGroup,
  filterSearch: state.search.slice(0, 512), hideFound: state.hideFound, favoritesOnly: state.favoritesOnly,
  structureFilterRevision: state.registryRevision ?? 0,
});

export const visibleStructurePoints = (points: readonly Readonly<StructurePoint>[], dimension: string,
  personal: Pick<WorldPersonalState, "found" | "favorites">, filter: StructureFilterState,
  searchTypeIds: readonly string[] | null = null) => {
  // Search temporarily replaces the panel filters without changing saved choices.
  if (searchTypeIds !== null) {
    const matches = new Set(searchTypeIds);
    return points.filter(point => matches.has(point.type));
  }
  const categories = new Set(filter.visibleCategories), found = new Set(personal.found), favorites = new Set(personal.favorites);
  return points.filter(point => {
    const reference = pointReference(dimension, point.id);
    return categories.has(point.type) && (!filter.hideFound || !found.has(reference)) && (!filter.favoritesOnly || favorites.has(reference));
  });
};

export const toggleStructureCategory = (state: StructureFilterState, id: string, categoryIds: readonly string[]): StructureFilterState => {
  if (!categoryIds.includes(id)) throw new Error("Unknown structure category");
  const active = new Set(state.visibleCategories);
  if (active.has(id)) active.delete(id); else active.add(id);
  return { ...state, visibleCategories: categoryIds.filter(key => active.has(key)) };
};
