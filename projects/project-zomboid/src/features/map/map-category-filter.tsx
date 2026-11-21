import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MapCategoryGroup from "./map-category-group";
import MapFilterActions from "./map-filter-actions";
import MapUsefulObjectsCoachmark from "./map-useful-objects-coachmark";
import {
  MAP_CATEGORIES,
  MAP_CATEGORY_GROUPS,
  PERSONAL_MARKERS_UI_ENABLED,
  type MapCategoryGroupId,
} from "./map-config";

interface MapCategoryFilterProps {
  activeCategories: string[];
  counts: Record<string, number>;
  onToggle: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  hideLooted: boolean;
  hideFavorites: boolean;
  onHideLootedChange: (hidden: boolean) => void;
  onHideFavoritesChange: (hidden: boolean) => void;
  usefulObjectsCoachmarkVisible?: boolean;
  onShowRecommendedUsefulObjects?: () => void;
  onDismissUsefulObjectsCoachmark?: () => void;
}

/** Which group is expanded — ONE key for the whole list (accordion). */
const OPEN_GROUP_KEY = "project-zomboid-map:filter-rail:open-group";

const MapCategoryFilter = ({
  activeCategories,
  counts,
  onToggle,
  onSetCategories,
  hideLooted,
  hideFavorites,
  onHideLootedChange,
  onHideFavoritesChange,
  usefulObjectsCoachmarkVisible = false,
  onShowRecommendedUsefulObjects,
  onDismissUsefulObjectsCoachmark,
}: MapCategoryFilterProps) => {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [objectsAnchor, setObjectsAnchor] = useState<HTMLDivElement | null>(null);
  // Accordion: opening a group closes whichever was open. The choice survives
  // reloads — with a long list, re-opening the same group on every visit was
  // the single most repeated interaction.
  const [openGroup, setOpenGroup] = useState<MapCategoryGroupId | null>(() => {
    const stored = localStorage.getItem(OPEN_GROUP_KEY) as MapCategoryGroupId | null;
    if (stored && MAP_CATEGORY_GROUPS.some(({ id }) => id === stored)) return stored;
    return MAP_CATEGORY_GROUPS.find(({ defaultExpanded }) => defaultExpanded)?.id ?? null;
  });

  const toggleGroup = (groupId: MapCategoryGroupId) => setOpenGroup((current) => {
    const next = current === groupId ? null : groupId;
    if (next) localStorage.setItem(OPEN_GROUP_KEY, next);
    else localStorage.removeItem(OPEN_GROUP_KEY);
    return next;
  });

  useEffect(() => {
    if (!usefulObjectsCoachmarkVisible) return undefined;
    const frame = window.requestAnimationFrame(() => {
      setQuery("");
      setOpenGroup("objects");
      localStorage.setItem(OPEN_GROUP_KEY, "objects");
      objectsAnchor?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [objectsAnchor, usefulObjectsCoachmarkVisible]);

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

  const filterableGroups = useMemo(() => MAP_CATEGORY_GROUPS.filter(
    (group) => PERSONAL_MARKERS_UI_ENABLED || group.id !== "personal",
  ), []);
  const filterableCategoryIds = useMemo(() => MAP_CATEGORIES
    .filter(({ groupId }) => filterableGroups.some(({ id }) => id === groupId))
    .map(({ id }) => id), [filterableGroups]);
  const allCategoriesVisible = filterableCategoryIds.every((id) => activeCategories.includes(id));
  const noCategoriesVisible = filterableCategoryIds.every((id) => !activeCategories.includes(id));
  const normalizedQuery = usefulObjectsCoachmarkVisible
    ? ""
    : query.trim().toLocaleLowerCase(i18n.language);
  const visibleGroups = filterableGroups.map((group) => {
    const groupMatches = t(group.labelKey).toLocaleLowerCase(i18n.language).includes(normalizedQuery);
    const categories = MAP_CATEGORIES.filter(({ groupId, labelKey }) => (
      groupId === group.id
      && (!normalizedQuery || groupMatches || t(labelKey).toLocaleLowerCase(i18n.language).includes(normalizedQuery))
    ));
    return { group, categories };
  }).filter(({ categories }) => categories.length > 0);

  const setAllVisible = (visible: boolean) => onSetCategories([
    ...activeCategories.filter((id) => !filterableCategoryIds.includes(id)),
    ...(visible ? filterableCategoryIds : []),
  ]);

  return (
    <div className="flex flex-col" aria-label={t("map.filters.categories")}>
      <MapFilterActions
        allCategoriesVisible={allCategoriesVisible}
        noCategoriesVisible={noCategoriesVisible}
        hideLooted={hideLooted}
        hideFavorites={hideFavorites}
        query={query}
        onShowAll={() => setAllVisible(true)}
        onHideAll={() => setAllVisible(false)}
        onHideLootedChange={onHideLootedChange}
        onHideFavoritesChange={onHideFavoritesChange}
        onQueryChange={setQuery}
      />
      {visibleGroups.map(({ group, categories }) => (
        <MapCategoryGroup
          key={group.id}
          group={group}
          categories={categories}
          counts={counts}
          activeCategories={activeCategories}
          rootRef={group.id === "objects" ? setObjectsAnchor : undefined}
          highlighted={group.id === "objects" && usefulObjectsCoachmarkVisible}
          open={normalizedQuery.length > 0
            || openGroup === group.id
            || (group.id === "objects" && usefulObjectsCoachmarkVisible)}
          onToggleOpen={() => toggleGroup(group.id)}
          onToggleCategory={onToggle}
          onSetGroup={(on) => setGroup(
            categories.map(({ id }) => id),
            on,
          )}
          onShowOnly={toggleOnly}
        />
      ))}
      {usefulObjectsCoachmarkVisible
        && onShowRecommendedUsefulObjects
        && onDismissUsefulObjectsCoachmark && (
        <MapUsefulObjectsCoachmark
          anchor={objectsAnchor}
          onShowRecommended={onShowRecommendedUsefulObjects}
          onDismiss={onDismissUsefulObjectsCoachmark}
        />
      )}
    </div>
  );
};

export default MapCategoryFilter;
