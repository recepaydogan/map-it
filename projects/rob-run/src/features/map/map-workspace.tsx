import type { ReferenceTarget } from "../reference/reference-types";
import { navigateReferenceHistory } from "../reference/reference-history";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Map as MapIcon, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { track } from "../../services/optional-usage";
import {
  recordMarkerOpened,
  type MarkerOpenSource,
} from "../../services/optional-usage";
import { reportMapPageview } from "../../state/use-analytics";
import { useLivePosition } from "../live-position/live-position-store";
import InteractiveMap, { type MapCameraFocus } from "./interactive-map";
import { DEFAULT_CATEGORY_IDS, FILTER_CATEGORIES, FOREVER_GATHERABLE_CATEGORY_IDS,
  migrateCategorySelection, type MapFilterFocusRequest } from "./map-config";
import MapDataState from "./map-data-state";
import { groupNearbySameNameLocations } from "./map-nearby-locations";
import { getMapFilterQuery } from "./map-search-filter";
import type { MapQuestGroup } from "./map-marker-overlap";
import { filterPointsForFactions, getCharacterMapFactions, isPointVisibleForFactions, MAP_FACTIONS, type MapFaction } from "./map-faction-filter";
import { getPointFilterCategories, isLinkedQuestOfferPoint } from "./map-quest-filter";
import { createMapSearchDocument, groupMapSearchMatches } from "./map-fuzzy-search";
import { useLocalMapSearch } from "./use-local-map-search";
import { createSearchTextPreparer } from "./map-search-match";
import MapPrimaryControls from "./map-primary-controls";
import MapCharacterModal from "./map-character-modal";
import { useCharacterSync } from "../character-sync/character-sync-store";
import { getCharacterQuestGivers, mergeTrackedQuestPoints } from "./character-quest-navigation";
import { useMapCharacterProfiles, type MapCharacterProfile } from "./map-character-profiles";
import { useCharacterMapFilter } from "./use-character-map-filter";
import { MAP_DEFINITIONS, hasMapDefinition } from "./map-registry";
import MapSearchOverlay from "./map-search-overlay";
import MapSidebar, { type MapSidebarMode } from "./map-sidebar";
import { MAP_FOCUS_REQUEST_KEY, requestMapDestinationInMain, requestMapPointInMain } from "./map-window-bridge";
import { createMapOverviewFocusPoint, createMapRegionFocusPoint, resolveMapFocusPoint, type MapFocusRequest } from "./map-focus-request";
import OverlayPointCard from "./overlay-point-card";
import { isUserMapMarker, type MapMarkerTarget, type MapPoint, type UserMapMarker, type UserMarkerGroup } from "./types";
import { useMapData } from "./use-map-data";
import { saveMapReferencePoint, useMapReferencePoint } from "./use-map-reference-point";
import { useSavedMapState } from "./use-saved-map-state";
import { useSelectedMap } from "./use-selected-map";
import { getMapCompanionSources } from "./map-companion-sources";
import { DEFAULT_MARKER_GROUP, MARKER_GROUPS } from "./marker-group-config";
import { getTrainerFilterCategory, getTrainerFilterKey, resolveHiddenTrainerTypes } from "./map-trainer-filters";
import { planGatheringRoute } from "./map-gathering-route";
import { bookLocationGroup, completeBookLocationIds } from "./library-book-found";
import { dungeonFloorId, dungeonFloorLabel, dungeonMaps } from "./dungeon-maps";
import MapSelectDropdown from "./map-select-dropdown";
import { useDungeonName } from "../reference/use-dungeon-name";
import { useGameText } from "../../i18n/game-text";

/** Typing pause after which a search is reported once, not per keystroke. */
const SEARCH_REPORT_DELAY_MS = 900;
/** Place rows the search dropdown shows. */
const LOCATION_RESULT_LIMIT = 8;
/** Same-name enemy spawn points inside this share of the map merge into one marker. */
const NEARBY_ENEMY_RADIUS_RATIO = 1 / 320;
const DRAFT_MARKER_PREFIX = "draft-custom-";
const isDraftMarker = (point: MapPoint | null): point is UserMapMarker =>
  point !== null && isUserMapMarker(point) && point.id.startsWith(DRAFT_MARKER_PREFIX);

const CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:v3:";
const PREVIOUS_CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:v2:";
const LEGACY_CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:";
const SIDEBAR_STORAGE_KEY = "gm:sidebar-open";
const HIDE_COMPLETED_STORAGE_KEY = "gm:hide-completed-locations";
const HIDE_FAVORITES_STORAGE_KEY = "gm:hide-favorite-locations";
// Keep the existing key so saved choices survive the move to a global filter.
const FACTIONS_STORAGE_KEY = "gm:quest-factions";
const HIDDEN_MARKER_GROUPS_STORAGE_KEY_PREFIX = "gm:hidden-marker-groups:";
const HIDDEN_TRAINER_TYPES_STORAGE_KEY_PREFIX = "gm:hidden-trainer-types:";
const RAID_CATEGORY_MIGRATION_KEY_PREFIX = "gm:raid-category-migrated:";
const QUEST_NPC_CATEGORY_MIGRATION_KEY_PREFIX = "gm:quest-npc-category-migrated:";
const DUNGEON_QUEST_CATEGORY_MIGRATION_KEY_PREFIX = "gm:dungeon-quest-category-migrated:";
const GATHERABLE_CATEGORY_MIGRATION_KEY_PREFIX = "gm:named-gatherable-category-migrated:";
const scopedFilterKey = (scopeId: string | null, kind: string, mapId?: string) =>
  scopeId ? `gm:character-filters:v1:${scopeId}:${kind}${mapId ? `:${mapId}` : ""}` : null;
const categoryStorageKey = (mapId: string, scopeId: string | null = null) =>
  scopedFilterKey(scopeId, "categories", mapId) ?? `${CATEGORY_STORAGE_KEY_PREFIX}${mapId}`;
const hiddenMarkerGroupsStorageKey = (mapId: string, scopeId: string | null = null) =>
  scopedFilterKey(scopeId, "marker-groups", mapId) ?? `${HIDDEN_MARKER_GROUPS_STORAGE_KEY_PREFIX}${mapId}`;
const hiddenTrainerTypesStorageKey = (mapId: string, scopeId: string | null = null) =>
  scopedFilterKey(scopeId, "trainer-types", mapId) ?? `${HIDDEN_TRAINER_TYPES_STORAGE_KEY_PREFIX}${mapId}`;
const factionsStorageKey = (scopeId: string | null) => scopedFilterKey(scopeId, "factions") ?? FACTIONS_STORAGE_KEY;
const hideCompletedStorageKey = (scopeId: string | null) => scopedFilterKey(scopeId, "hide-completed") ?? HIDE_COMPLETED_STORAGE_KEY;
const hideFavoritesStorageKey = (scopeId: string | null) => scopedFilterKey(scopeId, "hide-favorites") ?? HIDE_FAVORITES_STORAGE_KEY;
const readScopedFlag = (storageKey: (scopeId: string | null) => string, scopeId: string | null) => {
  const stored = localStorage.getItem(storageKey(scopeId));
  return (scopeId && stored === null ? localStorage.getItem(storageKey(null)) : stored) === "true";
};
const raidCategoryMigrationKey = (mapId: string) => `${RAID_CATEGORY_MIGRATION_KEY_PREFIX}${mapId}`;
const questNpcCategoryMigrationKey = (mapId: string) => `${QUEST_NPC_CATEGORY_MIGRATION_KEY_PREFIX}${mapId}`;
const dungeonQuestCategoryMigrationKey = (mapId: string) => `${DUNGEON_QUEST_CATEGORY_MIGRATION_KEY_PREFIX}${mapId}`;
const gatherableCategoryMigrationKey = (mapId: string) => `${GATHERABLE_CATEGORY_MIGRATION_KEY_PREFIX}${mapId}`;
const writeCategories = (mapId: string, categories: string[], scopeId: string | null = null) => {
  localStorage.setItem(categoryStorageKey(mapId, scopeId), JSON.stringify(categories));
  if (!scopeId) localStorage.setItem(raidCategoryMigrationKey(mapId), "true");
};
const migrateRaidCategory = (mapId: string, categories: string[]) => {
  const validCategories = migrateCategorySelection(categories);
  if (localStorage.getItem(raidCategoryMigrationKey(mapId))) return validCategories;
  const migrated = validCategories.includes("dungeon") && !validCategories.includes("raid")
    ? [...validCategories, "raid"] : validCategories;
  writeCategories(mapId, migrated);
  return migrated;
};
const migrateQuestNpcCategory = (mapId: string, categories: string[]) => {
  if (localStorage.getItem(questNpcCategoryMigrationKey(mapId))) return categories;
  const migrated = categories.includes("npc") ? categories : [...categories, "npc"];
  writeCategories(mapId, migrated);
  localStorage.setItem(questNpcCategoryMigrationKey(mapId), "true");
  return migrated;
};
const migrateDungeonQuestCategory = (mapId: string, categories: string[]) => {
  if (mapId !== "azeroth" || localStorage.getItem(dungeonQuestCategoryMigrationKey(mapId))) return categories;
  const migrated = categories.includes("quest") && !categories.includes("dungeon-quest")
    ? [...categories, "dungeon-quest"] : categories;
  writeCategories(mapId, migrated);
  localStorage.setItem(dungeonQuestCategoryMigrationKey(mapId), "true");
  return migrated;
};
const migrateGatherableCategories = (mapId: string, categories: string[]) => {
  if (mapId !== "azeroth" || localStorage.getItem(gatherableCategoryMigrationKey(mapId))) return categories;
  const oldNamed: Record<string, string> = {
    "gatherable-wilted-peacebloom": "gatherable-herb-wilted-peacebloom",
    "gatherable-stunted-silverleaf": "gatherable-herb-stunted-silverleaf",
    "gatherable-chunk-of-amber": "gatherable-ore-chunk-of-amber",
    "gatherable-large-chunk-of-amber": "gatherable-ore-large-chunk-of-amber",
    "gatherable-poor-copper-vein": "gatherable-ore-poor-copper-vein",
  };
  const migrated = [...new Set([
    ...categories,
    ...FOREVER_GATHERABLE_CATEGORY_IDS.filter((id) =>
      (id.startsWith("gatherable-herb-") && categories.includes("gatherable-herb"))
      || (id.startsWith("gatherable-ore-") && categories.includes("gatherable-ore"))),
    ...categories.map((id) => oldNamed[id]).filter((id): id is string => !!id),
  ])];
  writeCategories(mapId, migrated);
  localStorage.setItem(gatherableCategoryMigrationKey(mapId), "true");
  return migrated;
};
const readHiddenMarkerGroups = (mapId: string, scopeId: string | null = null): UserMarkerGroup[] => {
  try {
    const stored = localStorage.getItem(hiddenMarkerGroupsStorageKey(mapId, scopeId));
    if (scopeId && stored === null) return readHiddenMarkerGroups(mapId);
    const parsed: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(parsed) ? MARKER_GROUPS.map(({ id }) => id).filter((id) => parsed.includes(id)) : [];
  } catch {
    return [];
  }
};

const readStoredTrainerTypes = (mapId: string, scopeId: string | null = null): string | null => {
  try {
    return localStorage.getItem(hiddenTrainerTypesStorageKey(mapId, scopeId));
  } catch {
    return null;
  }
};

const readFactions = (scopeId: string | null = null, characterFaction?: "alliance" | "horde"): MapFaction[] => {
  try {
    const stored = localStorage.getItem(factionsStorageKey(scopeId));
    if (scopeId && stored === null && characterFaction) return characterFaction === "alliance"
      ? ["Alliance", "Neutral"] : ["Horde", "Neutral"];
    if (stored === null) return [...MAP_FACTIONS];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [...MAP_FACTIONS];
    const selected = MAP_FACTIONS.filter((faction) => parsed.includes(faction));
    return selected.length || parsed.length === 0 ? selected : [...MAP_FACTIONS];
  } catch {
    return [...MAP_FACTIONS];
  }
};

const readStoredCategories = (mapId: string, scopeId: string | null = null): string[] | null => {
  try {
    const stored = localStorage.getItem(categoryStorageKey(mapId, scopeId));
    if (scopeId) {
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) return migrateCategorySelection(parsed);
      }
      return readStoredCategories(mapId);
    }
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        return migrateGatherableCategories(mapId,
          migrateDungeonQuestCategory(mapId, migrateQuestNpcCategory(mapId, migrateRaidCategory(mapId, parsed))))
          .filter((id) => id !== "quest" && id !== "quest-area" && id !== "point-of-interest");
      }
    }
    const previous = localStorage.getItem(`${PREVIOUS_CATEGORY_STORAGE_KEY_PREFIX}${mapId}`);
    if (previous) {
      const parsed = JSON.parse(previous) as unknown;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
        const migrated = [...new Set([...parsed, "enemy", "merchant"])];
        return migrateGatherableCategories(mapId,
          migrateDungeonQuestCategory(mapId, migrateQuestNpcCategory(mapId, migrateRaidCategory(mapId, migrated))))
          .filter((id) => id !== "quest" && id !== "quest-area" && id !== "point-of-interest");
      }
    }
    const legacy = localStorage.getItem(`${LEGACY_CATEGORY_STORAGE_KEY_PREFIX}${mapId}`);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) return null;
    const migrated = [...new Set([...parsed, "boss", "enemy", "merchant"])];
    return migrateGatherableCategories(mapId,
      migrateDungeonQuestCategory(mapId, migrateQuestNpcCategory(mapId, migrateRaidCategory(mapId, migrated))))
      .filter((id) => id !== "quest" && id !== "quest-area" && id !== "point-of-interest");
  } catch {
    return null;
  }
};

interface MapWorkspaceProps {
  active?: boolean;
  filterFocusRequest?: MapFilterFocusRequest | null;
  mapPickerOpen?: boolean;
  onMapPickerOpenChange?: (open: boolean) => void;
  onSelectedMarkerChange?: (marker: MapMarkerTarget | null) => void;
  onReturnToPanel?: () => void;
  returnDestination?: { mapId: string; pointId: string };
  compactSidebar?: boolean;
  controlsIntroVisible?: boolean;
  controlsExpanded?: boolean;
  showOnboardingFilters?: boolean;
  onControlsExpandedChange?: (expanded: boolean) => void;
  followLivePosition?: boolean;
  onToggleFollowLivePosition?: () => void;
  fullscreenControl?: ReactNode;
  /** The in-game minimap: no sidebar, no search, a card instead of details. */
  minimapMode?: boolean;
  overlayMode?: boolean;
}

/**
 * The map screen: owns which map is showing, what is filtered and selected,
 * and the one rule every floating panel obeys — only one of them is open at a
 * time (Menu, Saved, a point's details). Everything the map draws is derived
 * here and handed down as props.
 */
const MapWorkspace = ({
  active = true,
  filterFocusRequest = null,
  mapPickerOpen,
  onMapPickerOpenChange,
  onSelectedMarkerChange,
  onReturnToPanel,
  returnDestination,
  compactSidebar = false,
  controlsIntroVisible = false,
  controlsExpanded = true,
  showOnboardingFilters = false,
  onControlsExpandedChange,
  followLivePosition = false,
  onToggleFollowLivePosition,
  fullscreenControl,
  minimapMode = false,
  overlayMode = false,
}: MapWorkspaceProps) => {
  const { t, i18n } = useTranslation();
  const dungeonName = useDungeonName();
  const gameText = useGameText();
  const { definition: desktopMap, select: selectMap } = useSelectedMap();
  const selectedMap = desktopMap;
  const dungeon = "dungeon" in selectedMap ? selectedMap.dungeon : undefined;
  const mapOptions = useMemo(() => [
    ...MAP_DEFINITIONS.map(({ id, name, nameKey }) => ({ id, name: nameKey ? t(nameKey) : name })),
    ...dungeonMaps.map(({ id, name }) => ({ id: dungeonFloorId(id, 0), name: dungeonName(name) })),
  ], [dungeonName, t]);
  const { data, error, loading: mapDataLoading } = useMapData(selectedMap);
  const characterProfiles = useMapCharacterProfiles();
  const characterSync = useCharacterSync();
  const questCharacter = characterSync.characters[characterProfiles.selectedId ?? characterSync.currentId ?? ""];
  const trackedQuestPoints = useMemo(() => minimapMode ? [] : getCharacterQuestGivers(data?.locations ?? [],
    questCharacter?.quests?.active.map(quest => quest.id) ?? []), [data?.locations, minimapMode, questCharacter?.quests]);
  const trackedQuestMarkerIds = useMemo(() => new Set(trackedQuestPoints.map(point => point.id)), [trackedQuestPoints]);
  const characterMapFilter = useCharacterMapFilter(characterProfiles.selectedCharacter);
  const filterCharacter = characterMapFilter.filterCharacter;
  const characterScopeId = filterCharacter?.id ?? null;
  const characterFaction = filterCharacter?.faction ?? undefined;
  const [characterModal, setCharacterModal] = useState<MapCharacterProfile | "create" | null>(null);
  const saved = useSavedMapState();
  const setCompletedGroup = saved.setCompletedGroup;
  const liveFeed = useLivePosition();
  const livePosition = dungeon || (liveFeed.position?.mapId && liveFeed.position.mapId !== selectedMap.id)
    ? { position: null, status: "disconnected" as const } : liveFeed;
  const referencePoint = useMapReferencePoint();
  const [query, setQuery] = useState("");
  const [sidebarMode, setSidebarMode] = useState<MapSidebarMode>("explore");
  const [gatheringRouteSelection, setGatheringRouteSelection] = useState<{ mapId: string; ids: string[] } | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [markerSet, setMarkerSet] = useState<{ mapId: string; name: string; ids: ReadonlySet<string> }>();
  const [questGroupSelection, setQuestGroupSelection] = useState<{ mapId: string; group: MapQuestGroup } | null>(null);
  const [hiddenFlightRoutesByPoint, setHiddenFlightRoutesByPoint] = useState<Record<string, string[]>>({});
  const [selectedSource, setSelectedSource] = useState<{ mapId: string; point: MapPoint; context: MapFocusRequest["sourceContext"] } | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{ mapId: string; pointId: string; history: ReferenceTarget[] } | null>(null);
  const [returnPanel, setReturnPanel] = useState<{
    mapId: string; pointId: string; pointName: string; history: ReferenceTarget[];
    sourceContext?: MapFocusRequest["sourceContext"];
    destination: { mapId: string; pointId: string };
  } | null>(null);
  const pendingReturn = useRef<typeof returnPanel>(null);
  const [trackedInsetVisibility, setTrackedInsetVisibility] = useState<{ key: string; visible: boolean } | null>(null);
  const [focusPoint, setFocusPoint] = useState<MapCameraFocus | null>(null);
  const [visibilitySelection, setVisibilitySelection] = useState(() => ({ scopeId: characterScopeId,
    hideCompleted: readScopedFlag(hideCompletedStorageKey, characterScopeId),
    hideFavorites: readScopedFlag(hideFavoritesStorageKey, characterScopeId) }));
  const [factionSelection, setFactionSelection] = useState(() => ({ scopeId: characterScopeId,
    characterFaction, values: readFactions(characterScopeId, characterFaction) }));
  const hideCompleted = visibilitySelection.scopeId === characterScopeId ? visibilitySelection.hideCompleted
    : readScopedFlag(hideCompletedStorageKey, characterScopeId);
  const hideFavorites = visibilitySelection.scopeId === characterScopeId ? visibilitySelection.hideFavorites
    : readScopedFlag(hideFavoritesStorageKey, characterScopeId);
  // Switching profiles can leave the stored selection scoped to the previous
  // character. Keep the fallback array stable across live-position ticks too.
  const factions = useMemo(() => characterFaction
    ? getCharacterMapFactions(characterFaction)
    : factionSelection.scopeId === characterScopeId
      ? factionSelection.values : readFactions(characterScopeId, characterFaction),
  [characterFaction, characterScopeId, factionSelection]);
  const [placementMode, setPlacementMode] = useState(false);
  const [draftSource, setDraftSource] = useState<"placement" | "coordinate" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true",
  );
  const [interactionMapId, setInteractionMapId] = useState(selectedMap.id);
  if (interactionMapId !== selectedMap.id) {
    setInteractionMapId(selectedMap.id);
    setQuery("");
    setSelectedPoint(null);
    setSelectedDetail(null);
    setSelectedSource(null);
    setQuestGroupSelection(null);
    setFocusPoint(null);
    setPlacementMode(false);
    setDraftSource(null);
  }
  const handledFilterRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!active || minimapMode || !filterFocusRequest
      || handledFilterRequest.current === filterFocusRequest.requestId) return;
    handledFilterRequest.current = filterFocusRequest.requestId;
    setSelectedPoint(null);
    setSelectedDetail(null);
    setSelectedSource(null);
    setQuestGroupSelection(null);
    setPlacementMode(false);
    setSidebarMode("explore");
    setSidebarOpen(true);
  }, [active, filterFocusRequest, minimapMode]);
  const [categorySelection, setCategorySelection] = useState(() => {
    const stored = readStoredCategories(selectedMap.id, characterScopeId);
    return { mapId: selectedMap.id, scopeId: characterScopeId, categories: stored ?? [], resolved: stored !== null };
  });
  const [markerGroupSelection, setMarkerGroupSelection] = useState(() => ({
    mapId: selectedMap.id, scopeId: characterScopeId,
    hiddenGroups: readHiddenMarkerGroups(selectedMap.id, characterScopeId),
  }));
  const [trainerTypeSelection, setTrainerTypeSelection] = useState(() => ({
    mapId: selectedMap.id, scopeId: characterScopeId,
    stored: readStoredTrainerTypes(selectedMap.id, characterScopeId),
  }));
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === categoryStorageKey(selectedMap.id, characterScopeId) || event.key === null) {
        const categories = readStoredCategories(selectedMap.id, characterScopeId);
        setCategorySelection({ mapId: selectedMap.id, scopeId: characterScopeId,
          categories: categories ?? [], resolved: categories !== null });
      }
      if (event.key === factionsStorageKey(characterScopeId) || event.key === null) {
        setFactionSelection({ scopeId: characterScopeId, characterFaction,
          values: readFactions(characterScopeId, characterFaction) });
      }
      if (event.key === hideCompletedStorageKey(characterScopeId)
        || event.key === hideFavoritesStorageKey(characterScopeId) || event.key === null) {
        setVisibilitySelection({ scopeId: characterScopeId,
          hideCompleted: readScopedFlag(hideCompletedStorageKey, characterScopeId),
          hideFavorites: readScopedFlag(hideFavoritesStorageKey, characterScopeId) });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [selectedMap.id, characterScopeId, characterFaction]);

  const mapId = data?.id ?? selectedMap.id;
  const questGroup = questGroupSelection?.mapId === mapId ? questGroupSelection.group : null;
  useEffect(() => {
    onSelectedMarkerChange?.(selectedPoint && !isDraftMarker(selectedPoint)
      ? { mapId, markerId: selectedPoint.id, name: selectedPoint.name } : null);
  }, [mapId, onSelectedMarkerChange, selectedPoint]);

  const selectedReferenceHistory = selectedDetail?.mapId === mapId && selectedDetail.pointId === selectedPoint?.id
    ? selectedDetail.history
    : [];
  const currentMapMarkers = useMemo(
    () => saved.markers.filter((marker) => marker.mapId === mapId),
    [mapId, saved.markers],
  );
  const markerGroupCounts = useMemo(() => currentMapMarkers.reduce<Partial<Record<UserMarkerGroup, number>>>(
    (counts, marker) => {
      const group = marker.group ?? DEFAULT_MARKER_GROUP;
      counts[group] = (counts[group] ?? 0) + 1;
      return counts;
    }, {}), [currentMapMarkers]);
  const hiddenMarkerGroups = useMemo(() => markerGroupSelection.mapId === mapId
    && markerGroupSelection.scopeId === characterScopeId
    ? markerGroupSelection.hiddenGroups : readHiddenMarkerGroups(mapId, characterScopeId),
  [characterScopeId, mapId, markerGroupSelection]);
  const hiddenTrainerTypes = useMemo(() => resolveHiddenTrainerTypes(trainerTypeSelection.mapId === mapId
    && trainerTypeSelection.scopeId === characterScopeId
    ? trainerTypeSelection.stored : readStoredTrainerTypes(mapId, characterScopeId), filterCharacter),
  [characterScopeId, filterCharacter, mapId, trainerTypeSelection]);
  useEffect(() => {
    const storageKey = hiddenMarkerGroupsStorageKey(mapId, characterScopeId);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        setMarkerGroupSelection({ mapId, scopeId: characterScopeId, hiddenGroups: readHiddenMarkerGroups(mapId, characterScopeId) });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mapId, characterScopeId]);
  useEffect(() => {
    const storageKey = hiddenTrainerTypesStorageKey(mapId, characterScopeId);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        setTrainerTypeSelection({ mapId, scopeId: characterScopeId, stored: readStoredTrainerTypes(mapId, characterScopeId) });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mapId, characterScopeId]);

  const sourcePoints = useMemo(
    () => [...(data?.locations ?? []).filter((point) => !isLinkedQuestOfferPoint(point)), ...currentMapMarkers],
    [currentMapMarkers, data?.locations],
  );
  const allPoints = useMemo(() => filterPointsForFactions(sourcePoints, factions, data?.locations),
    [sourcePoints, factions, data?.locations]);
  const completedIds = useMemo(() => completeBookLocationIds(sourcePoints, saved.completedIds),
    [saved.completedIds, sourcePoints]);

  // Carry forward progress made in the short-lived separate book panel.
  useEffect(() => {
    if (data?.id !== "azeroth" || localStorage.getItem("gm:library-books-found-migrated:v1")) return;
    let old: Record<string, string> = {};
    try { old = JSON.parse(localStorage.getItem("gm:library-books:v1") ?? "{}"); } catch { /* Ignore malformed old progress. */ }
    const ids = sourcePoints.filter((point) => "bookId" in point && point.bookId
      && ["collected", "turned-in"].includes(old[point.bookId])).map((point) => point.id);
    if (ids.length) setCompletedGroup(ids, true);
    localStorage.setItem("gm:library-books-found-migrated:v1", "true");
  }, [data?.id, setCompletedGroup, sourcePoints]);

  const categoryCounts = useMemo(() => {
    const countedBooks = new Set<string>();
    return allPoints.reduce<Record<string, number>>((counts, point) => {
      if ("bookId" in point && point.bookId) {
        if (countedBooks.has(point.bookId)) return counts;
        countedBooks.add(point.bookId);
      }
      for (const category of getPointFilterCategories(point)) {
        const filterCategory = getTrainerFilterCategory(point) ?? category;
        counts[filterCategory] = (counts[filterCategory] ?? 0) + 1;
      }
      const trainerKey = getTrainerFilterKey(point);
      if (trainerKey) counts[trainerKey] = (counts[trainerKey] ?? 0) + 1;
      return counts;
    }, {});
  }, [allPoints]);

  const { foundCategoryCounts, foundMarkerGroupCounts } = useMemo(() => {
    const completed = new Set(completedIds);
    const countedBooks = new Set<string>();
    const categories: Record<string, number> = {};
    const markerGroups: Partial<Record<UserMarkerGroup, number>> = {};
    for (const point of allPoints) {
      if (!completed.has(point.id)) continue;
      if ("bookId" in point && point.bookId) {
        if (countedBooks.has(point.bookId)) continue;
        countedBooks.add(point.bookId);
      }
      for (const category of getPointFilterCategories(point)) {
        const filterCategory = getTrainerFilterCategory(point) ?? category;
        categories[filterCategory] = (categories[filterCategory] ?? 0) + 1;
      }
      const trainerKey = getTrainerFilterKey(point);
      if (trainerKey) categories[trainerKey] = (categories[trainerKey] ?? 0) + 1;
      if (isUserMapMarker(point)) {
        const group = point.group ?? DEFAULT_MARKER_GROUP;
        markerGroups[group] = (markerGroups[group] ?? 0) + 1;
      }
    }
    return { foundCategoryCounts: categories, foundMarkerGroupCounts: markerGroups };
  }, [allPoints, completedIds]);

  const activeCategories = useMemo(() => {
    if (categorySelection.mapId === selectedMap.id && categorySelection.scopeId === characterScopeId && categorySelection.resolved) {
      return categorySelection.categories;
    }
    const stored = readStoredCategories(selectedMap.id, characterScopeId);
    if (stored !== null) return stored;
    if (mapDataLoading || !data) return [];
    return dungeon ? [...DEFAULT_CATEGORY_IDS, "boss", "dungeon-door"] : DEFAULT_CATEGORY_IDS;
  }, [categorySelection, characterScopeId, data, dungeon, mapDataLoading, selectedMap.id]);

  const savedPoints = useMemo(
    () => allPoints.filter((point) => point.category === "custom" || saved.favoriteIds.includes(point.id)),
    [allPoints, saved.favoriteIds],
  );
  const gatheringRoute = useMemo(() => {
    if (gatheringRouteSelection?.mapId !== mapId) return [];
    const byId = new Map(savedPoints.map((point) => [point.id, point]));
    return gatheringRouteSelection.ids.map((id) => byId.get(id))
      .filter((point): point is MapPoint => !!point && isUserMapMarker(point) && point.group === "resources");
  }, [gatheringRouteSelection, mapId, savedPoints]);
  const completedPoints = useMemo(() => {
    const completed = new Set(completedIds);
    const countedBooks = new Set<string>();
    return allPoints.filter((point) => {
      if (!completed.has(point.id)) return false;
      if ("bookId" in point && point.bookId) {
        if (countedBooks.has(point.bookId)) return false;
        countedBooks.add(point.bookId);
      }
      return true;
    });
  }, [allPoints, completedIds]);

  // Ties between equally good search hits go to whatever is nearest the
  // player, or failing that the last place the user looked at.
  const searchOrigin = livePosition.position ?? referencePoint;

  const coordinatePoint = useMemo<MapPoint | null>(() => {
    if (!data) return null;
    const match = query.match(/(-?\d{1,7})\D+(-?\d{1,7})/);
    if (!match) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    const bounds = data.navigationBounds ?? data.bounds;
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return null;
    return {
      id: `coordinate-${x}-${y}`,
      name: t("map.search.coordinateName", { x, y }),
      category: "custom",
      label: t("map.search.coordinateResult"),
      subtype: "coordinate",
      regionId: "coordinate",
      region: t("map.search.coordinate"),
      x,
      y,
    };
  }, [data, query, t]);

  // What a place ANSWERS TO (its names) stays separate from what merely
  // describes it (region, kind, coordinates): context is real evidence, but it
  // can never outrank someone typing an actual name.
  const searchDocuments = useMemo(() => {
    const prepare = createSearchTextPreparer();
    return allPoints.filter((point) => point.category !== "point-of-interest")
    .map((point) => createMapSearchDocument(
    point,
    [point.name, point.label, "detailLabel" in point ? point.detailLabel ?? "" : "",
      ...(!isUserMapMarker(point) ? point.lookupNames ?? [] : []),
      ...("questOffers" in point ? (point.questOffers ?? []).map((offer) => offer.name) : []),
      ...getMapCompanionSources(point).map(({ companion }) => companion.name)],
    [point.region, point.label, point.subtype, point.x, point.y].join(" "),
    prepare,
  ));
  }, [allPoints]);

  const localSearch = useLocalMapSearch(searchDocuments, query, searchOrigin, !minimapMode);
  const locationMatches = localSearch.matches;
  const mapFilterQuery = getMapFilterQuery(query, localSearch.resultQuery);
  const locationResults = useMemo(() => {
    const groups = localSearch.resultQuery === query ? groupMapSearchMatches(locationMatches, LOCATION_RESULT_LIMIT) : [];
    if (!coordinatePoint) return groups;
    return [
      { point: coordinatePoint, score: -1, count: 1 },
      ...groups.filter(({ point }) => point.id !== coordinatePoint.id),
    ];
  }, [coordinatePoint, localSearch.resultQuery, locationMatches, query]);

  // The pins the map keeps while a search is running — every match, uncapped,
  // even though the dropdown lists only the strongest leads.
  const searchMatchIds = useMemo(
    () => new Set(locationMatches.map(({ point }) => point.id)),
    [locationMatches],
  );

  const visiblePoints = useMemo(() => {
    const searching = mapFilterQuery.trim().length > 0;
    const matches = allPoints.filter((point) => {
      if (isUserMapMarker(point) && hiddenMarkerGroups.includes(point.group ?? DEFAULT_MARKER_GROUP)) return false;
      if (markerSet && markerSet.mapId === data?.id) {
        return markerSet.ids.has(point.id) && (!searching || searchMatchIds.has(point.id));
      }
      if (searching) return searchMatchIds.has(point.id);
      const savedLayerPoint = point.category === "custom" || saved.favoriteIds.includes(point.id);
      const completedLayerPoint = completedIds.includes(point.id);
      const personalLayerPoint = savedLayerPoint || completedLayerPoint;
      if (hideCompleted && completedLayerPoint) return false;
      if (hideFavorites && saved.favoriteIds.includes(point.id)) return false;
      if (!personalLayerPoint && !getPointFilterCategories(point).some((category) =>
        activeCategories.includes(getTrainerFilterCategory(point) ?? category))) return false;
      const trainerKey = getTrainerFilterKey(point);
      if (!personalLayerPoint && trainerKey && hiddenTrainerTypes.includes(trainerKey)) return false;
      if (sidebarMode === "saved" && !personalLayerPoint) return false;
      return true;
    });
    const filtered = coordinatePoint && (searching || sidebarMode !== "saved")
      ? [coordinatePoint, ...matches]
      : matches;
    if (!data || searching) return filtered;
    const protectedIds = new Set([...saved.favoriteIds, ...completedIds]);
    const mapSize = Math.min(data.bounds.maxX - data.bounds.minX, data.bounds.maxY - data.bounds.minY);
    return groupNearbySameNameLocations(filtered, "enemy", mapSize * NEARBY_ENEMY_RADIUS_RATIO, protectedIds);
  }, [activeCategories, allPoints, completedIds, coordinatePoint, data, hiddenMarkerGroups, hiddenTrainerTypes, hideCompleted, hideFavorites, mapFilterQuery, markerSet, searchMatchIds, saved.favoriteIds, sidebarMode]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  // The sidebar modes are map pageviews. The minimap
  // overlay renders no sidebar, so it never reports pageviews.
  const dataId = data?.id;
  useEffect(() => {
    if (!active || minimapMode || !dataId) return;
    reportMapPageview(sidebarMode, dataId);
  }, [active, dataId, minimapMode, sidebarMode]);

  // One MAP_SEARCHED per settled query, not one per keystroke.
  const searchReportRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(searchReportRef.current), [selectedMap.id]);

  const focusMapSearch = useCallback(() => {
    onControlsExpandedChange?.(true);
    window.requestAnimationFrame(() => document.getElementById("map-search-input")?.focus());
  }, [onControlsExpandedChange]);

  // Escape closes things innermost-first; Ctrl+K jumps to the search box.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!minimapMode && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusMapSearch();
      }
      if (event.key === "Escape") {
        if (minimapMode) {
          if (selectedPoint) setSelectedPoint(null);
          return;
        }
        if (placementMode) {
          setPlacementMode(false);
          return;
        }
        if (selectedReferenceHistory.length) {
          setSelectedDetail(null);
          return;
        }
        if (selectedPoint) {
          setSelectedPoint(null);
          return;
        }
        if (questGroup) {
          setQuestGroupSelection(null);
          setSidebarOpen(false);
          return;
        }
        if (sidebarOpen) setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, focusMapSearch, minimapMode, placementMode, questGroup, selectedReferenceHistory.length, selectedPoint, sidebarOpen]);

  // Resolve edited markers and reward-layer presentation while retaining a
  // selected nearby group's coordinates. Keep this stable for focus effects.
  const resolvedSelectedPoint = useMemo(() => {
    if (!selectedPoint) return null;
    if (isDraftMarker(selectedPoint)) return selectedPoint;
    if (selectedPoint.subtype === "custom") return saved.markers.find((marker) => marker.id === selectedPoint.id) ?? null;
    const current = allPoints.find((point) => point.id === selectedPoint.id) ?? trackedQuestPoints.find(point => point.id === selectedPoint.id);
    if (!current && (sourcePoints.some((point) => point.id === selectedPoint.id)
      || !isPointVisibleForFactions(selectedPoint, factions))) return null;
    return current ? { ...current, x: selectedPoint.x, y: selectedPoint.y,
      ...("occurrences" in selectedPoint ? { occurrences: selectedPoint.occurrences } : {}) } : selectedPoint;
  }, [allPoints, factions, saved.markers, selectedPoint, sourcePoints, trackedQuestPoints]);
  const flightRouteKey = `${mapId}:${resolvedSelectedPoint?.id ?? ""}`;
  const hiddenFlightRouteIds = hiddenFlightRoutesByPoint[flightRouteKey] ?? [];

  useEffect(() => {
    if (resolvedSelectedPoint && !isDraftMarker(resolvedSelectedPoint)) saveMapReferencePoint(resolvedSelectedPoint);
  }, [resolvedSelectedPoint]);
  const poiLabelPoints = useMemo(() => data?.locations.filter((point) => point.category === "point-of-interest") ?? [],
    [data?.locations]);
  const visibleMarkerPoints = useMemo(() => mergeTrackedQuestPoints(visiblePoints.filter((point) => point.category !== "point-of-interest"), trackedQuestPoints),
    [visiblePoints, trackedQuestPoints]);

  // Open a requested point after its map has loaded, including database links.
  useEffect(() => {
    if (minimapMode) return;
    const focusRequestedPoint = (event: Event) => {
      if (event instanceof StorageEvent
        && event.key !== MAP_FOCUS_REQUEST_KEY
        && event.key !== null) return;
      if (!active) {
        setReturnPanel(null);
        pendingReturn.current = null;
      }
      let request: MapFocusRequest | null;
      try {
        request = JSON.parse(localStorage.getItem(MAP_FOCUS_REQUEST_KEY) ?? "null") as MapFocusRequest | null;
      } catch (error) {
        console.error("Invalid map focus request", error);
        return;
      }
      if (!request || (request.mapId && !hasMapDefinition(request.mapId))) return;
      if (request.mapId && selectedMap.id !== request.mapId) {
        selectMap(request.mapId);
        return;
      }
      setQuestGroupSelection(null);
      if (request.searchQuery?.trim()) {
        localStorage.removeItem(MAP_FOCUS_REQUEST_KEY);
        setSelectedPoint(null);
        setSelectedDetail(null);
        setSelectedSource(null);
        setSidebarMode("explore");
        setQuery(request.searchQuery.trim());
        focusMapSearch();
        return;
      }
      if (!data || (request.mapId && data.id !== request.mapId)) return;
      if (request.markerSet) {
        localStorage.removeItem(MAP_FOCUS_REQUEST_KEY);
        setMarkerSet({ mapId: data.id, name: request.markerSet.name, ids: new Set(request.markerSet.ids) });
        setSelectedPoint(null);
        setSelectedDetail(null);
        setSelectedSource(null);
        setQuery("");
        setSidebarOpen(false);
        setFocusPoint({ point: createMapOverviewFocusPoint(data) });
        return;
      }
      if (request.regionOnly) {
        localStorage.removeItem(MAP_FOCUS_REQUEST_KEY);
        setSelectedPoint(null);
        setFocusPoint({ point: createMapOverviewFocusPoint(data) });
        setQuery("");
        setSelectedDetail(null);
        setSidebarOpen(false);
        return;
      }
      const point = resolveMapFocusPoint(request, data, allPoints);
      if (!point) {
        if (request.pointId && resolveMapFocusPoint(request, data, sourcePoints)) {
          localStorage.removeItem(MAP_FOCUS_REQUEST_KEY);
        }
        return;
      }
      if (request.destination?.companionId || point.category === "rift") {
        const categories = [...new Set([...activeCategories, point.category])];
        writeCategories(selectedMap.id, categories, characterScopeId);
        setCategorySelection({ mapId: selectedMap.id, scopeId: characterScopeId, categories, resolved: true });
      }
      localStorage.removeItem(MAP_FOCUS_REQUEST_KEY);
      setQuery("");
      const returning = pendingReturn.current?.mapId === data.id && pendingReturn.current.pointId === point.id
        ? pendingReturn.current : null;
      setSelectedDetail(returning?.history.length
        ? { mapId: data.id, pointId: point.id, history: returning.history } : null);
      const overviewOnly = point.subtype === "map-overview";
      setSelectedPoint(point.subtype === "region" || overviewOnly ? null : point);
      const sourceContext = returning?.sourceContext ?? request.sourceContext;
      setSelectedSource(sourceContext ? { mapId: data.id, point, context: sourceContext } : null);
      if (returning) {
        pendingReturn.current = null;
        setReturnPanel(null);
      }
      if (point.subtype === "region" || overviewOnly || point.category === "rift") {
        setSidebarMode("explore");
        if (point.subtype === "region") saveMapReferencePoint(point);
      }
      setFocusPoint({ point: { ...point } });
      setSidebarOpen(!overviewOnly);
    };
    window.addEventListener("storage", focusRequestedPoint);
    window.addEventListener(MAP_FOCUS_REQUEST_KEY, focusRequestedPoint);
    focusRequestedPoint(new Event(MAP_FOCUS_REQUEST_KEY));
    return () => {
      window.removeEventListener("storage", focusRequestedPoint);
      window.removeEventListener(MAP_FOCUS_REQUEST_KEY, focusRequestedPoint);
    };
  }, [active, activeCategories, allPoints, characterScopeId, sourcePoints, data, focusMapSearch, minimapMode, selectedMap.id, selectMap]);

  if (mapDataLoading || !data) return <MapDataState error={error} compact={minimapMode} />;

  const destination = onReturnToPanel ? returnDestination : returnPanel?.destination;
  const returnLabel = !onReturnToPanel && returnPanel?.pointName
    ? t("mapInteriors.backToMarker", { name: returnPanel.pointName }) : t("mapInteriors.backToDetails");
  const destinationInsetId = destination?.mapId === data.id && destination.pointId.startsWith("region:")
    ? destination.pointId.slice("region:".length) : undefined;
  const destinationInset = data.insets?.find((inset) => inset.id === destinationInsetId);
  const destinationInsetKey = destinationInset ? `${data.id}:${destinationInset.id}` : undefined;
  const destinationVisible = !destination || (destination.mapId === data.id
    && (!destinationInset || (trackedInsetVisibility?.key === destinationInsetKey && trackedInsetVisibility?.visible === true)));
  const handleReturnToPanel = () => {
    if (onReturnToPanel) onReturnToPanel();
    else if (returnPanel) {
      pendingReturn.current = returnPanel;
      requestMapPointInMain(returnPanel.pointId, returnPanel.mapId);
    }
  };
  const returnInSidebar = Boolean(sidebarOpen
    && (onReturnToPanel || returnPanel) && resolvedSelectedPoint && destination
    && destination.mapId === data.id && destination.pointId === resolvedSelectedPoint.id);

  /** Writes the visible layer set once, so every filter control (single
   *  toggle, group checkbox, "Only") persists through the same path. */
  const applyCategories = (categories: string[]) => {
    writeCategories(selectedMap.id, categories, characterScopeId);
    setCategorySelection({ mapId: selectedMap.id, scopeId: characterScopeId, categories, resolved: true });
  };
  const applyHiddenMarkerGroups = (groups: UserMarkerGroup[]) => {
    localStorage.setItem(hiddenMarkerGroupsStorageKey(mapId, characterScopeId), JSON.stringify(groups));
    setMarkerGroupSelection({ mapId, scopeId: characterScopeId, hiddenGroups: groups });
  };
  const applyHiddenTrainerTypes = (types: string[]) => {
    const stored = JSON.stringify(types);
    localStorage.setItem(hiddenTrainerTypesStorageKey(mapId, characterScopeId), stored);
    setTrainerTypeSelection({ mapId, scopeId: characterScopeId, stored });
  };
  const toggleVisibility = (kind: "completed" | "favorites") => {
    const next = kind === "completed" ? !hideCompleted : !hideFavorites;
    localStorage.setItem(kind === "completed" ? hideCompletedStorageKey(characterScopeId)
      : hideFavoritesStorageKey(characterScopeId), String(next));
    setVisibilitySelection({ scopeId: characterScopeId, hideCompleted: kind === "completed" ? next : hideCompleted,
      hideFavorites: kind === "favorites" ? next : hideFavorites });
  };
  const toggleFaction = (faction: MapFaction) => {
    if (characterFaction) return;
    const next = factions.includes(faction)
      ? factions.filter((item) => item !== faction)
      : MAP_FACTIONS.filter((item) => item === faction || factions.includes(item));
    localStorage.setItem(factionsStorageKey(characterScopeId), JSON.stringify(next));
    setFactionSelection({ scopeId: characterScopeId, characterFaction, values: next });
  };
  const selectCharacter = (id: string | null) => {
    if (id === characterProfiles.selectedId) return;
    setSelectedPoint(null);
    setSelectedDetail(null);
    setSelectedSource(null);
    setQuestGroupSelection(null);
    characterProfiles.select(id);
  };
  const removeCharacter = (id: string) => {
    if (id === characterProfiles.selectedId) {
      setSelectedPoint(null);
      setSelectedDetail(null);
      setSelectedSource(null);
      setQuestGroupSelection(null);
    }
    characterProfiles.remove(id);
  };

  const selectPoint = (
    point: MapPoint | null,
    source: MarkerOpenSource = "map",
    options?: { preserveZoom?: boolean },
  ) => {
    if (point && isDraftMarker(point) && isDraftMarker(selectedPoint) && point.id === selectedPoint.id) return;
    if (source !== "sidebar" || (point && !questGroup?.members.some((member) => member.id === point.id))) {
      setQuestGroupSelection(null);
    }
    setDraftSource(null);
    setSelectedSource(null);
    setSelectedPoint(point);
    if (point) {
      recordMarkerOpened(point, { map: data.id, source });
      if (minimapMode) return;
      setFocusPoint({ point: { ...point }, preserveZoom: source === "map" || options?.preserveZoom,
        moveOnlyIfObscured: source === "map" });
      if (followLivePosition) onToggleFollowLivePosition?.();
      setSidebarOpen(true);
      return;
    }
    // Dismissing a marker by clicking the map closes its panel outright: the
    // panel the details replaced must not spring back on a click that was
    // meant to clear the map. The details' own back button still returns to
    // it, because that one reports itself as a sidebar action.
    if ((selectedPoint || questGroup) && source === "map") setSidebarOpen(false);
  };

  const openQuestGroup = (group: MapQuestGroup) => {
    setQuestGroupSelection({ mapId: data.id, group });
    setSelectedPoint(null);
    setSelectedDetail(null);
    setSelectedSource(null);
    setSidebarMode("explore");
    setSidebarOpen(true);
    setFocusPoint({ point: { ...group.members[0]!, x: group.x, y: group.y }, preserveZoom: true });
  };

  /** The search box only — internal setQuery calls (map switch resets) must
   *  never report a phantom search. */
  const handleQueryChange = (next: string) => {
    setQuery(next);
    window.clearTimeout(searchReportRef.current);
    const settled = next.trim().toLowerCase();
    if (!settled) return;
    searchReportRef.current = window.setTimeout(() => {
      track("MAP_SEARCHED", {
        query: settled.slice(0, 60),
        query_length: settled.length,
        map: data.id,
      });
    }, SEARCH_REPORT_DELAY_MS);
  };

  const focusRegion = (regionId: string) => {
    const region = data.regions.find((candidate) => candidate.id === regionId);
    if (!region) return;
    setSidebarMode("explore");
    setSelectedPoint(null);
    saveMapReferencePoint(region);
    setFocusPoint({ point: createMapRegionFocusPoint(region) });
  };

  const prepareMarker = (coordinate: { x: number; y: number }, source: "placement" | "coordinate") => {
    const marker: UserMapMarker = {
      id: `${DRAFT_MARKER_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: "",
      category: "custom",
      label: t("map.categories.custom"),
      subtype: "custom",
      regionId: "personal",
      region: t("map.custom.personal"),
      x: Math.round(coordinate.x),
      y: Math.round(coordinate.y),
      icon: "pin",
      group: DEFAULT_MARKER_GROUP,
      mapId: data.id,
    };
    setDraftSource(source);
    setQuery("");
    setSidebarMode("explore");
    setPlacementMode(false);
    setSelectedPoint(marker);
    setFocusPoint({ point: { ...marker } });
    setSidebarOpen(true);
  };

  const createMarker = (name: string, note: string) => {
    if (!isDraftMarker(selectedPoint) || !draftSource || !name.trim()) return;
    const marker = saved.addMarker(
      selectedPoint,
      name.trim().slice(0, 200),
      selectedPoint.label,
      selectedPoint.region,
      data.id,
      { icon: selectedPoint.icon, group: selectedPoint.group, note },
    );
    track("CUSTOM_MARKER_CREATED", { source: draftSource, map: data.id });
    setDraftSource(null);
    setSelectedPoint(marker);
    setFocusPoint({ point: { ...marker } });
  };

  const keepFiltersOpen = active && showOnboardingFilters && !minimapMode;
  const filtersOpen = keepFiltersOpen || (sidebarOpen && !resolvedSelectedPoint && !questGroup && sidebarMode === "explore");

  /** Opening any panel closes the others; a second press on an open panel closes it. */
  const togglePanel = (mode: MapSidebarMode) => {
    const alreadyOpen = sidebarOpen && !resolvedSelectedPoint && sidebarMode === mode;
    if (alreadyOpen) {
      setSidebarOpen(false);
      return;
    }
    setSelectedPoint(null);
    setQuestGroupSelection(null);
    setSelectedDetail(null);
    setPlacementMode(false);
    setSidebarMode(mode);
    setSidebarOpen(true);
  };
  return (
    // The map owns the full frame; the sidebar floats over it as a panel, so
    // opening or closing it never resizes the world underneath.
    <div data-map-workspace className={cn("@container relative flex h-full min-h-0 w-full", overlayMode ? "bg-transparent" : "bg-background")}>
      {!minimapMode && !overlayMode && <h1 className="sr-only">{data.displayName}</h1>}
      {!minimapMode && (
        // Filters and character profiles stay on the left; search and quest log stay on the right.
        <div
          id="map-toolbar"
          inert={!controlsExpanded}
          data-app-window-top-controls
          className="map-toolbar pointer-events-none absolute inset-x-5 top-5 z-50 flex flex-wrap items-start justify-between gap-2.5"
        >
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 @max-[760px]:w-full @max-[760px]:flex-nowrap">
            <MapPrimaryControls
              filtersOpen={filtersOpen}
              filtersLocked={keepFiltersOpen}
              activeFilterCount={FILTER_CATEGORIES.filter(({ id }) => activeCategories.includes(id) && categoryCounts[id] > 0).length
                + MARKER_GROUPS.filter(({ id }) => (markerGroupCounts[id] ?? 0) > 0 && !hiddenMarkerGroups.includes(id)).length}
              onToggleFilters={() => togglePanel("explore")}
              showCharacters={false}
              characters={characterProfiles.characters}
              selectedCharacterId={characterProfiles.selectedId}
              onSelectCharacter={selectCharacter}
              onCreateCharacter={() => setCharacterModal("create")}
              onEditCharacter={setCharacterModal}
              onRemoveCharacter={removeCharacter}
            />
            <div className="flex max-w-full min-w-0 items-center gap-2">
              <MapSelectDropdown
                options={mapOptions}
                value={dungeon ? dungeonFloorId(dungeon.id, 0) : selectedMap.id}
                open={mapPickerOpen}
                onOpenChange={onMapPickerOpenChange}
                placeholder={data.displayName}
                ariaLabel={t("dungeonJournal.selectMap")}
                searchPlaceholder={t("dungeonJournal.searchMaps")}
                noResultsLabel={t("map.regions.noSearchResults")}
                icon={MapIcon}
                className="pointer-events-auto min-w-0 w-40 @min-[560px]:w-48"
                triggerClassName="h-[var(--map-toolbar-height)] bg-surface/90 shadow-lg shadow-black/30 backdrop-blur-xl"
                onSelect={(id) => {
                  if (id === (dungeon ? dungeonFloorId(dungeon.id, 0) : selectedMap.id)) return;
                  setReturnPanel(null);
                  setMarkerSet(undefined);
                  selectMap(id);
                }}
              />
              {dungeon && dungeon.floors.length > 1 && <MapSelectDropdown
                options={dungeon.floors.map((floor, index) => ({
                  id: dungeonFloorId(dungeon.id, index), name: dungeonFloorLabel(floor, index, t, gameText),
                }))}
                value={selectedMap.id}
                onSelect={selectMap}
                placeholder={data.displayName}
                ariaLabel={t("dungeonJournal.mapFor", { name: data.displayName })}
                searchPlaceholder={t("dungeonJournal.searchMaps")}
                noResultsLabel={t("map.regions.noSearchResults")}
                className="pointer-events-auto min-w-0 w-40"
                triggerClassName="h-[var(--map-toolbar-height)] bg-surface/90 px-2.5 text-[11px] shadow-lg shadow-black/30 backdrop-blur-xl"
                panelClassName="w-[16.8rem] max-w-[calc(100vw-2.5rem)]"
              />}
            </div>
            {markerSet?.mapId === data.id && <button type="button"
              className="pointer-events-auto flex h-[var(--map-toolbar-height)] min-w-0 max-w-60 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 text-left text-xs"
              aria-label={t("robRun.wiki.clearMapFilter", { name: markerSet.name, count: markerSet.ids.size })}
              onClick={() => setMarkerSet(undefined)}>
              <span className="truncate">{markerSet.name} · {markerSet.ids.size.toLocaleString(i18n.language)}</span>
              <X size={14} className="shrink-0" aria-hidden="true" />
            </button>}
          </div>
          <div className="ml-auto flex min-w-0 max-w-full items-end gap-2.5 @max-[760px]:w-full">
            <MapSearchOverlay
              key={data.id}
              mapId={data.id}
              mapName={data.displayName}
              query={query}
              locations={locationResults}
              localSearchPending={localSearch.pending}
              localSearchError={localSearch.error}
              regions={data.regions}
              factions={factions}
              onQueryChange={handleQueryChange}
              onSelect={(point) => selectPoint(point, "sidebar")}
              onNavigate={(nextMapId, markerId, context) => {
                if (hasMapDefinition(nextMapId)) requestMapPointInMain(markerId, nextMapId, context);
              }}
              onSelectRegion={dungeon ? undefined : focusRegion}
            />
          </div>
        </div>
      )}
      {!minimapMode && (
        <MapSidebar
          data={data}
          filterFocusRequest={filterFocusRequest}
          referenceHistory={selectedReferenceHistory}
          sourceContext={selectedSource?.mapId === data.id && selectedSource.point === selectedPoint ? selectedSource.context : undefined}
          onOpenReference={(target, fromPrimary) => {
            if (!resolvedSelectedPoint) return;
            setSelectedDetail((current) => {
              const history = current?.mapId === data.id && current.pointId === resolvedSelectedPoint.id ? current.history : [];
              const currentHistory = fromPrimary ? history.slice(0, 1) : history;
              return { mapId: data.id, pointId: resolvedSelectedPoint.id,
                history: navigateReferenceHistory(currentHistory, currentHistory[currentHistory.length - 1] ?? null, target) };
            });
          }}
          onBackReference={() => setSelectedDetail((current) => current && current.history.length > 1
            ? { ...current, history: current.history.slice(0, -1) } : null)}
          onCloseDetailReference={(keepPrimary) => setSelectedDetail((current) => keepPrimary && current
            ? { ...current, history: current.history.slice(0, 1) } : null)}
          onOpenMapFromReference={(nextMapId, markerId) => {
            if (!hasMapDefinition(nextMapId)) return;
            setReturnPanel(resolvedSelectedPoint ? {
              mapId: data.id,
              pointId: resolvedSelectedPoint.id,
              pointName: resolvedSelectedPoint.name,
              history: selectedReferenceHistory,
              sourceContext: selectedSource?.mapId === data.id && selectedSource.point === selectedPoint
                ? selectedSource.context : undefined,
              destination: { mapId: nextMapId, pointId: markerId },
            } : null);
            setSelectedDetail(null);
            if (markerId) requestMapPointInMain(markerId, nextMapId);
            else requestMapDestinationInMain(nextMapId);
          }}
          onReturnToPanel={returnInSidebar ? handleReturnToPanel : undefined}
          returnLabel={returnLabel}
          onOpenMapOverview={(nextMapId) => {
            if (!hasMapDefinition(nextMapId)) return;
            setReturnPanel(resolvedSelectedPoint ? {
              mapId: data.id,
              pointId: resolvedSelectedPoint.id,
              pointName: resolvedSelectedPoint.name,
              history: selectedReferenceHistory,
              sourceContext: selectedSource?.mapId === data.id && selectedSource.point === selectedPoint
                ? selectedSource.context : undefined,
              destination: { mapId: nextMapId, pointId: "" },
            } : null);
            setSelectedDetail(null);
            requestMapDestinationInMain(nextMapId);
          }}
          selectedPoint={keepFiltersOpen ? null : resolvedSelectedPoint}
          questGroup={keepFiltersOpen ? null : questGroup}
          onCloseQuestGroup={() => { setQuestGroupSelection(null); setSidebarOpen(false); }}
          onBackToQuestGroup={() => { setSelectedPoint(null); setSelectedDetail(null); }}
          draftMarker={isDraftMarker(resolvedSelectedPoint)}
          markerNotes={saved.notes}
          onCreateMarker={createMarker}
          onSaveMarkerEdits={saved.saveMarkerEdits}
          hiddenFlightRouteIds={hiddenFlightRouteIds}
          onToggleFlightRoute={(markerId) => {
            if (resolvedSelectedPoint?.category !== "flight-master") return;
            setHiddenFlightRoutesByPoint((current) => {
              const hidden = current[flightRouteKey] ?? [];
              return { ...current, [flightRouteKey]: hidden.includes(markerId)
                ? hidden.filter((id) => id !== markerId) : [...hidden, markerId] };
            });
          }}
          mode={keepFiltersOpen ? "explore" : sidebarMode}
          open={sidebarOpen || keepFiltersOpen}
          keepFiltersOpen={keepFiltersOpen}
          compact={compactSidebar}
          activeCategories={activeCategories}
          characterScopeId={characterScopeId}
          hasCharacters={characterProfiles.characters.length > 0}
          selectedCharacter={characterProfiles.selectedCharacter}
          onToggleCharacterFilter={characterMapFilter.toggle}
          categoryCounts={categoryCounts}
          foundCategoryCounts={foundCategoryCounts}
          markerGroupCounts={markerGroupCounts}
          foundMarkerGroupCounts={foundMarkerGroupCounts}
          hiddenMarkerGroups={hiddenMarkerGroups}
          hiddenTrainerTypes={hiddenTrainerTypes}
          favoriteIds={saved.favoriteIds}
          completedIds={completedIds}
          hideCompleted={hideCompleted}
          hideFavorites={hideFavorites}
          savedPoints={savedPoints}
          completedPoints={completedPoints}
          gatheringRoute={gatheringRoute}
          onPlanGatheringRoute={() => setGatheringRouteSelection({ mapId, ids: planGatheringRoute(savedPoints).map((point) => point.id) })}
          onClearGatheringRoute={() => setGatheringRouteSelection(null)}
          onFocusGatheringZone={(zone) => {
            setFocusPoint({ point: createMapRegionFocusPoint(zone) });
          }}
          shownMarkerCount={visibleMarkerPoints.length}
          onOpenChange={setSidebarOpen}
          onModeChange={setSidebarMode}
          onToggleCategory={(categoryId) => applyCategories(activeCategories.includes(categoryId)
            ? activeCategories.filter((item) => item !== categoryId)
            : [...activeCategories, categoryId])}
          onSetCategories={applyCategories}
          onSetHiddenMarkerGroups={applyHiddenMarkerGroups}
          onSetHiddenTrainerTypes={applyHiddenTrainerTypes}
          factions={factions}
          onToggleFaction={toggleFaction}
          onSelectPoint={(point) => selectPoint(point, "sidebar")}
          onToggleFavorite={saved.toggleFavorite}
          onToggleCompleted={(id) => {
            const group = bookLocationGroup(sourcePoints, id);
            if (group.length > 1) saved.setCompletedGroup(group, !completedIds.includes(id));
            else saved.toggleCompleted(id);
          }}
          onToggleHideCompleted={() => toggleVisibility("completed")}
          onToggleHideFavorites={() => toggleVisibility("favorites")}
          onUpdateMarkerStyle={(id, change) => {
            if (isDraftMarker(selectedPoint) && selectedPoint.id === id) {
              setSelectedPoint({ ...selectedPoint, ...change });
            }
          }}
          onUpdateMarkerGroup={(id, group) => {
            if (isDraftMarker(selectedPoint) && selectedPoint.id === id) {
              setSelectedPoint({ ...selectedPoint, group });
            }
          }}
          onRemoveMarker={(id) => {
            saved.removeMarker(id);
            setSelectedPoint(null);
          }}
          onSaveCoordinate={(point) => prepareMarker(point, "coordinate")}
        />
      )}
      <div className="min-w-0 flex-1">
        {error && (
          <div
            role="alert"
            className="pointer-events-none absolute left-1/2 top-5 z-50 max-w-sm -translate-x-1/2 rounded-[var(--radius-md)] border border-warning/40 bg-surface/95 px-3 py-2 text-center text-xs text-white shadow-lg"
          >
            {t("map.data.errorBody")}
          </div>
        )}
        <InteractiveMap
          key={data.id}
          data={data}
          trackedInsetId={destinationInset?.id}
          onTrackedInsetVisibilityChange={destinationInsetKey ? (visible) => {
            setTrackedInsetVisibility({ key: destinationInsetKey, visible });
          } : undefined}
          points={visibleMarkerPoints}
          trackedQuestMarkerIds={trackedQuestMarkerIds}
          poiLabelPoints={poiLabelPoints}
          completedIds={completedIds}
          selectedPoint={resolvedSelectedPoint}
          hiddenFlightRouteIds={hiddenFlightRouteIds}
          gatheringRoute={gatheringRoute}
          focusPoint={focusPoint}
          placementMode={placementMode}
          onTogglePlacement={() => setPlacementMode((current) => !current)}
          livePosition={livePosition}
          followLivePosition={followLivePosition && livePosition.position !== null}
          onToggleFollowLivePosition={onToggleFollowLivePosition}
          fullscreenControl={fullscreenControl}
          controlsExpanded={controlsExpanded}
          controlsIntroVisible={controlsIntroVisible}
          minimapMode={minimapMode}
          onSelectPoint={(point, options) => selectPoint(point, "map", options)}
          onQuestGroup={openQuestGroup}
          onPlaceMarker={(coordinate) => prepareMarker(coordinate, "placement")}
        />
      </div>
      {!minimapMode && destinationVisible && onReturnToPanel && !returnInSidebar && <button type="button" onClick={handleReturnToPanel} data-map-ui
        className="absolute bottom-4 left-1/2 z-50 flex h-11 -translate-x-1/2 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[var(--radius-full)] border border-border bg-surface/90 px-5 text-sm font-medium text-zinc-200 shadow-lg shadow-black/30 backdrop-blur-xl transition-colors hover:border-accent/50 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        <ArrowLeft size={17} aria-hidden="true" />{returnLabel}
      </button>}
      {minimapMode && resolvedSelectedPoint && (
        <OverlayPointCard
          key={resolvedSelectedPoint.id}
          point={resolvedSelectedPoint}
          onClose={() => setSelectedPoint(null)}
        />
      )}
      {!minimapMode && characterModal && <MapCharacterModal
        character={characterModal === "create" ? null : characterModal}
        onClose={() => setCharacterModal(null)}
        onSave={(draft, existingId) => {
          setSelectedPoint(null);
          setSelectedDetail(null);
          setSelectedSource(null);
          setQuestGroupSelection(null);
          characterProfiles.save(draft, existingId);
          setPlacementMode(false);
        }}
        onRemove={removeCharacter}
      />}
    </div>
  );
};

export default MapWorkspace;
