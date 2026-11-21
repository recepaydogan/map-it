import type { ReferenceTarget } from "../reference/reference-types";
import { navigateReferenceHistory } from "../reference/reference-history";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { cn } from "../../lib/cn";
import { track } from "../../services/optional-usage";
import {
  recordMarkerOpened,
  type MarkerOpenSource,
} from "../../services/optional-usage";
import { reportMapPageview } from "../../state/use-analytics";
import { useLivePosition } from "../live-position/live-position-store";
import InteractiveMap, { type MapCameraFocus } from "./interactive-map";
import { DEFAULT_CATEGORY_IDS, FILTER_CATEGORIES, NAMED_GATHERABLE_CATEGORY_IDS,
  migrateCategorySelection, type MapFilterFocusRequest } from "./map-config";
import MapDataState from "./map-data-state";
import { groupNearbySameNameLocations } from "./map-nearby-locations";
import type { MapQuestGroup } from "./map-marker-overlap";
import { isPointVisibleForFactions, MAP_FACTIONS, type MapFaction } from "./map-faction-filter";
import { getPointFilterCategories, isLinkedQuestOfferPoint } from "./map-quest-filter";
import { createMapSearchDocument, groupMapSearchMatches, rankMapSearchMatches, searchMapDocuments } from "./map-fuzzy-search";
import { useGameText } from "../../i18n/game-text";
import MapPrimaryControls from "./map-primary-controls";
import { DEFAULT_MAP_ID, hasMapDefinition } from "./map-registry";
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
import { getTrainerFilterCategory, getTrainerFilterKey, TRAINER_CATEGORIES, TRAINER_FILTER_IDS, trainerFilterKey } from "./map-trainer-filters";
import { planGatheringRoute } from "./map-gathering-route";
import { bookLocationGroup, completeBookLocationIds } from "./library-book-found";
import { matchesMapShortcut, useMapShortcuts } from "./map-shortcuts";

/** Typing pause after which a search is reported once, not per keystroke. */
const SEARCH_REPORT_DELAY_MS = 900;
/** Place rows the search dropdown shows. */
const LOCATION_RESULT_LIMIT = 8;
/** A category with more markers than this starts hidden, whatever its config says. */
const DEFAULT_CATEGORY_MARKER_LIMIT = 1_000;
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
const categoryStorageKey = (mapId: string) => `${CATEGORY_STORAGE_KEY_PREFIX}${mapId}`;
const hiddenMarkerGroupsStorageKey = (mapId: string) => `${HIDDEN_MARKER_GROUPS_STORAGE_KEY_PREFIX}${mapId}`;
const hiddenTrainerTypesStorageKey = (mapId: string) => `${HIDDEN_TRAINER_TYPES_STORAGE_KEY_PREFIX}${mapId}`;
const raidCategoryMigrationKey = (mapId: string) => `${RAID_CATEGORY_MIGRATION_KEY_PREFIX}${mapId}`;
const questNpcCategoryMigrationKey = (mapId: string) => `${QUEST_NPC_CATEGORY_MIGRATION_KEY_PREFIX}${mapId}`;
const dungeonQuestCategoryMigrationKey = (mapId: string) => `${DUNGEON_QUEST_CATEGORY_MIGRATION_KEY_PREFIX}${mapId}`;
const gatherableCategoryMigrationKey = (mapId: string) => `${GATHERABLE_CATEGORY_MIGRATION_KEY_PREFIX}${mapId}`;
const writeCategories = (mapId: string, categories: string[]) => {
  localStorage.setItem(categoryStorageKey(mapId), JSON.stringify(categories));
  localStorage.setItem(raidCategoryMigrationKey(mapId), "true");
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
    ...NAMED_GATHERABLE_CATEGORY_IDS.filter((id) =>
      (id.startsWith("gatherable-herb-") && categories.includes("gatherable-herb"))
      || (id.startsWith("gatherable-ore-") && categories.includes("gatherable-ore"))),
    ...categories.map((id) => oldNamed[id]).filter((id): id is string => !!id),
  ])];
  writeCategories(mapId, migrated);
  localStorage.setItem(gatherableCategoryMigrationKey(mapId), "true");
  return migrated;
};
const readHiddenMarkerGroups = (mapId: string): UserMarkerGroup[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(hiddenMarkerGroupsStorageKey(mapId)) ?? "[]");
    return Array.isArray(parsed) ? MARKER_GROUPS.map(({ id }) => id).filter((id) => parsed.includes(id)) : [];
  } catch {
    return [];
  }
};

const readHiddenTrainerTypes = (mapId: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(hiddenTrainerTypesStorageKey(mapId)) ?? "[]");
    const valid = TRAINER_CATEGORIES.flatMap((category) => TRAINER_FILTER_IDS[category]
      .map((id) => trainerFilterKey(category, id)));
    return Array.isArray(parsed) ? valid.filter((key) => parsed.includes(key)) : [];
  } catch {
    return [];
  }
};

const readFactions = (): MapFaction[] => {
  try {
    const stored = localStorage.getItem(FACTIONS_STORAGE_KEY);
    if (stored === null) return [...MAP_FACTIONS];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [...MAP_FACTIONS];
    const selected = MAP_FACTIONS.filter((faction) => parsed.includes(faction));
    return selected.length ? selected : [...MAP_FACTIONS];
  } catch {
    return [...MAP_FACTIONS];
  }
};

const readStoredCategories = (mapId: string): string[] | null => {
  try {
    const stored = localStorage.getItem(categoryStorageKey(mapId));
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

const getDefaultCategories = (categoryCounts: Record<string, number>) =>
  DEFAULT_CATEGORY_IDS.filter((categoryId) =>
    (categoryCounts[categoryId] ?? 0) <= DEFAULT_CATEGORY_MARKER_LIMIT);

interface MapWorkspaceProps {
  active?: boolean;
  tourMapStep?: "filters" | "markers" | "map-tools" | null;
  filterFocusRequest?: MapFilterFocusRequest | null;
  onSelectedMarkerChange?: (marker: MapMarkerTarget | null) => void;
  onReturnToPanel?: () => void;
  returnDestination?: { mapId: string; pointId: string };
  compactSidebar?: boolean;
  controlsIntroVisible?: boolean;
  followLivePosition?: boolean;
  onToggleFollowLivePosition?: () => void;
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
  tourMapStep = null,
  filterFocusRequest = null,
  onSelectedMarkerChange,
  onReturnToPanel,
  returnDestination,
  compactSidebar = false,
  controlsIntroVisible = false,
  followLivePosition = false,
  onToggleFollowLivePosition,
  minimapMode = false,
  overlayMode = false,
}: MapWorkspaceProps) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const mapShortcuts = useMapShortcuts();
  const { definition: selectedMap, select: selectMap } = useSelectedMap();
  const { data, error, loading: mapDataLoading } = useMapData(selectedMap);
  const saved = useSavedMapState();
  const setCompletedGroup = saved.setCompletedGroup;
  const livePosition = useLivePosition();
  const referencePoint = useMapReferencePoint();
  const [query, setQuery] = useState("");
  const [sidebarMode, setSidebarMode] = useState<MapSidebarMode>("explore");
  const [gatheringRouteSelection, setGatheringRouteSelection] = useState<{ mapId: string; ids: string[] } | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const tourPreviewPointId = useRef<string | null>(null);
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
  const [hideCompleted, setHideCompleted] = useState(() => localStorage.getItem(HIDE_COMPLETED_STORAGE_KEY) === "true");
  const [hideFavorites, setHideFavorites] = useState(() => localStorage.getItem(HIDE_FAVORITES_STORAGE_KEY) === "true");
  const [factions, setFactions] = useState(readFactions);
  const [placementMode, setPlacementMode] = useState(false);
  const [draftSource, setDraftSource] = useState<"placement" | "coordinate" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false",
  );
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
    const stored = readStoredCategories(selectedMap.id);
    return { mapId: selectedMap.id, categories: stored ?? [], resolved: stored !== null };
  });
  const [markerGroupSelection, setMarkerGroupSelection] = useState(() => ({
    mapId: selectedMap.id,
    hiddenGroups: readHiddenMarkerGroups(selectedMap.id),
  }));
  const [trainerTypeSelection, setTrainerTypeSelection] = useState(() => ({
    mapId: selectedMap.id,
    hiddenTypes: readHiddenTrainerTypes(selectedMap.id),
  }));

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
  const hiddenMarkerGroups = markerGroupSelection.mapId === mapId
    ? markerGroupSelection.hiddenGroups : readHiddenMarkerGroups(mapId);
  const hiddenTrainerTypes = trainerTypeSelection.mapId === mapId
    ? trainerTypeSelection.hiddenTypes : readHiddenTrainerTypes(mapId);
  // Every window owns a workspace. Persisted filters must also update the
  // mounted workspace in desktop, in-game and minimap windows.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      if (event.key === categoryStorageKey(selectedMap.id) || event.key === null) {
        const stored = readStoredCategories(selectedMap.id);
        setCategorySelection({ mapId: selectedMap.id, categories: stored ?? [], resolved: stored !== null });
      }
      if (event.key === HIDE_COMPLETED_STORAGE_KEY || event.key === null) {
        setHideCompleted(localStorage.getItem(HIDE_COMPLETED_STORAGE_KEY) === "true");
      }
      if (event.key === HIDE_FAVORITES_STORAGE_KEY || event.key === null) {
        setHideFavorites(localStorage.getItem(HIDE_FAVORITES_STORAGE_KEY) === "true");
      }
      if (event.key === FACTIONS_STORAGE_KEY || event.key === null) setFactions(readFactions());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [selectedMap.id]);
  useEffect(() => {
    const storageKey = hiddenMarkerGroupsStorageKey(mapId);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        setMarkerGroupSelection({ mapId, hiddenGroups: readHiddenMarkerGroups(mapId) });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mapId]);
  useEffect(() => {
    const storageKey = hiddenTrainerTypesStorageKey(mapId);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        setTrainerTypeSelection({ mapId, hiddenTypes: readHiddenTrainerTypes(mapId) });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mapId]);

  const sourcePoints = useMemo(
    () => [...(data?.locations ?? []).filter((point) => !isLinkedQuestOfferPoint(point)), ...currentMapMarkers],
    [currentMapMarkers, data?.locations],
  );
  useEffect(() => {
    if (!active || minimapMode || !data) return;
    const frame = window.requestAnimationFrame(() => {
      if (tourMapStep === "filters") {
        tourPreviewPointId.current = null;
        setSelectedPoint(null);
        setSelectedDetail(null);
        setSelectedSource(null);
        setQuestGroupSelection(null);
        setPlacementMode(false);
        setSidebarMode("explore");
        setSidebarOpen(true);
        return;
      }
      if (tourMapStep === "markers") {
        const point = data.locations.find((location) => location.id === "AncientSpire-Springlands")
          ?? data.locations.find((location) => location.category === "wiki-ancient_spire")
          ?? data.locations[0];
        if (!point) return;
        tourPreviewPointId.current = point.id;
        setSelectedPoint(point);
        setSelectedDetail(null);
        setSelectedSource(null);
        setQuestGroupSelection(null);
        setPlacementMode(false);
        setSidebarMode("explore");
        setSidebarOpen(true);
        return;
      }
      const previewId = tourPreviewPointId.current;
      if (previewId) {
        tourPreviewPointId.current = null;
        setSelectedPoint((current) => current?.id === previewId ? null : current);
        setSelectedDetail(null);
      }
      if (tourMapStep === "map-tools") setSidebarOpen(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, data, minimapMode, tourMapStep]);
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
    return sourcePoints.reduce<Record<string, number>>((counts, point) => {
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
  }, [sourcePoints]);

  const { foundCategoryCounts, foundMarkerGroupCounts } = useMemo(() => {
    const completed = new Set(completedIds);
    const countedBooks = new Set<string>();
    const categories: Record<string, number> = {};
    const markerGroups: Partial<Record<UserMarkerGroup, number>> = {};
    for (const point of sourcePoints) {
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
  }, [sourcePoints, completedIds]);

  const activeCategories = useMemo(() => {
    if (categorySelection.mapId === selectedMap.id && categorySelection.resolved) {
      return categorySelection.categories;
    }
    const stored = readStoredCategories(selectedMap.id);
    if (stored !== null) return stored;
    return mapDataLoading || !data ? [] : getDefaultCategories(categoryCounts);
  }, [categoryCounts, categorySelection, data, mapDataLoading, selectedMap.id]);

  const allPoints = sourcePoints;
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
  const searchDocuments = useMemo(() => allPoints.filter((point) => point.category !== "point-of-interest")
    .map((point) => createMapSearchDocument(
    point,
    [point.name, isUserMapMarker(point) ? point.name : gameText(point.name), point.label, gameText(point.label), "detailLabel" in point ? point.detailLabel ?? "" : "",
      ...("questOffers" in point ? (point.questOffers ?? []).map((offer) => offer.name) : []),
      ...getMapCompanionSources(point).map(({ companion }) => companion.name)],
    [point.region, gameText(point.region), point.label, gameText(point.label), point.subtype, point.x, point.y].join(" "),
  )), [allPoints, gameText]);

  const locationMatches = useMemo(
    () => searchMapDocuments(searchDocuments, query)
      .filter(({ point }) => isPointVisibleForFactions(point, factions)),
    [query, factions, searchDocuments],
  );
  const locationResults = useMemo(() => {
    const groups = groupMapSearchMatches(rankMapSearchMatches(locationMatches, searchOrigin), LOCATION_RESULT_LIMIT);
    if (!coordinatePoint) return groups;
    return [
      { point: coordinatePoint, score: -1, count: 1 },
      ...groups.filter(({ point }) => point.id !== coordinatePoint.id),
    ];
  }, [coordinatePoint, locationMatches, searchOrigin]);

  // The pins the map keeps while a search is running — every match, uncapped,
  // even though the dropdown lists only the strongest leads.
  const searchMatchIds = useMemo(
    () => new Set(locationMatches.map(({ point }) => point.id)),
    [locationMatches],
  );

  const visiblePoints = useMemo(() => {
    const searching = query.trim().length > 0;
    const matches = allPoints.filter((point) => {
      if (isUserMapMarker(point) && hiddenMarkerGroups.includes(point.group ?? DEFAULT_MARKER_GROUP)) return false;
      if (!isPointVisibleForFactions(point, factions)) return false;
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
    return ["enemy", "bestiary-fell", "bestiary-scavengers", "bestiary-vukah", "bestiary-hollow", "bestiary-drak", "bestiary-bosses"]
      .reduce((points, category) => groupNearbySameNameLocations(points, category,
        mapSize * NEARBY_ENEMY_RADIUS_RATIO, protectedIds), filtered);
  }, [activeCategories, allPoints, completedIds, coordinatePoint, data, hiddenMarkerGroups, hiddenTrainerTypes, hideCompleted, hideFavorites, factions, query, searchMatchIds, saved.favoriteIds, sidebarMode]);

  useEffect(() => {
    localStorage.setItem(HIDE_COMPLETED_STORAGE_KEY, String(hideCompleted));
  }, [hideCompleted]);

  useEffect(() => {
    localStorage.setItem(HIDE_FAVORITES_STORAGE_KEY, String(hideFavorites));
  }, [hideFavorites]);

  useEffect(() => {
    localStorage.setItem(FACTIONS_STORAGE_KEY, JSON.stringify(factions));
  }, [factions]);

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
  useEffect(() => () => window.clearTimeout(searchReportRef.current), []);

  // Configured shortcuts close things innermost-first and focus map search.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!minimapMode && matchesMapShortcut(event, mapShortcuts.search, "search")) {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>("#map-search-input");
        window.requestAnimationFrame(() => searchInput?.focus());
      }
      if (matchesMapShortcut(event, mapShortcuts.close, "close")) {
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
  }, [active, mapShortcuts, minimapMode, placementMode, questGroup, selectedReferenceHistory.length, selectedPoint, sidebarOpen]);

  // Resolve edited markers and reward-layer presentation while retaining a
  // selected nearby group's coordinates. Keep this stable for focus effects.
  const resolvedSelectedPoint = useMemo(() => {
    if (!selectedPoint) return null;
    if (isDraftMarker(selectedPoint)) return selectedPoint;
    if (selectedPoint.subtype === "custom") return saved.markers.find((marker) => marker.id === selectedPoint.id) ?? null;
    const current = allPoints.find((point) => point.id === selectedPoint.id);
    return current ? { ...current, x: selectedPoint.x, y: selectedPoint.y,
      ...("occurrences" in selectedPoint ? { occurrences: selectedPoint.occurrences } : {}) } : selectedPoint;
  }, [allPoints, saved.markers, selectedPoint]);
  const flightRouteKey = `${mapId}:${resolvedSelectedPoint?.id ?? ""}`;
  const hiddenFlightRouteIds = hiddenFlightRoutesByPoint[flightRouteKey] ?? [];

  useEffect(() => {
    if (resolvedSelectedPoint && !isDraftMarker(resolvedSelectedPoint)) saveMapReferencePoint(resolvedSelectedPoint);
  }, [resolvedSelectedPoint]);
  const poiLabelPoints = useMemo(
    () => data?.locations.filter((point) => point.category === "point-of-interest") ?? [],
    [data?.locations],
  );
  // Keep the canvas sprite registry alive across player-position/status ticks.
  const visibleMarkerPoints = useMemo(
    () => visiblePoints.filter((point) => point.category !== "point-of-interest"),
    [visiblePoints],
  );
  const renderedPoints = useMemo(() => {
    return resolvedSelectedPoint && resolvedSelectedPoint.category !== "point-of-interest"
      && !visibleMarkerPoints.some((point) => point.id === resolvedSelectedPoint.id)
      ? [...visibleMarkerPoints, resolvedSelectedPoint]
      : visibleMarkerPoints;
  }, [resolvedSelectedPoint, visibleMarkerPoints]);

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
        window.requestAnimationFrame(() => document.getElementById("map-search-input")?.focus());
        return;
      }
      if (!data || (request.mapId && data.id !== request.mapId)) return;
      if (request.regionOnly) {
        localStorage.removeItem(MAP_FOCUS_REQUEST_KEY);
        setSelectedPoint(null);
        setFocusPoint({ point: createMapOverviewFocusPoint(data) });
        setQuery("");
        setSelectedDetail(null);
        setSidebarOpen(false);
        return;
      }
      const point = resolveMapFocusPoint(request, data, sourcePoints);
      if (!point) return;
      if (request.destination?.companionId || point.category === "rift") {
        const categories = [...new Set([...activeCategories, point.category])];
        writeCategories(selectedMap.id, categories);
        setCategorySelection({ mapId: selectedMap.id, categories, resolved: true });
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
  }, [active, activeCategories, sourcePoints, data, minimapMode, selectedMap.id, selectMap]);

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
    writeCategories(selectedMap.id, categories);
    setCategorySelection({ mapId: selectedMap.id, categories, resolved: true });
  };
  const applyHiddenMarkerGroups = (groups: UserMarkerGroup[]) => {
    localStorage.setItem(hiddenMarkerGroupsStorageKey(mapId), JSON.stringify(groups));
    setMarkerGroupSelection({ mapId, hiddenGroups: groups });
  };
  const applyHiddenTrainerTypes = (types: string[]) => {
    localStorage.setItem(hiddenTrainerTypesStorageKey(mapId), JSON.stringify(types));
    setTrainerTypeSelection({ mapId, hiddenTypes: types });
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

  const filtersOpen = sidebarOpen && !resolvedSelectedPoint && !questGroup && sidebarMode === "explore";

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
      {!minimapMode && (
        // Single top row: filter and marker buttons on the left, region jump and search right.
        <div className="pointer-events-none absolute inset-x-5 top-5 z-50 flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <MapPrimaryControls
              filtersOpen={filtersOpen}
              activeFilterCount={FILTER_CATEGORIES.filter(({ id }) => activeCategories.includes(id)).length
                + MARKER_GROUPS.filter(({ id }) => (markerGroupCounts[id] ?? 0) > 0 && !hiddenMarkerGroups.includes(id)).length}
              onToggleFilters={() => togglePanel("explore")}
              placementMode={placementMode}
              onTogglePlacement={() => setPlacementMode((current) => !current)}
            />
            {selectedMap.id !== DEFAULT_MAP_ID && <button type="button"
              onClick={() => { setReturnPanel(null); requestMapDestinationInMain(DEFAULT_MAP_ID); }}
              className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-xs text-white shadow-lg">
              <ArrowLeft size={14} aria-hidden="true" />{t("map.instanceMaps.backToWorld")}
            </button>}
          </div>
          <MapSearchOverlay
            mapId={data.id}
            mapName={data.displayName}
            query={query}
            locations={locationResults}
            regions={data.regions}
            onQueryChange={handleQueryChange}
            onSelect={(point) => selectPoint(point, "sidebar")}
            onNavigate={(nextMapId, markerId, context) => {
              if (hasMapDefinition(nextMapId)) requestMapPointInMain(markerId, nextMapId, context);
            }}
            onSelectRegion={focusRegion}
          />
        </div>
      )}
      {!minimapMode && (
        <MapSidebar
          data={data}
          filterFocusRequest={filterFocusRequest}
          tourFiltersOpen={tourMapStep === "filters"}
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
          selectedPoint={resolvedSelectedPoint}
          questGroup={questGroup}
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
          mode={sidebarMode}
          open={sidebarOpen}
          compact={compactSidebar}
          activeCategories={activeCategories}
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
          onToggleFaction={(faction) => setFactions((current) => {
            const next = current.includes(faction)
              ? current.filter((item) => item !== faction)
              : MAP_FACTIONS.filter((item) => item === faction || current.includes(item));
            return next.length ? next : [...MAP_FACTIONS];
          })}
          onSelectPoint={(point) => selectPoint(point, "sidebar")}
          onToggleFavorite={saved.toggleFavorite}
          onToggleCompleted={(id) => {
            const group = bookLocationGroup(sourcePoints, id);
            if (group.length > 1) saved.setCompletedGroup(group, !completedIds.includes(id));
            else saved.toggleCompleted(id);
          }}
          onToggleHideCompleted={() => setHideCompleted((current) => !current)}
          onToggleHideFavorites={() => setHideFavorites((current) => !current)}
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
          data={data}
          trackedInsetId={destinationInset?.id}
          onTrackedInsetVisibilityChange={destinationInsetKey ? (visible) => {
            setTrackedInsetVisibility({ key: destinationInsetKey, visible });
          } : undefined}
          points={renderedPoints}
          poiLabelPoints={poiLabelPoints}
          completedIds={completedIds}
          selectedPoint={resolvedSelectedPoint}
          hiddenFlightRouteIds={hiddenFlightRouteIds}
          gatheringRoute={gatheringRoute}
          focusPoint={focusPoint}
          placementMode={placementMode}
          livePosition={livePosition}
          followLivePosition={followLivePosition}
          onToggleFollowLivePosition={onToggleFollowLivePosition}
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
    </div>
  );
};

export default MapWorkspace;
