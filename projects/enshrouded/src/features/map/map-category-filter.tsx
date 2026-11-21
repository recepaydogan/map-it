import { CheckCheck, Eye, EyeOff, Search, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapCategoryGroup from "./map-category-group";
import MapMarkerGroupFilter from "./map-marker-group-filter";
import { TRAINER_CATEGORIES, TRAINER_FILTER_IDS, trainerFilterKey } from "./map-trainer-filters";
import { MARKER_GROUPS } from "./marker-group-config";
import {
  FILTER_CATEGORY_ROWS,
  FILTER_CATEGORY_GROUPS,
  getCategoryConfig,
  MAP_CATEGORY_GROUPS,
  type MapCategoryGroupId,
  type MapFilterFocusRequest,
} from "./map-config";
import type { UserMarkerGroup } from "./types";
import type { MapFaction } from "./map-faction-filter";

interface MapCategoryFilterProps {
  filterFocusRequest?: MapFilterFocusRequest | null;
  activeCategories: string[];
  counts: Record<string, number>;
  foundCounts: Record<string, number>;
  markerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  foundMarkerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenMarkerGroups: UserMarkerGroup[];
  hiddenTrainerTypes: string[];
  hideCompleted: boolean;
  hideFavorites: boolean;
  onToggleHideCompleted: () => void;
  onToggleHideFavorites: () => void;
  onToggle: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onSetHiddenMarkerGroups: (groups: UserMarkerGroup[]) => void;
  onSetHiddenTrainerTypes: (types: string[]) => void;
  factions: readonly MapFaction[];
  onToggleFaction: (faction: MapFaction) => void;
}

/** Which group is expanded — ONE key for the whole list (accordion). */
const OPEN_GROUP_KEY = "gm:filter-rail:open-group";

const MapCategoryFilter = ({
  filterFocusRequest,
  activeCategories,
  counts,
  foundCounts,
  markerGroupCounts,
  foundMarkerGroupCounts,
  hiddenMarkerGroups,
  hiddenTrainerTypes,
  hideCompleted,
  hideFavorites,
  onToggleHideCompleted,
  onToggleHideFavorites,
  onToggle,
  onSetCategories,
  onSetHiddenMarkerGroups,
  onSetHiddenTrainerTypes,
}: MapCategoryFilterProps) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const availableCategories = FILTER_CATEGORY_ROWS
    .map((row) => {
      const ids = row.ids.filter((id) => (counts[id] ?? 0) > 0);
      const representativeId = ids.find((id) => getCategoryConfig(id).sourceReferenceIds) ?? ids[0];
      return { category: representativeId ? getCategoryConfig(representativeId) : row.category, ids };
    })
    .filter(({ ids }) => ids.length > 0);
  const availableCategoryIds = new Set(availableCategories.flatMap(({ ids }) => ids));
  const populatedMarkerGroupIds = MARKER_GROUPS.filter(({ id }) => (markerGroupCounts[id] ?? 0) > 0)
    .map(({ id }) => id);
  // Accordion: opening a group closes whichever was open. The choice survives
  // reloads — with a long list, re-opening the same group on every visit was
  // the single most repeated interaction.
  const [openGroup, setOpenGroup] = useState<MapCategoryGroupId | null>(() => {
    const stored = localStorage.getItem(OPEN_GROUP_KEY);
    const previousGroup = stored === "trade" || stored === "character" || stored === "services"
      ? "npcs" : stored === "gatherables" ? "herbs" : stored;
    if (previousGroup && (previousGroup !== "personal" || populatedMarkerGroupIds.length > 0)
      && MAP_CATEGORY_GROUPS.some(({ id }) => id === previousGroup)) return previousGroup as MapCategoryGroupId;
    return FILTER_CATEGORY_GROUPS.find(({ defaultExpanded }) => defaultExpanded)?.id ?? null;
  });
  const requestedCategoryCount = filterFocusRequest ? counts[filterFocusRequest.categoryId] ?? 0 : 0;
  useEffect(() => {
    if (!filterFocusRequest || requestedCategoryCount === 0) return;
    const groupId = getCategoryConfig(filterFocusRequest.categoryId).groupId;
    const frame = window.requestAnimationFrame(() => {
      setQuery("");
      setOpenGroup(groupId);
      localStorage.setItem(OPEN_GROUP_KEY, groupId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filterFocusRequest, requestedCategoryCount]);
  useEffect(() => {
    if (!filterFocusRequest || requestedCategoryCount === 0 || query
      || openGroup !== getCategoryConfig(filterFocusRequest.categoryId).groupId) return;
    const frame = window.requestAnimationFrame(() => {
      const row = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-map-filter-category]") ?? [])]
        .find((element) => element.dataset.mapFilterCategory === filterFocusRequest.categoryId);
      row?.scrollIntoView({ block: "center" });
      row?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filterFocusRequest, openGroup, query, requestedCategoryCount]);
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

  const activeMarkerGroupCount = populatedMarkerGroupIds.filter((id) => !hiddenMarkerGroups.includes(id)).length;
  const populatedTrainerTypes = TRAINER_CATEGORIES.flatMap((category) => TRAINER_FILTER_IDS[category]
    .map((id) => trainerFilterKey(category, id)).filter((key) => (counts[key] ?? 0) > 0));
  const allActive = activeFilterCategories.length === availableCategoryIds.size
    && activeMarkerGroupCount === populatedMarkerGroupIds.length
    && populatedTrainerTypes.every((key) => !hiddenTrainerTypes.includes(key));
  const noneActive = activeFilterCategories.length === 0 && activeMarkerGroupCount === 0;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return (
    <div ref={rootRef} className="flex flex-col" aria-label={t("map.filters.categories")}>
      <div className="grid shrink-0 grid-cols-2 gap-2 pt-3">
        <button
          type="button"
          onClick={() => {
            onSetCategories([
              ...activeCategories,
              ...[...availableCategoryIds].filter((id) => !activeCategories.includes(id)),
            ]);
            onSetHiddenMarkerGroups([]);
            onSetHiddenTrainerTypes([]);
          }}
          disabled={allActive}
          className="map-filter-action"
        >
          <Eye size={13} aria-hidden="true" />
          <span className="truncate">{t("map.filters.showAll")}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onSetCategories(activeCategories.filter((id) => !availableCategoryIds.has(id)));
            onSetHiddenMarkerGroups([...new Set([...hiddenMarkerGroups, ...populatedMarkerGroupIds])]);
          }}
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

      <MapMarkerGroupFilter
        counts={markerGroupCounts}
        foundCounts={foundMarkerGroupCounts}
        hiddenGroups={hiddenMarkerGroups}
        open={openGroup === "personal" || Boolean(normalizedQuery)}
        query={normalizedQuery}
        onToggleOpen={() => toggleGroup("personal")}
        onToggle={(id) => onSetHiddenMarkerGroups(hiddenMarkerGroups.includes(id)
          ? hiddenMarkerGroups.filter((group) => group !== id) : [...hiddenMarkerGroups, id])}
        onSetGroup={(show) => onSetHiddenMarkerGroups(show
          ? hiddenMarkerGroups.filter((id) => !populatedMarkerGroupIds.includes(id))
          : [...new Set([...hiddenMarkerGroups, ...populatedMarkerGroupIds])])}
      />

      {FILTER_CATEGORY_GROUPS.map((group) => {
        const groupCategories = availableCategories.filter(({ category }) => category.groupId === group.id);
        const groupMatches = normalizedQuery && t(group.labelKey).toLocaleLowerCase().includes(normalizedQuery);
        const visibleCategories = normalizedQuery && !groupMatches
          ? groupCategories.filter(({ category }) => t(category.filterLabelKey ?? category.labelKey).toLocaleLowerCase().includes(normalizedQuery)
            || category.subgroupLabelKey && t(category.subgroupLabelKey).toLocaleLowerCase().includes(normalizedQuery))
          : groupCategories;
        if (visibleCategories.length === 0) return null;
        return (
          <MapCategoryGroup
            key={group.id}
            group={group}
            categories={visibleCategories}
            countCategories={groupCategories}
            counts={counts}
            foundCounts={foundCounts}
            activeCategories={activeFilterCategories}
            open={openGroup === group.id || Boolean(normalizedQuery)}
            searching={Boolean(normalizedQuery)}
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
