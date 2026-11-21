import { CheckCheck, Eye, EyeOff, Search, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import MapCategoryGroup from "./map-category-group";
import {
  FILTER_CATEGORY_ROWS,
  FILTER_CATEGORY_GROUPS,
  getCategoryConfig,
  getPetFilterCategory,
  type MapCategoryGroupId,
} from "./map-config";
import type { MapPetSource } from "./map-pet-sources";

interface MapCategoryFilterProps {
  activeCategories: string[];
  pets: MapPetSource[];
  requestedFilterGroup: { groupId: MapCategoryGroupId } | null;
  onFilterGroupOpened: (request: { groupId: MapCategoryGroupId }) => void;
  counts: Record<string, number>;
  foundCounts: Record<string, number>;
  hideCompleted: boolean;
  hideFavorites: boolean;
  onToggleHideCompleted: () => void;
  onToggleHideFavorites: () => void;
  onToggle: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
}

/** Which group is expanded — ONE key for the whole list (accordion). */
const OPEN_GROUP_KEY = "gm:filter-rail:open-group";

const MapCategoryFilter = ({
  activeCategories,
  pets,
  requestedFilterGroup,
  onFilterGroupOpened,
  counts,
  foundCounts,
  hideCompleted,
  hideFavorites,
  onToggleHideCompleted,
  onToggleHideFavorites,
  onToggle,
  onSetCategories,
}: MapCategoryFilterProps) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const [query, setQuery] = useState("");
  const filterRef = useRef<HTMLDivElement>(null);
  const availableCategories = [...FILTER_CATEGORY_ROWS, ...pets.map(getPetFilterCategory)]
    .map((row) => {
      const ids = row.ids.filter((id) => (counts[id] ?? 0) > 0);
      const representativeId = ids.find((id) => getCategoryConfig(id).sourceReferenceIds) ?? ids[0];
      return { category: representativeId && !row.label ? getCategoryConfig(representativeId) : row.category,
        ids, label: row.label ? gameText(row.label) : undefined };
    })
    .filter(({ ids }) => ids.length > 0);
  const availableCategoryIds = new Set(availableCategories.flatMap(({ ids }) => ids));
  // Accordion: opening a group closes whichever was open. The choice survives
  // reloads — with a long list, re-opening the same group on every visit was
  // the single most repeated interaction.
  const [openGroup, setOpenGroup] = useState<MapCategoryGroupId | null>(() => {
    const stored = localStorage.getItem(OPEN_GROUP_KEY) as MapCategoryGroupId | null;
    if (stored && stored !== "essentials" && FILTER_CATEGORY_GROUPS.some(({ id }) => id === stored)) return stored;
    return FILTER_CATEGORY_GROUPS.find(({ defaultExpanded }) => defaultExpanded)?.id ?? null;
  });
  const requestedGroupAvailable = availableCategories.some(({ category }) => category.groupId === requestedFilterGroup?.groupId);
  useEffect(() => {
    if (!requestedFilterGroup || !requestedGroupAvailable) return;
    localStorage.setItem(OPEN_GROUP_KEY, requestedFilterGroup.groupId);
    let scrollFrame = 0;
    const frame = requestAnimationFrame(() => {
      setQuery("");
      setOpenGroup(requestedFilterGroup.groupId);
      scrollFrame = requestAnimationFrame(() => {
        filterRef.current?.querySelector(`[data-map-filter-group="${requestedFilterGroup.groupId}"]`)
          ?.scrollIntoView({ block: "nearest" });
        onFilterGroupOpened(requestedFilterGroup);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
    };
  }, [onFilterGroupOpened, requestedFilterGroup, requestedGroupAvailable]);
  const activeFilterCategories = activeCategories.filter((id) => availableCategoryIds.has(id));

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
      && activeFilterCategories.length === categoryIds.length
      && categoryIds.every((id) => activeCategories.includes(id));
    const otherCategories = activeCategories.filter((id) => !availableCategoryIds.has(id));
    onSetCategories([...otherCategories, ...(alreadyIsolated ? [] : categoryIds)]);
  };

  const allActive = activeFilterCategories.length === availableCategoryIds.size;
  const noneActive = activeFilterCategories.length === 0;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return (
    <div ref={filterRef} className="flex flex-col" aria-label={t("map.filters.categories")}>
      <div className="grid shrink-0 grid-cols-2 gap-2 pt-3">
        <button
          type="button"
          onClick={() => onSetCategories([
            ...activeCategories,
            ...[...availableCategoryIds].filter((id) => !activeCategories.includes(id)),
          ])}
          disabled={allActive}
          className="map-filter-action"
        >
          <Eye size={13} aria-hidden="true" />
          <span className="truncate">{t("map.filters.showAll")}</span>
        </button>
        <button
          type="button"
          onClick={() => onSetCategories(activeCategories.filter((id) => !availableCategoryIds.has(id)))}
          disabled={noneActive}
          className="map-filter-action"
        >
          <EyeOff size={13} aria-hidden="true" />
          <span className="truncate">{t("map.filters.hideAll")}</span>
        </button>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 pt-2">
        <button
          type="button"
          onClick={onToggleHideCompleted}
          aria-pressed={hideCompleted}
          className={cn("map-filter-action", hideCompleted && "map-filter-action-active")}
        >
          <CheckCheck size={13} aria-hidden="true" />
          <span className="truncate">{t("map.filters.hideCompleted")}</span>
        </button>
        <button
          type="button"
          onClick={onToggleHideFavorites}
          aria-pressed={hideFavorites}
          className={cn("map-filter-action", hideFavorites && "map-filter-action-active")}
        >
          <Star size={13} aria-hidden="true" />
          <span className="truncate">{t("map.filters.hideFavorites")}</span>
        </button>
      </div>

      <div className="pb-2 pt-2">
        <div className="map-filter-search flex items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 transition-colors focus-within:border-accent">
          <Search size={14} className="shrink-0 text-zinc-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("map.filters.findCategory")}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("map.search.clear")}
              className="grid h-4 w-4 cursor-pointer place-items-center rounded-[var(--radius-full)] text-zinc-400 hover:text-white"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {FILTER_CATEGORY_GROUPS.map((group) => {
        const groupCategories = availableCategories.filter(({ category }) => category.groupId === group.id);
        const groupMatches = normalizedQuery && t(group.labelKey).toLocaleLowerCase().includes(normalizedQuery);
        const visibleCategories = normalizedQuery && !groupMatches
          ? groupCategories.filter(({ category, label }) => (label ?? t(category.filterLabelKey ?? category.labelKey)).toLocaleLowerCase().includes(normalizedQuery))
          : groupCategories;
        if (visibleCategories.length === 0) return null;
        return (
          <MapCategoryGroup
            key={group.id}
            group={group}
            categories={visibleCategories}
            counts={counts}
            foundCounts={foundCounts}
            activeCategories={activeFilterCategories}
            open={openGroup === group.id || Boolean(normalizedQuery)}
            onToggleOpen={() => toggleGroup(group.id)}
            onToggleCategory={(ids) => {
              if (ids.length === 1) onToggle(ids[0]!);
              else setGroup(ids, !ids.every((id) => activeCategories.includes(id)));
            }}
            onSetGroup={(on) => setGroup(groupCategories.flatMap(({ ids }) => ids), on)}
            onShowOnly={toggleOnly}
          />
        );
      })}
    </div>
  );
};

export default MapCategoryFilter;
