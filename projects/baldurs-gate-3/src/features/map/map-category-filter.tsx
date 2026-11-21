import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MapCategoryGroup from "./map-category-group";
import {
  MAP_CATEGORIES,
  MAP_CATEGORY_GROUPS,
  type MapCategoryGroupId,
} from "./map-config";
import MapFilterQuickControls, { type MapPointStatusFilter } from "./map-filter-quick-controls";

interface MapCategoryFilterProps {
  activeCategories: string[];
  counts: Record<string, number>;
  completedCounts: Record<string, number>;
  hiddenStatuses: MapPointStatusFilter[];
  query: string;
  onToggle: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onToggleStatus: (status: MapPointStatusFilter) => void;
  onQueryChange: (query: string) => void;
}

/** Which group is expanded — ONE key for the whole list (accordion). */
const OPEN_GROUP_KEY = "gm:filter-rail:open-group";

const normalizeFilterSearch = (value: string, language: string) => value
  .toLocaleLowerCase(language)
  .normalize("NFKD")
  .replace(/\p{Diacritic}/gu, "");

const MapCategoryFilter = ({
  activeCategories,
  counts,
  completedCounts,
  hiddenStatuses,
  query,
  onToggle,
  onSetCategories,
  onToggleStatus,
  onQueryChange,
}: MapCategoryFilterProps) => {
  const { t, i18n } = useTranslation();
  const normalizedQuery = normalizeFilterSearch(query.trim(), i18n.language);
  const availableGroups = useMemo(() => MAP_CATEGORY_GROUPS.map((group) => ({
    group,
    categories: MAP_CATEGORIES.filter(({ groupId, id }) => groupId === group.id && (counts[id] ?? 0) > 0),
  })).filter(({ categories }) => categories.length > 0), [counts]);
  const populatedGroups = availableGroups.map(({ group, categories }) => {
    if (!normalizedQuery) return { group, categories };
    const groupMatches = normalizeFilterSearch(t(group.labelKey), i18n.language).includes(normalizedQuery);
    return {
      group,
      categories: groupMatches
        ? categories
        : categories.filter(({ labelKey }) =>
          normalizeFilterSearch(t(labelKey), i18n.language).includes(normalizedQuery)),
    };
  }).filter(({ categories }) => categories.length > 0);
  const availableCategoryIds = availableGroups.flatMap(({ categories }) => categories.map(({ id }) => id));
  const activeAvailableCount = availableCategoryIds.filter((id) => activeCategories.includes(id)).length;
  // Accordion: opening a group closes whichever was open. The choice survives
  // reloads — with a long list, re-opening the same group on every visit was
  // the single most repeated interaction.
  const [openGroup, setOpenGroup] = useState<MapCategoryGroupId | null>(() => {
    const storedGroup = localStorage.getItem(OPEN_GROUP_KEY);
    const stored = (storedGroup === "pickable" ? "items" : storedGroup) as MapCategoryGroupId | null;
    if (storedGroup === "pickable") localStorage.setItem(OPEN_GROUP_KEY, "items");
    if (stored && MAP_CATEGORY_GROUPS.some(({ id }) => id === stored)) return stored;
    return availableGroups.find(({ group }) => group.defaultExpanded)?.group.id ?? null;
  });

  const toggleGroup = (groupId: MapCategoryGroupId) => setOpenGroup((current) => {
    const next = current === groupId ? null : groupId;
    if (next) localStorage.setItem(OPEN_GROUP_KEY, next);
    else localStorage.removeItem(OPEN_GROUP_KEY);
    return next;
  });

  const setGroup = (categoryIds: string[], on: boolean) => onSetCategories(
    on
      ? [...activeCategories, ...categoryIds.filter((id) => !activeCategories.includes(id))]
      : activeCategories.filter((id) => !categoryIds.includes(id)),
  );

  const toggleOnly = (categoryIds: string[]) => {
    const alreadyIsolated = categoryIds.length > 0
      && activeCategories.length === categoryIds.length
      && categoryIds.every((id) => activeCategories.includes(id));
    onSetCategories(alreadyIsolated ? [] : categoryIds);
  };

  return (
    <div className="flex flex-col" aria-label={t("map.filters.categories")}>
      <MapFilterQuickControls
        query={query}
        hiddenStatuses={hiddenStatuses}
        allCategoriesVisible={availableCategoryIds.length > 0 && activeAvailableCount === availableCategoryIds.length}
        noCategoriesVisible={activeAvailableCount === 0}
        onQueryChange={onQueryChange}
        onShowAll={() => onSetCategories(availableCategoryIds)}
        onHideAll={() => onSetCategories([])}
        onToggleStatus={onToggleStatus}
      />
      {populatedGroups.map(({ group, categories }) => (
        <MapCategoryGroup
          key={group.id}
          group={group}
          categories={categories}
          counts={counts}
          completedCounts={completedCounts}
          activeCategories={activeCategories}
          open={normalizedQuery.length > 0 || openGroup === group.id}
          onToggleOpen={() => toggleGroup(group.id)}
          onToggleCategory={onToggle}
          onSetGroup={(on) => setGroup(categories.map(({ id }) => id), on)}
          onShowOnly={toggleOnly}
        />
      ))}
      {normalizedQuery && populatedGroups.length === 0 && (
        <p className="px-2 py-5 text-center text-[12px] text-zinc-300">
          {t("map.filters.noSearchResults")}
        </p>
      )}
    </div>
  );
};

export default MapCategoryFilter;
