import { CheckCheck, Eye, EyeOff, Fish, Search, Star, X } from "lucide-react";
import { setFishingLevelsVisible, useFishingLevels } from "./use-fishing-levels";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import Tooltip from "../../components/tooltip";
import MapCategoryGroup from "./map-category-group";
import MapMarkerGroupFilter from "./map-marker-group-filter";
import MapTrainerFilterGroup from "./map-trainer-filter-group";
import { FISHING_LEVEL_ZONES } from "./map-fishing-levels";
import { TRAINER_CATEGORIES, TRAINER_FILTER_IDS, trainerFilterKey, type TrainerCategory } from "./map-trainer-filters";
import { MARKER_GROUPS } from "./marker-group-config";
import {
  FILTER_CATEGORY_ROWS,
  FILTER_CATEGORY_GROUPS,
  getCategoryConfig,
  MAP_CATEGORY_GROUPS,
  ZONES_FILTER_GROUP,
  type MapFilterCategory,
  type MapFilterFocusRequest,
  type MapFilterGroupId,
} from "./map-config";
import type { UserMarkerGroup } from "./types";
import type { MapFaction } from "./map-faction-filter";

interface MapCategoryFilterProps {
  fishingLevelsAvailable?: boolean;
  filterFocusRequest?: MapFilterFocusRequest | null;
  activeCategories: string[];
  characterScopeId: string | null;
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

/** Persist independently expanded sections using the existing profile-scoped key. */
const OPEN_GROUP_KEY = "gm:filter-rail:open-group";
const EXPANDABLE_GROUPS = [...MAP_CATEGORY_GROUPS, ZONES_FILTER_GROUP];
const FILTER_GROUPS = [ZONES_FILTER_GROUP, ...FILTER_CATEGORY_GROUPS];
const FISHING_LEVELS_FILTER_ID = "fishing-levels";
const FISHING_LEVELS_ROW: MapFilterCategory = {
  category: {
    id: FISHING_LEVELS_FILTER_ID,
    labelKey: "map.fishingLevels.title",
    groupId: ZONES_FILTER_GROUP.id,
    icon: Fish,
    markerClass: "border border-zinc-500 bg-[#171717] text-sky-200",
  },
  ids: [FISHING_LEVELS_FILTER_ID],
};
const ZONE_COUNTS = { [FISHING_LEVELS_FILTER_ID]: FISHING_LEVEL_ZONES.length };

const readOpenGroups = (storageKey: string): MapFilterGroupId[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (Array.isArray(stored)) return EXPANDABLE_GROUPS
      .filter(({ id }) => stored.includes(id)).map(({ id }) => id);
  } catch { /* Previous versions stored one accordion group as plain text. */ }
  return EXPANDABLE_GROUPS.filter(({ defaultExpanded }) => defaultExpanded).map(({ id }) => id);
};

const MapCategoryFilter = ({
  fishingLevelsAvailable = false,
  filterFocusRequest,
  activeCategories,
  characterScopeId,
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
  const fishingLevelsVisible = useFishingLevels();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const availableCategories: MapFilterCategory[] = FILTER_CATEGORY_ROWS
    .map((row) => {
      const ids = row.ids.filter((id) => (counts[id] ?? 0) > 0);
      const representativeId = ids.find((id) => getCategoryConfig(id).sourceReferenceIds) ?? ids[0];
      return { category: representativeId ? getCategoryConfig(representativeId) : row.category, ids };
    })
    .filter(({ ids }) => ids.length > 0);
  if (fishingLevelsAvailable) availableCategories.push(FISHING_LEVELS_ROW);
  const availableCategoryIds = new Set(availableCategories.flatMap(({ ids }) => ids));
  const populatedMarkerGroupIds = MARKER_GROUPS.filter(({ id }) => (markerGroupCounts[id] ?? 0) > 0)
    .map(({ id }) => id);
  const openGroupStorageKey = characterScopeId ? `${OPEN_GROUP_KEY}:${characterScopeId}` : OPEN_GROUP_KEY;
  const [openGroups, setOpenGroups] = useState<MapFilterGroupId[]>(() => readOpenGroups(openGroupStorageKey));
  const requestedCategoryCount = filterFocusRequest ? counts[filterFocusRequest.categoryId] ?? 0 : 0;
  useEffect(() => {
    if (!filterFocusRequest || requestedCategoryCount === 0) return;
    const groupId = getCategoryConfig(filterFocusRequest.categoryId).groupId;
    const frame = window.requestAnimationFrame(() => {
      setQuery("");
      setOpenGroups((current) => {
        const next = current.includes(groupId) ? current : [...current, groupId];
        localStorage.setItem(openGroupStorageKey, JSON.stringify(next));
        return next;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filterFocusRequest, openGroupStorageKey, requestedCategoryCount]);
  useEffect(() => {
    if (!filterFocusRequest || requestedCategoryCount === 0 || query
      || !openGroups.includes(getCategoryConfig(filterFocusRequest.categoryId).groupId)) return;
    const frame = window.requestAnimationFrame(() => {
      const row = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-map-filter-category]") ?? [])]
        .find((element) => element.dataset.mapFilterCategory === filterFocusRequest.categoryId);
      row?.scrollIntoView({ block: "center" });
      row?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [filterFocusRequest, openGroups, query, requestedCategoryCount]);
  const selectedCategories = fishingLevelsAvailable && fishingLevelsVisible
    ? [...activeCategories, FISHING_LEVELS_FILTER_ID] : activeCategories;
  const activeFilterCategories = selectedCategories.filter((id) => availableCategoryIds.has(id));

  const toggleGroup = (groupId: MapFilterGroupId) => setOpenGroups((current) => {
    const next = current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId];
    localStorage.setItem(openGroupStorageKey, JSON.stringify(next));
    return next;
  });

  const setFilterCategories = (ids: string[]) => {
    const markerIds = ids.filter((id) => id !== FISHING_LEVELS_FILTER_ID);
    if (markerIds.length !== activeCategories.length || markerIds.some((id, index) => id !== activeCategories[index])) {
      onSetCategories(markerIds);
    }
    if (fishingLevelsAvailable) {
      const showFishing = ids.includes(FISHING_LEVELS_FILTER_ID);
      if (showFishing !== fishingLevelsVisible) setFishingLevelsVisible(showFishing);
    }
  };

  const setGroup = (categoryIds: string[], on: boolean) => setFilterCategories(
    on
      ? [...selectedCategories, ...categoryIds.filter((id) => !selectedCategories.includes(id))]
      : selectedCategories.filter((id) => !categoryIds.includes(id)),
  );

  const toggleOnly = (categoryIds: string[]) => {
    const alreadyIsolated = categoryIds.length > 0
      && activeFilterCategories.length === categoryIds.length
      && categoryIds.every((id) => selectedCategories.includes(id));
    const otherCategories = selectedCategories.filter((id) => !availableCategoryIds.has(id));
    setFilterCategories([...otherCategories, ...(alreadyIsolated ? [] : categoryIds)]);
  };

  const activeMarkerGroupCount = populatedMarkerGroupIds.filter((id) => !hiddenMarkerGroups.includes(id)).length;
  const populatedTrainerTypes = TRAINER_CATEGORIES.flatMap((category) => TRAINER_FILTER_IDS[category]
    .map((id) => trainerFilterKey(category, id)).filter((key) => (counts[key] ?? 0) > 0));
  const showAllCategoryIds = [...availableCategoryIds].filter((id) => id !== FISHING_LEVELS_FILTER_ID);
  const allActive = showAllCategoryIds.every((id) => activeCategories.includes(id))
    && activeMarkerGroupCount === populatedMarkerGroupIds.length
    && populatedTrainerTypes.every((key) => !hiddenTrainerTypes.includes(key));
  const noneActive = activeFilterCategories.length === 0 && activeMarkerGroupCount === 0;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return (
    <div ref={rootRef} className="map-filter-sections flex flex-col" aria-label={t("map.filters.categories")}>
      <div className="grid shrink-0 grid-cols-2 gap-2 pt-3">
        <Tooltip label={t("map.filters.showAll")} wrap align="start" className="min-w-0 w-full">
          <button
            type="button"
            onClick={() => {
              setGroup(showAllCategoryIds, true);
              onSetHiddenMarkerGroups([]);
              onSetHiddenTrainerTypes([]);
            }}
            disabled={allActive}
            className="map-filter-action w-full"
          >
            <Eye size={13} aria-hidden="true" />
            <span className="truncate">{t("map.filters.showAll")}</span>
          </button>
        </Tooltip>
        <Tooltip label={t("map.filters.hideAll")} wrap align="end" className="min-w-0 w-full">
          <button
            type="button"
            onClick={() => {
              setGroup([...availableCategoryIds], false);
              onSetHiddenMarkerGroups([...new Set([...hiddenMarkerGroups, ...populatedMarkerGroupIds])]);
            }}
            disabled={noneActive}
            className="map-filter-action w-full"
          >
            <EyeOff size={13} aria-hidden="true" />
            <span className="truncate">{t("map.filters.hideAll")}</span>
          </button>
        </Tooltip>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 pt-2">
        <Tooltip label={t("map.filters.hideCompleted")} wrap align="start" className="min-w-0 w-full">
          <button
            type="button"
            onClick={onToggleHideCompleted}
            aria-pressed={hideCompleted}
            className={cn("map-filter-action w-full", hideCompleted && "map-filter-action-active")}
          >
            <CheckCheck size={13} aria-hidden="true" />
            <span className="truncate">{t("map.filters.hideCompleted")}</span>
          </button>
        </Tooltip>
        <Tooltip label={t("map.filters.hideFavorites")} wrap align="end" className="min-w-0 w-full">
          <button
            type="button"
            onClick={onToggleHideFavorites}
            aria-pressed={hideFavorites}
            className={cn("map-filter-action w-full", hideFavorites && "map-filter-action-active")}
          >
            <Star size={13} aria-hidden="true" />
            <span className="truncate">{t("map.filters.hideFavorites")}</span>
          </button>
        </Tooltip>
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
        open={openGroups.includes("personal") || Boolean(normalizedQuery)}
        query={normalizedQuery}
        onToggleOpen={() => toggleGroup("personal")}
        onToggle={(id) => onSetHiddenMarkerGroups(hiddenMarkerGroups.includes(id)
          ? hiddenMarkerGroups.filter((group) => group !== id) : [...hiddenMarkerGroups, id])}
        onSetGroup={(show) => onSetHiddenMarkerGroups(show
          ? hiddenMarkerGroups.filter((id) => !populatedMarkerGroupIds.includes(id))
          : [...new Set([...hiddenMarkerGroups, ...populatedMarkerGroupIds])])}
      />

      {FILTER_GROUPS.map((group) => {
        if (group.id === "class-trainers" || group.id === "profession-trainers") {
          const category: TrainerCategory = group.id === "class-trainers" ? "class-trainer" : "profession-trainer";
          const keys = TRAINER_FILTER_IDS[category].map((id) => trainerFilterKey(category, id));
          return <MapTrainerFilterGroup key={group.id} group={group} category={category}
            counts={counts} foundCounts={foundCounts} active={activeCategories.includes(category)}
            onlyCategoryActive={activeFilterCategories.length === 1}
            hiddenTypes={hiddenTrainerTypes} open={openGroups.includes(group.id) || Boolean(normalizedQuery)}
            query={normalizedQuery} onToggleOpen={() => toggleGroup(group.id)}
            onSetGroup={(show) => {
              setGroup([category], show);
              if (show) onSetHiddenTrainerTypes(hiddenTrainerTypes.filter((key) => !keys.includes(key)));
            }}
            onToggleType={(key) => {
              if (!activeCategories.includes(category)) {
                setGroup([category], true);
                onSetHiddenTrainerTypes([
                  ...hiddenTrainerTypes.filter((id) => !keys.includes(id)),
                  ...keys.filter((id) => id !== key),
                ]);
              } else {
                onSetHiddenTrainerTypes(hiddenTrainerTypes.includes(key)
                  ? hiddenTrainerTypes.filter((id) => id !== key) : [...hiddenTrainerTypes, key]);
              }
            }}
            onShowOnlyType={(key) => {
              const isolated = activeFilterCategories.length === 1 && activeCategories.includes(category)
                && !hiddenTrainerTypes.includes(key)
                && keys.filter((id) => (counts[id] ?? 0) > 0)
                  .every((id) => id === key || hiddenTrainerTypes.includes(id));
              if (isolated) {
                setGroup([category], false);
                return;
              }
              setFilterCategories([...activeCategories.filter((id) => !availableCategoryIds.has(id)), category]);
              onSetHiddenTrainerTypes([
                ...hiddenTrainerTypes.filter((id) => !keys.includes(id)),
                ...keys.filter((id) => id !== key),
              ]);
            }} />;
        }
        const groupCategories = availableCategories.filter(({ category }) => category.groupId === group.id);
        const groupMatches = normalizedQuery && t(group.labelKey).toLocaleLowerCase().includes(normalizedQuery);
        const visibleCategories = normalizedQuery && !groupMatches
          ? groupCategories.filter(({ category }) => t(category.filterLabelKey ?? category.labelKey).toLocaleLowerCase().includes(normalizedQuery))
          : groupCategories;
        if (visibleCategories.length === 0) return null;
        return (
          <MapCategoryGroup
            key={group.id}
            group={group}
            categories={visibleCategories}
            countCategories={groupCategories}
            counts={group.id === ZONES_FILTER_GROUP.id ? ZONE_COUNTS : counts}
            foundCounts={foundCounts}
            trackFound={group.id !== ZONES_FILTER_GROUP.id}
            activeCategories={activeFilterCategories}
            open={openGroups.includes(group.id) || Boolean(normalizedQuery)}
            onToggleOpen={() => toggleGroup(group.id)}
            onToggleCategory={(ids) => {
              if (ids.length === 1 && ids[0] !== FISHING_LEVELS_FILTER_ID) onToggle(ids[0]!);
              else setGroup(ids, !ids.every((id) => selectedCategories.includes(id)));
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
