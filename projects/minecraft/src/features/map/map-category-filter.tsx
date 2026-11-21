import { useState } from "react";
import { useTranslation } from "react-i18next";
import MapCategoryGroup from "./map-category-group";
import {
  MAP_CATEGORIES,
  MAP_CATEGORY_GROUPS,
  type MapCategoryGroupId,
} from "./map-config";

interface MapCategoryFilterProps {
  activeCategories: string[];
  counts: Record<string, number>;
  onToggle: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
}

/** Which group is expanded — ONE key for the whole list (accordion). */
const OPEN_GROUP_KEY = "gm:filter-rail:open-group";

const MapCategoryFilter = ({
  activeCategories,
  counts,
  onToggle,
  onSetCategories,
}: MapCategoryFilterProps) => {
  const { t } = useTranslation();
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
      {MAP_CATEGORY_GROUPS.map((group) => (
        <MapCategoryGroup
          key={group.id}
          group={group}
          categories={MAP_CATEGORIES.filter(({ groupId }) => groupId === group.id)}
          counts={counts}
          activeCategories={activeCategories}
          open={openGroup === group.id}
          onToggleOpen={() => toggleGroup(group.id)}
          onToggleCategory={onToggle}
          onSetGroup={(on) => setGroup(
            MAP_CATEGORIES.filter(({ groupId }) => groupId === group.id).map(({ id }) => id),
            on,
          )}
          onShowOnly={toggleOnly}
        />
      ))}
    </div>
  );
};

export default MapCategoryFilter;
