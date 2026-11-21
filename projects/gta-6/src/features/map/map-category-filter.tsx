import { GAME_CONFIG } from "../../game-config";
import { CheckCheck, Eye, EyeOff, Search, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapCategoryGroup from "./map-category-group";
import MapMarkerGroupFilter from "./map-marker-group-filter";
import MapTrainerFilterGroup from "./map-trainer-filter-group";
import { TRAINER_CATEGORIES, TRAINER_FILTER_IDS, trainerFilterKey, type TrainerCategory } from "./map-trainer-filters";
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
import { MAP_FACTIONS, type MapFaction } from "./map-faction-filter";
import type { MapCharacterProfile } from "./map-character-profiles";
import "./map-category-filter.css";

interface MapCategoryFilterProps {
  filterFocusRequest?: MapFilterFocusRequest | null;
  activeCategories: string[];
  characterScopeId: string | null;
  characters: MapCharacterProfile[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
  onCreateCharacter: () => void;
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

/** Keep the existing storage key so saved accordion selections can migrate. */
const OPEN_GROUP_KEY = "gta6-app:filter-rail:open-group";
const readOpenGroups = (storageKey: string, hasPersonalGroups: boolean): MapCategoryGroupId[] => {
  const stored = localStorage.getItem(storageKey);
  const validGroups = MAP_CATEGORY_GROUPS.filter(({ id }) => id !== "personal" || hasPersonalGroups);
  if (stored) {
    try {
      const groups: unknown = JSON.parse(stored);
      if (Array.isArray(groups)) return validGroups.filter(({ id }) => groups.includes(id)).map(({ id }) => id);
    } catch { /* Older builds stored a single group ID as plain text. */ }
    const previousGroup = stored === "trade" || stored === "character" || stored === "services"
      ? "npcs" : stored === "gatherables" ? "herbs" : stored;
    const group = validGroups.find(({ id }) => id === previousGroup);
    if (group) return [group.id];
  }
  const initialGroup = FILTER_CATEGORY_GROUPS.find(({ defaultExpanded }) => defaultExpanded);
  return initialGroup ? [initialGroup.id] : [];
};

const MapCategoryFilter = ({
  filterFocusRequest,
  activeCategories,
  characterScopeId,
  selectedCharacterId,
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
  factions,
  onToggleFaction,
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
  const openGroupStorageKey = characterScopeId ? `${OPEN_GROUP_KEY}:${characterScopeId}` : OPEN_GROUP_KEY;
  const [openGroups, setOpenGroups] = useState<MapCategoryGroupId[]>(() =>
    readOpenGroups(openGroupStorageKey, populatedMarkerGroupIds.length > 0));
  const requestedCategoryCount = filterFocusRequest ? counts[filterFocusRequest.categoryId] ?? 0 : 0;
  useEffect(() => {
    if (!filterFocusRequest || requestedCategoryCount === 0) return;
    const groupId = getCategoryConfig(filterFocusRequest.categoryId).groupId;
    const frame = window.requestAnimationFrame(() => {
      setQuery("");
      setOpenGroups((current) => {
        if (current.includes(groupId)) return current;
        const next = [...current, groupId];
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
  const activeFilterCategories = activeCategories.filter((id) => availableCategoryIds.has(id));

  const toggleGroup = (groupId: MapCategoryGroupId) => setOpenGroups((current) => {
    const next = current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId];
    localStorage.setItem(openGroupStorageKey, JSON.stringify(next));
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
    <div ref={rootRef} className="map-filter-sections flex flex-col" aria-label={t("map.filters.categories")}>
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

      {GAME_CONFIG.features.factionFilters && !selectedCharacterId && <fieldset className="pb-3" aria-label={t("map.filters.factions")}>
        <div className="map-faction-filter">
          {MAP_FACTIONS.map((faction) => <button key={faction} type="button"
            onClick={() => onToggleFaction(faction)}
            aria-pressed={factions.includes(faction)}
            className={cn("map-faction-option", factions.includes(faction) && "map-faction-option-active")}
          >{t(`map.foreverQuest.factions.${faction}`)}</button>)}
        </div>
      </fieldset>}

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

      {FILTER_CATEGORY_GROUPS.map((group) => {
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
              onSetCategories([...activeCategories.filter((id) => !availableCategoryIds.has(id)), category]);
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
            counts={counts}
            foundCounts={foundCounts}
            activeCategories={activeFilterCategories}
            open={openGroups.includes(group.id) || Boolean(normalizedQuery)}
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
