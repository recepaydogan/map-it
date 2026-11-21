import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import {
  recordMarkerOpened,
  type MarkerOpenSource,
} from "../../services/analytics/map-events";
import { reportMapPageview } from "../../state/use-analytics";
import { useLivePosition } from "../live-position/live-position-store";
import { useLivePositionWindowSource } from "../live-position/use-live-position-window-source";
import BridgeModNotice from "../live-bridge/bridge-mod-notice";
import { shouldAutoStartOnboarding, useOnboardingActive } from "../onboarding/use-onboarding";
import CustomMarkerDialog, { type CustomMarkerDraft } from "./custom-marker-dialog";
import MapRouteFeedback from "./map-route-feedback";
import type { RouteFeedbackStatus } from "./route-feedback-context";
import InteractiveMap from "./interactive-map";
import { DEFAULT_MARKER_GROUP, MARKER_GROUPS } from "./marker-group-config";
import { DEFAULT_CATEGORY_IDS, RECOMMENDED_OBJECT_CATEGORY_IDS } from "./map-config";
import { createMapSearchDocument, groupMapSearchMatches, searchMapDocuments } from "./map-fuzzy-search";
import { searchMapItems } from "./map-item-search";
import { useMapItemSearchIndex } from "./use-map-item-search-index";
import { mergeLocationLootProfile } from "./map-loot-utils";
import MapPrimaryControls from "./map-primary-controls";
import { localizeMapObjectPoint } from "./map-point-localization";
import MapSearchOverlay from "./map-search-overlay";
import MapDataState from "./map-data-state";
import MapCollapsibleToolbar from "./map-collapsible-toolbar";
import { BUILTIN_MAP_ID } from "./map-library-config";
import { MAX_ROUTE_WAYPOINTS } from "./map-route-utils";
import { resolveLootRunStart, type LootRunStart } from "./loot-run-planner/loot-run-start";
import useLootRunOrigin from "./loot-run-planner/use-loot-run-origin";
import useLootRunPlanner from "./loot-run-planner/use-loot-run-planner";
import MapSidebar from "./map-sidebar";
import type { MapSidebarMode } from "./map-sidebar-mode-tabs";
import { MAP_FOCUS_REQUEST_KEY } from "./map-window-bridge";
import { getSearchSelectionFloor, isPointVisibleOnFloor } from "./map-floor-visibility";
import OverlayLootPanel from "./overlay-loot-panel";
import { saveMapReferencePoint } from "./use-map-reference-point";
import {
  isUserMapMarker,
  type MapCoordinate,
  type MapLocation,
  type MapPoint,
  type MapRouteWaypoint,
  type SavedMapRoute,
  type UserMarkerGroup,
  type UserMapMarker,
} from "./types";
import { useMapData } from "./use-map-data";
import { useMapLibrary } from "./use-map-library";
import { useSavedMapState } from "./use-saved-map-state";
import { useSynchronizedMapFloor } from "./use-synchronized-map-floor";
import useUsefulObjectsOnboarding from "./use-useful-objects-onboarding";

/** Typing pause after which a search is reported once, not per keystroke. */
const SEARCH_REPORT_DELAY_MS = 900;

const LEGACY_CATEGORY_STORAGE_KEY = "pzim:active-categories";
const CATEGORY_STORAGE_KEY_PREFIX = "pzim:active-categories:";
const DEFAULT_CATEGORY_MARKER_LIMIT = 1_000;
const SIDEBAR_STORAGE_KEY = "pzim:sidebar-open";
const HIDDEN_MARKER_GROUPS_STORAGE_KEY = "pzim:hidden-marker-groups";
const HIDDEN_ROUTES_STORAGE_KEY = "pzim:hidden-routes";
const POINT_FILTERS_STORAGE_KEY = "pzim:point-filters";

interface PointFilters {
  hideLooted: boolean;
  hideFavorites: boolean;
}

const readPointFilters = (): PointFilters => {
  try {
    const value = JSON.parse(localStorage.getItem(POINT_FILTERS_STORAGE_KEY) ?? "{}") as (
      Partial<PointFilters> & { hideCompleted?: boolean }
    );
    return {
      hideLooted: value.hideLooted === true || value.hideCompleted === true,
      hideFavorites: value.hideFavorites === true,
    };
  } catch {
    return { hideLooted: false, hideFavorites: false };
  }
};

const readHiddenRouteIds = () => {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_ROUTES_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
};

export interface MapWorkspaceHandle {
  openModLibrary: () => void;
  openModRequest: () => void;
}

interface MapWorkspaceProps {
  ref?: Ref<MapWorkspaceHandle>;
  active?: boolean;
  compactSidebar?: boolean;
  controlsIntroVisible?: boolean;
  toolbarExpanded?: boolean;
  onToolbarExpandedChange?: (expanded: boolean) => void;
  followLivePosition?: boolean;
  onToggleFollowLivePosition?: () => void;
  minimapMode?: boolean;
  overlayMode?: boolean;
}

/** Place rows the dropdown shows. Items claim the rest of its height. */
const LOCATION_RESULT_LIMIT = 6;

const categoryStorageKey = (mapKey: string) =>
  `${CATEGORY_STORAGE_KEY_PREFIX}${mapKey}`;

const readStoredCategories = (mapKey: string): string[] | null => {
  try {
    const stored = localStorage.getItem(categoryStorageKey(mapKey))
      ?? (mapKey === BUILTIN_MAP_ID ? localStorage.getItem(LEGACY_CATEGORY_STORAGE_KEY) : null);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const getDefaultCategories = (categoryCounts: Record<string, number>) =>
  DEFAULT_CATEGORY_IDS.filter((categoryId) =>
    (categoryCounts[categoryId] ?? 0) <= DEFAULT_CATEGORY_MARKER_LIMIT);

const countPointCategories = (points: MapPoint[]) =>
  points.reduce<Record<string, number>>((counts, point) => {
    counts[point.category] = (counts[point.category] ?? 0) + 1;
    return counts;
  }, {});

const createDraftRoutePoints = (points: Array<MapCoordinate & { label?: string }>): MapRouteWaypoint[] => {
  const timestamp = Date.now();
  return points.slice(0, MAX_ROUTE_WAYPOINTS).map((point, index) => ({
    id: `draft-waypoint-${timestamp}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    x: Math.round(point.x),
    y: Math.round(point.y),
    ...(point.label ? { label: point.label.slice(0, 200) } : {}),
  }));
};

const MapWorkspace = ({
  ref,
  active = true,
  compactSidebar = false,
  controlsIntroVisible = false,
  toolbarExpanded = true,
  onToolbarExpandedChange,
  followLivePosition = false,
  onToggleFollowLivePosition,
  minimapMode = false,
  overlayMode = false,
}: MapWorkspaceProps) => {
  const { t } = useTranslation();
  const mapLibrary = useMapLibrary();
  const { refreshPreparedCatalog } = mapLibrary;
  const { data, error, loading: mapDataLoading } = useMapData(mapLibrary.selectedMap);
  const categoryScopeKey = mapLibrary.selectedMap.includesBuiltinMap !== false
    ? BUILTIN_MAP_ID
    : mapLibrary.selectedMap.key;
  const saved = useSavedMapState();
  const livePosition = useLivePosition();
  const onboardingActive = useOnboardingActive();
  const [firstRunOnboarding] = useState(shouldAutoStartOnboarding);
  // This window reads the Bridge file for itself while a player exists, so the
  // marker is fed by an even stream rather than by cross-window events.
  useLivePositionWindowSource(livePosition.status !== "disconnected");
  const [query, setQuery] = useState("");
  const { floor: activeFloor, setFloor: setActiveFloor } = useSynchronizedMapFloor();
  const [sidebarMode, setSidebarMode] = useState<MapSidebarMode>("explore");
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [focusPoint, setFocusPoint] = useState<MapPoint | null>(null);
  const [focusRoute, setFocusRoute] = useState<SavedMapRoute | null>(null);
  const [pendingMarker, setPendingMarker] = useState<CustomMarkerDraft | null>(null);
  const placementMode = pendingMarker !== null && pendingMarker.marker.mapId === data?.id;
  const [routeBuildFeedback, setRouteBuildFeedback] = useState<{ mapId: string; status: RouteFeedbackStatus } | null>(null);
  const [markerDraft, setMarkerDraft] = useState<CustomMarkerDraft | null>(null);
  const closeMarkerDialog = useCallback(() => setMarkerDraft(null), []);
  const [draftRoute, setDraftRoute] = useState<{ mapId: string; points: MapRouteWaypoint[] } | null>(null);
  const [routesOpen, setRoutesOpen] = useState(false);
  const [detailsRouteId, setDetailsRouteId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [modRequestFocusId, setModRequestFocusId] = useState(0);
  const modRequestInputRef = useRef<HTMLTextAreaElement>(null);
  const pendingModRequestFocus = useRef(false);

  const openModLibrary = useCallback(() => {
    void refreshPreparedCatalog();
    setLibraryOpen(true);
    setRoutesOpen(false);
    setSelectedPoint(null);
    setSidebarMode("explore");
  }, [refreshPreparedCatalog]);

  useImperativeHandle(ref, () => ({
    openModLibrary,
    openModRequest: () => {
      pendingModRequestFocus.current = true;
      setModRequestFocusId((current) => current + 1);
      openModLibrary();
    },
  }), [openModLibrary]);

  useEffect(() => {
    // Keep the intent until the map and its existing request form are mounted.
    if (!active || !libraryOpen || !pendingModRequestFocus.current || !modRequestInputRef.current) return;
    modRequestInputRef.current.focus({ preventScroll: true });
    modRequestInputRef.current.form?.scrollIntoView({ block: "nearest" });
    pendingModRequestFocus.current = false;
  }, [active, libraryOpen, modRequestFocusId, mapLibrary.loading, data]);
  const [hiddenRouteIds, setHiddenRouteIds] = useState<string[]>(readHiddenRouteIds);
  const [pointFilters, setPointFilters] = useState<PointFilters>(readPointFilters);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false",
  );
  const [hiddenMarkerGroups, setHiddenMarkerGroups] = useState<UserMarkerGroup[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(HIDDEN_MARKER_GROUPS_STORAGE_KEY) ?? "[]") as unknown;
      const validGroups = new Set<UserMarkerGroup>(MARKER_GROUPS.map(({ id }) => id));
      return Array.isArray(value)
        ? value.filter((group): group is UserMarkerGroup => typeof group === "string" && validGroups.has(group as UserMarkerGroup))
        : [];
    } catch {
      return [];
    }
  });
  const [categorySelection, setCategorySelection] = useState(() => {
    const stored = readStoredCategories(categoryScopeKey);
    return {
      mapKey: categoryScopeKey,
      categories: stored ?? [],
      resolved: stored !== null,
    };
  });
  const routeMode = Boolean(draftRoute && draftRoute.mapId === data?.id);
  const draftRoutePoints = draftRoute && draftRoute.mapId === data?.id ? draftRoute.points : [];
  const currentMapMarkers = useMemo(
    () => saved.markers.filter((marker) => (marker.mapId ?? BUILTIN_MAP_ID) === data?.id),
    [data?.id, saved.markers],
  );
  const resolvedSelectedPoint = selectedPoint?.subtype === "custom"
    ? saved.markers.find((marker) => marker.id === selectedPoint.id) ?? null
    : selectedPoint;

  const localizedLocations = useMemo(
    () => (data?.locations ?? []).map((point) => localizeMapObjectPoint(
      point,
      (key, fallback) => t(key, { defaultValue: fallback }),
    )),
    [data?.locations, t],
  );
  const allPoints = useMemo(
    () => [...localizedLocations, ...currentMapMarkers],
    [currentMapMarkers, localizedLocations],
  );

  const surfacePoints = useMemo(
    () => allPoints.filter((point) => isPointVisibleOnFloor(point, 0)),
    [allPoints],
  );
  const floorScopedPoints = useMemo(
    () => allPoints.filter((point) => isPointVisibleOnFloor(point, activeFloor)),
    [activeFloor, allPoints],
  );
  const categoryCounts = useMemo(
    () => countPointCategories(floorScopedPoints),
    [floorScopedPoints],
  );
  const defaultCategoryCounts = useMemo(
    () => countPointCategories(surfacePoints),
    [surfacePoints],
  );

  const usefulObjectsAvailable = RECOMMENDED_OBJECT_CATEGORY_IDS.some(
    (categoryId) => (categoryCounts[categoryId] ?? 0) > 0,
  );
  const filtersPanelOpen = sidebarOpen
    && !resolvedSelectedPoint
    && sidebarMode === "explore"
    && !libraryOpen;
  const usefulObjectsOnboarding = useUsefulObjectsOnboarding({
    eligible: active
      && !compactSidebar
      && !minimapMode
      && !overlayMode
      && !mapDataLoading
      && usefulObjectsAvailable,
    menuOpen: filtersPanelOpen,
    blocked: onboardingActive || controlsIntroVisible,
    firstRun: firstRunOnboarding,
    onboardingActive,
  });

  const activeCategories = useMemo(() => {
    if (categorySelection.mapKey === categoryScopeKey && categorySelection.resolved) {
      return categorySelection.categories;
    }
    const stored = readStoredCategories(categoryScopeKey);
    if (stored !== null) return stored;
    return mapDataLoading || !data ? [] : getDefaultCategories(defaultCategoryCounts);
  }, [categoryScopeKey, categorySelection, data, defaultCategoryCounts, mapDataLoading]);

  const markerGroupCounts = useMemo(
    () => currentMapMarkers
      .filter((marker) => isPointVisibleOnFloor(marker, activeFloor))
      .reduce<Partial<Record<UserMarkerGroup, number>>>((counts, marker) => {
      const group = marker.group ?? DEFAULT_MARKER_GROUP;
      counts[group] = (counts[group] ?? 0) + 1;
      return counts;
    }, {}),
    [activeFloor, currentMapMarkers],
  );

  const lootRunOrigin = useLootRunOrigin(data, livePosition);
  const [lootStartState, setLootStartState] = useState<{ mapId: string; choice: LootRunStart; picking: boolean } | null>(null);
  const lootStartChoice: LootRunStart = lootStartState && lootStartState.mapId === data?.id
    ? lootStartState.choice : { mode: "current" };
  const pickingLootStart = Boolean(lootStartState?.mapId === data?.id && lootStartState?.picking
    && sidebarOpen && sidebarMode === "runs" && !libraryOpen && !resolvedSelectedPoint && !placementMode && !routeMode);
  const lootStartPosition = resolveLootRunStart(lootStartChoice, data, lootRunOrigin.position, currentMapMarkers);
  const cancelLootStartPick = useCallback(() => setLootStartState((current) => current ? { ...current, picking: false } : current), []);
  const chooseLootStartPoint = (point: MapCoordinate) => {
    if (!data) return;
    setLootStartState({ mapId: data.id, choice: { mode: "point", point: { x: Math.round(point.x), y: Math.round(point.y) } }, picking: false });
  };
  const lootRun = useLootRunPlanner({
    data: minimapMode ? null : data,
    position: lootRunOrigin.position,
    startPosition: lootStartPosition,
    startChoice: lootStartChoice,
    lootRuns: saved.lootRuns,
    startRun: saved.startLootRun,
    toggleLocation: saved.toggleLootRunLocation,
    clearRun: saved.clearLootRun,
    replaceRoute: saved.replaceRoute,
    clearLootRoute: saved.clearLootRoute,
  });

  const coordinatePoint = useMemo<MapPoint | null>(() => {
    if (!data) return null;
    const match = query.match(/(-?\d{1,5})\D+(-?\d{1,5})/);
    if (!match) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (x < data.bounds.minX || x > data.bounds.maxX || y < data.bounds.minY || y > data.bounds.maxY) return null;
    return {
      id: `coordinate-${x}-${y}`,
      name: t("map.search.coordinateName", { x, y }),
      category: "custom",
      label: t("map.search.coordinateResult"),
      subtype: "coordinate",
      townId: "coordinate",
      town: t("map.search.coordinate"),
      x,
      y,
    };
  }, [data, query, t]);

  // What a place ANSWERS TO stays separate from what merely describes it: a
  // building type or a room name is real evidence, but it can never outrank
  // someone typing an actual name. Loot is no longer folded in here at all —
  // items get their own section, with the buildings that spawn them nested
  // underneath, instead of dumping unexplained buildings into this list.
  const searchDocuments = useMemo(() => allPoints.map((point) => {
    const location = point.category !== "custom" ? point as MapLocation : null;
    const context = [
      point.town,
      point.label,
      point.subtype,
      location?.buildingType ?? "",
      location?.roomTypes?.join(" ") ?? "",
      point.x,
      point.y,
    ].join(" ");
    return createMapSearchDocument(point, [point.name, point.label], context);
  }), [allPoints]);

  const locationMatches = useMemo(
    () => searchMapDocuments(searchDocuments, query, lootRunOrigin.position),
    [lootRunOrigin.position, query, searchDocuments],
  );
  const locationResults = useMemo(() => {
    const groups = groupMapSearchMatches(locationMatches, LOCATION_RESULT_LIMIT);
    if (!coordinatePoint) return groups;
    return [
      { point: coordinatePoint, score: -1, count: 1 },
      ...groups.filter(({ point }) => point.id !== coordinatePoint.id),
    ];
  }, [coordinatePoint, locationMatches]);

  const itemSearchIndex = useMapItemSearchIndex(
    minimapMode ? null : data,
    query.trim().length > 0,
  );
  const itemResults = useMemo(
    () => searchMapItems(itemSearchIndex, query, lootRunOrigin.position),
    [itemSearchIndex, lootRunOrigin.position, query],
  );

  // The pins the map keeps while a search is running: everything the query named
  // by name, plus every building that spawns a matched item — uncapped, so the
  // map answers "where is this item" in full even though the dropdown lists only
  // the strongest leads.
  const searchMatchIds = useMemo(() => new Set([
    ...locationMatches.map(({ point }) => point.id),
    ...itemResults.flatMap(({ locationIds }) => locationIds),
  ]), [itemResults, locationMatches]);

  const visiblePoints = useMemo(() => {
    const searching = query.trim().length > 0;
    const matches = floorScopedPoints.filter((point) => {
      if (pointFilters.hideLooted && saved.lootedLocationIds.includes(point.id)) return false;
      if (pointFilters.hideFavorites && saved.favoriteIds.includes(point.id)) return false;
      if (!activeCategories.includes(point.category)) return false;
      if (isUserMapMarker(point) && hiddenMarkerGroups.includes(point.group ?? DEFAULT_MARKER_GROUP)) return false;
      if (
        sidebarMode === "saved" &&
        point.category !== "custom" &&
        !saved.favoriteIds.includes(point.id) &&
        !saved.lootedLocationIds.includes(point.id)
      ) return false;
      return !searching || searchMatchIds.has(point.id);
    });
    return coordinatePoint && activeCategories.includes("custom") && sidebarMode !== "saved"
      ? [coordinatePoint, ...matches]
      : matches;
  }, [activeCategories, coordinatePoint, floorScopedPoints, hiddenMarkerGroups, pointFilters, query, searchMatchIds, saved.favoriteIds, saved.lootedLocationIds, sidebarMode]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem(HIDDEN_MARKER_GROUPS_STORAGE_KEY, JSON.stringify(hiddenMarkerGroups));
  }, [hiddenMarkerGroups]);

  useEffect(() => {
    localStorage.setItem(POINT_FILTERS_STORAGE_KEY, JSON.stringify(pointFilters));
  }, [pointFilters]);

  // The sidebar modes are this app's "pages" (/map, /map/saved, …). The minimap
  // overlay renders no sidebar, so it never reports pageviews.
  const dataId = data?.id;
  useEffect(() => {
    if (!active || minimapMode || !dataId) return;
    reportMapPageview(sidebarMode, dataId);
  }, [active, dataId, minimapMode, sidebarMode]);

  // One MAP_SEARCHED per settled query, not one per keystroke.
  const searchReportRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(searchReportRef.current), []);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!minimapMode && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onToolbarExpandedChange?.(true);
        const searchInput = document.querySelector<HTMLInputElement>("#map-search-input");
        window.requestAnimationFrame(() => searchInput?.focus());
      }
      if (event.key === "Escape") {
        if (pickingLootStart) { cancelLootStartPick(); return; }
        if (minimapMode) {
          if (selectedPoint) setSelectedPoint(null);
          return;
        }
        if (placementMode) {
          setPendingMarker(null);
          return;
        }
        if (routeMode) {
          setDraftRoute(null);
          setRouteBuildFeedback(null);
          return;
        }
        if (selectedPoint) {
          setSelectedPoint(null);
          return;
        }
        if (libraryOpen) {
          setLibraryOpen(false);
          return;
        }
        if (sidebarOpen) setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, libraryOpen, minimapMode, onToolbarExpandedChange, placementMode, routeMode, selectedPoint, sidebarOpen, pickingLootStart, cancelLootStartPick]);

  useEffect(() => {
    if (resolvedSelectedPoint) saveMapReferencePoint(resolvedSelectedPoint);
  }, [resolvedSelectedPoint]);
  const renderedPoints = resolvedSelectedPoint && !visiblePoints.some((point) => point.id === resolvedSelectedPoint.id)
    ? [...visiblePoints, resolvedSelectedPoint]
    : visiblePoints;

  useEffect(() => {
    if (minimapMode) return;
    const focusRequestedPoint = (event: Event) => {
      if (event instanceof StorageEvent
        && event.key !== MAP_FOCUS_REQUEST_KEY
        && event.key !== null) return;
      try {
        const request = JSON.parse(localStorage.getItem(MAP_FOCUS_REQUEST_KEY) ?? "null") as { pointId?: string } | null;
        const point = allPoints.find((candidate) => candidate.id === request?.pointId);
        if (!point) return;
        setActiveFloor(getSearchSelectionFloor(point, activeFloor));
        setSelectedPoint(point);
        setFocusPoint({ ...point });
        setSidebarOpen(true);
      } catch {
        // Ignore malformed local requests and keep the current map view.
      }
    };
    window.addEventListener("storage", focusRequestedPoint);
    window.addEventListener(MAP_FOCUS_REQUEST_KEY, focusRequestedPoint);
    return () => {
      window.removeEventListener("storage", focusRequestedPoint);
      window.removeEventListener(MAP_FOCUS_REQUEST_KEY, focusRequestedPoint);
    };
  }, [activeFloor, allPoints, minimapMode, setActiveFloor]);

  if (mapLibrary.loading || !data) return <MapDataState error={mapLibrary.error} compact={minimapMode} />;

  const beginMarker = (coordinate: MapCoordinate, floor: number, source: "placement" | "coordinate", useForLootBase = false) => {
    cancelLootStartPick();
    setPendingMarker(null);
    setDraftRoute(null);
    setMarkerDraft({
      source,
      chooseLocation: source === "placement",
      useForLootBase,
      note: "",
      marker: {
        id: `custom-${Date.now()}-${crypto.getRandomValues(new Uint32Array(2)).join("-")}`,
        name: useForLootBase ? t("map.lootRun.start.myBase") : "",
        category: "custom",
        subtype: "custom",
        label: t("map.categories.custom"),
        townId: "personal",
        town: t("map.custom.personal"),
        x: Math.round(coordinate.x), y: Math.round(coordinate.y),
        floors: [floor], color: "sage", icon: "pin", group: useForLootBase ? "safehouses" : DEFAULT_MARKER_GROUP,
        mapId: data.id,
      },
    });
  };

  const mapRoutes = saved.routes.filter((route) => route.mapId === data.id);
  const visibleRouteIds = mapRoutes
    .filter((route) => !hiddenRouteIds.includes(route.id))
    .map((route) => route.id);

  const updateHiddenRoutes = (updater: (current: string[]) => string[]) => {
    setHiddenRouteIds((current) => {
      const next = updater(current);
      localStorage.setItem(HIDDEN_ROUTES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const startRoute = (points: Array<MapCoordinate & { label?: string }> = []) => {
    setRouteBuildFeedback(null);
    setDraftRoute({ mapId: data.id, points: createDraftRoutePoints(points) });
    setPendingMarker(null);
    setRoutesOpen(false);
  };

  const addRoutePoint = (coordinate: { x: number; y: number }, label?: string) => {
    setDraftRoute((current) => {
      if (!current || current.mapId !== data.id || current.points.length >= MAX_ROUTE_WAYPOINTS) return current;
      return {
        ...current,
        points: [...current.points, {
          id: `draft-waypoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          x: Math.round(coordinate.x),
          y: Math.round(coordinate.y),
          ...(label ? { label: label.slice(0, 200) } : {}),
        }],
      };
    });
  };

  const navigateToRoute = (route: SavedMapRoute) => {
    if (route.points.length === 0) return;
    updateHiddenRoutes((current) => current.filter((id) => id !== route.id));
    setSelectedPoint(null);
    setFocusPoint(null);
    setFocusRoute({ ...route, points: [...route.points] });
    setRoutesOpen(false);
    setSidebarOpen(false);
  };

  const saveDraftRoute = () => {
    if (!routeMode || draftRoutePoints.length < 2) return;
    try {
      const route = saved.saveRoute(data.id, draftRoutePoints);
      if (!route) {
        setRouteBuildFeedback({ mapId: data.id, status: "error" });
        return;
      }
      setRouteBuildFeedback(null);
      setDraftRoute(null);
      navigateToRoute(route);
    } catch (routeError) {
      console.error("Failed to save map route.", routeError);
      setRouteBuildFeedback({ mapId: data.id, status: "error" });
    }
  };

  /** Writes the visible layer set once, so every filter control (single
   *  toggle, group checkbox, "Only") persists through the same path. */
  const applyCategories = (categories: string[]) => {
    localStorage.setItem(categoryStorageKey(categoryScopeKey), JSON.stringify(categories));
    setCategorySelection({ mapKey: categoryScopeKey, categories, resolved: true });
  };

  const persistMarker = (marker: UserMapMarker, note: string, source: CustomMarkerDraft["source"], useForLootBase = false) => {
    saved.saveMarker(marker, note);
    if (source !== "edit") {
      track(EVENTS.CUSTOM_MARKER_CREATED, { source, map: data.id });
    }
    applyCategories([...new Set([...activeCategories, "custom"])]);
    setHiddenMarkerGroups((groups) => groups.filter((group) => group !== marker.group));
    setQuery("");
    setSidebarMode(useForLootBase ? "runs" : "explore");
    setSidebarOpen(true);
    setSelectedPoint(useForLootBase ? null : marker);
    if (useForLootBase) {
      setLootStartState({ mapId: data.id, choice: { mode: "base", markerId: marker.id }, picking: false });
    }
    setFocusPoint({ ...marker });
    setPendingMarker(null);
    closeMarkerDialog();
  };

  const showRecommendedUsefulObjects = () => {
    applyCategories([
      ...activeCategories,
      ...RECOMMENDED_OBJECT_CATEGORY_IDS.filter((id) => !activeCategories.includes(id)),
    ]);
    usefulObjectsOnboarding.complete();
  };

  const selectPoint = (point: MapPoint | null, source: MarkerOpenSource = "map") => {
    if (minimapMode) {
      const location = point?.category !== "custom" ? point as MapLocation : null;
      const nextPoint = location && mergeLocationLootProfile(location, data) ? location : null;
      setSelectedPoint(nextPoint);
      if (nextPoint) recordMarkerOpened(nextPoint, { map: data.id, source });
      return;
    }
    if (pickingLootStart && point) { chooseLootStartPoint(point); return; }
    if (point && routeMode) {
      addRoutePoint(point, point.name);
      return;
    }
    setSelectedPoint(point);
    if (point) {
      recordMarkerOpened(point, { map: data.id, source });
      setFocusPoint({ ...point });
      setRoutesOpen(false);
      setSidebarOpen(true);
      return;
    }
    // Dismissing a marker by clicking the map closes its panel outright: the
    // filter panel the details replaced must not spring back on a click that
    // was meant to clear the map. The details' own back button still returns
    // to the filters, because that one reports itself as a sidebar action.
    if (selectedPoint && source === "map") setSidebarOpen(false);
  };

  const selectSearchPoint = (point: MapPoint) => {
    setActiveFloor(getSearchSelectionFloor(point, activeFloor));
    selectPoint(point, "sidebar");
  };

  /** The sidebar's search box only — internal setQuery calls (such as map
   *  switch resets) must never report a phantom search. */
  const handleQueryChange = (next: string) => {
    setQuery(next);
    window.clearTimeout(searchReportRef.current);
    const settled = next.trim().toLowerCase();
    if (!settled) return;
    searchReportRef.current = window.setTimeout(() => {
      track(EVENTS.MAP_SEARCHED, {
        query: settled.slice(0, 60),
        query_length: settled.length,
        map: data.id,
      });
    }, SEARCH_REPORT_DELAY_MS);
  };

  const focusTown = (townId: string) => {
    const town = data.towns.find((candidate) => candidate.id === townId);
    if (!town) return;
    if (activeFloor < 0) setActiveFloor(0);
    setSidebarMode("explore");
    setSelectedPoint(null);
    saveMapReferencePoint(town);
    setFocusPoint({
      id: `town-${town.id}-${Date.now()}`,
      name: town.name,
      category: "custom",
      label: t("map.towns.label"),
      subtype: "custom",
      townId: town.id,
      town: town.name,
      x: town.x,
      y: town.y,
    });
  };

  const buildLootRunRoute = async () => {
    let result: Awaited<ReturnType<typeof lootRun.buildRoute>>;
    try {
      setRouteBuildFeedback({ mapId: data.id, status: "calculating" });
      result = await lootRun.buildRoute();
      setRouteBuildFeedback({ mapId: data.id, status: result ? null : "error" });
    } catch (routeError) {
      console.error("Loot route validation failed.", routeError);
      setRouteBuildFeedback({ mapId: data.id, status: "error" });
      return false;
    }
    if (!result) return false;
    updateHiddenRoutes((current) => current.filter((id) => id !== result.route.id));
    track(EVENTS.LOOT_RUN_PLANNED, {
      target_count: lootRun.targets.length,
      items: lootRun.selectedItems.map(({ name }) => name).join(", "),
      map: data.id,
    });
    setPendingMarker(null);
    setDraftRoute(null);
    setSelectedPoint(null);
    setFocusPoint(null);
    setFocusRoute({ ...result.route, points: [...result.route.points] });
    setSidebarOpen(false);
    setDetailsRouteId(result.route.id);
    setRoutesOpen(true);
    return true;
  };

  const focusSavedRoute = (route: SavedMapRoute) => {
    navigateToRoute(route);
  };

  const findCraftingItem = (itemId: string) => {
    const item = lootRun.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    lootRun.startNewPlan();
    lootRun.toggleItem(item);
    setSidebarMode("runs");
  };

  return (
    // The map owns the full frame; the sidebar floats over it as a panel, so
    // opening or closing it never resizes the world underneath.
    <div className={cn("relative flex h-full min-h-0 w-full", overlayMode ? "bg-transparent" : "bg-background")}>
      <MapRouteFeedback key={data.id}
        externalStatus={routeBuildFeedback?.mapId === data.id ? routeBuildFeedback.status : null}
        raised={routeMode || placementMode} visible={active && !minimapMode}>
      {!minimapMode && (
        <div className="pointer-events-none absolute inset-x-5 top-5 z-50">
          <MapCollapsibleToolbar expanded={toolbarExpanded}>
            <MapPrimaryControls
          filtersOpen={filtersPanelOpen}
          routesOpen={routesOpen}
          lootPlannerOpen={sidebarOpen && !resolvedSelectedPoint && sidebarMode === "runs"}
          libraryOpen={libraryOpen}
          libraryAvailable={!compactSidebar}
          usefulObjectsNudgeVisible={usefulObjectsOnboarding.menuNudgeVisible}
          routes={mapRoutes}
          detailsRouteId={detailsRouteId}
          lootRuns={saved.lootRuns}
          visibleRouteIds={visibleRouteIds}
          drafting={routeMode}
          draftStopCount={draftRoutePoints.length}
          data={data}
          onToggleFilters={() => {
            setRoutesOpen(false);
            setLibraryOpen(false);
            if (sidebarOpen && !resolvedSelectedPoint && sidebarMode === "explore") {
              setSidebarOpen(false);
              return;
            }
            setSelectedPoint(null);
            setSidebarMode("explore");
            setSidebarOpen(true);
          }}
          onToggleRoutes={() => {
            setRoutesOpen((current) => {
              const next = !current;
              if (next) {
                setDetailsRouteId(null);
                setLibraryOpen(false);
                setSidebarOpen(false);
                setSelectedPoint(null);
              }
              return next;
            });
          }}
          onToggleLootPlanner={() => {
            setRoutesOpen(false);
            setLibraryOpen(false);
            setSelectedPoint(null);
            if (sidebarOpen && sidebarMode === "runs") {
              setSidebarOpen(false);
              return;
            }
            cancelLootStartPick();
            lootRun.startNewPlan();
            setSidebarMode("runs");
            setSidebarOpen(true);
          }}
          onToggleLibrary={() => {
            if (libraryOpen) setLibraryOpen(false);
            else openModLibrary();
          }}
          onCloseRoutes={() => {
            setRoutesOpen(false);
            setDetailsRouteId(null);
          }}
          onStartRoute={startRoute}
          onToggleRoute={(routeId) => {
            updateHiddenRoutes((current) => current.includes(routeId)
              ? current.filter((id) => id !== routeId)
              : [...current, routeId]);
          }}
          onRenameRoute={saved.renameRoute}
          onFocusRoute={focusSavedRoute}
          onToggleLootRunLocation={(runId, locationId) => lootRun.toggleCompleted(locationId, runId)}
          onDetailsRouteChange={setDetailsRouteId}
          onRemoveRoute={(routeId) => {
            saved.removeRoute(routeId);
            updateHiddenRoutes((current) => current.filter((id) => id !== routeId));
          }}
            />
            <MapSearchOverlay
              query={query}
              locations={locationResults}
              items={itemResults}
              towns={data.towns}
              onQueryChange={handleQueryChange}
              onSelect={selectSearchPoint}
              onSelectTown={focusTown}
            />
          </MapCollapsibleToolbar>
        </div>
      )}
      {!minimapMode && (
        <MapSidebar
          data={data}
        selectedPoint={resolvedSelectedPoint}
        mode={sidebarMode}
        activeCategories={activeCategories}
        categoryCounts={categoryCounts}
        favoriteIds={saved.favoriteIds}
        lootedLocationIds={saved.lootedLocationIds}
        notes={saved.notes}
        markerGroupCounts={markerGroupCounts}
        hiddenMarkerGroups={hiddenMarkerGroups}
        hideLooted={pointFilters.hideLooted}
        hideFavorites={pointFilters.hideFavorites}
        lootRunItems={lootRun.items}
        lootRunQuery={lootRun.query}
        selectedLootRunItemIds={lootRun.selectedItemIds}
        selectedLootRunItems={lootRun.selectedItems}
        activeLootRun={lootRun.activeRun}
        lootRunStartPicker={{
          value: lootStartChoice,
          towns: data.towns,
          markers: currentMapMarkers,
          originSource: lootRunOrigin.source,
          ready: Boolean(lootStartPosition),
          picking: pickingLootStart,
          onChange: (choice) => setLootStartState({ mapId: data.id, choice, picking: false }),
          onPick: () => {
            setPendingMarker(null);
            setDraftRoute(null);
            setLootStartState({ mapId: data.id, choice: lootStartChoice, picking: true });
          },
          onCancelPick: cancelLootStartPick,
          onSelectBase: () => beginMarker({ x: 0, y: 0 }, activeFloor, "placement", true),
        }}
        open={sidebarOpen}
        libraryOpen={libraryOpen}
        modRequestInputRef={modRequestInputRef}
        compact={compactSidebar}
        usefulObjectsCoachmarkVisible={usefulObjectsOnboarding.coachmarkVisible}
        onShowRecommendedUsefulObjects={showRecommendedUsefulObjects}
        onDismissUsefulObjectsCoachmark={usefulObjectsOnboarding.complete}
        onOpenChange={setSidebarOpen}
        onLibraryOpenChange={setLibraryOpen}
        onModeChange={setSidebarMode}
        onToggleCategory={(categoryId) => applyCategories(activeCategories.includes(categoryId)
          ? activeCategories.filter((item) => item !== categoryId)
          : [...activeCategories, categoryId])}
        onSetCategories={applyCategories}
        onSelectPoint={(point) => selectPoint(point, "sidebar")}
        onToggleFavorite={saved.toggleFavorite}
        onToggleLooted={saved.toggleLooted}
        onSaveNote={saved.saveNote}
        onRenameMarker={saved.renameMarker}
        onUpdateMarkerStyle={saved.updateMarkerStyle}
        onUpdateMarkerGroup={saved.updateMarkerGroup}
        onToggleMarkerGroup={(group) => setHiddenMarkerGroups((current) =>
          current.includes(group) ? current.filter((item) => item !== group) : [...current, group],
        )}
        onHideLootedChange={(hideLooted) => setPointFilters((current) => ({ ...current, hideLooted }))}
        onHideFavoritesChange={(hideFavorites) => setPointFilters((current) => ({ ...current, hideFavorites }))}
        onRemoveMarker={saved.removeMarker}
        onLootRunQueryChange={lootRun.setQuery}
        onToggleLootRunItem={(item) => {
          lootRun.toggleItem(item);
          setSelectedPoint(null);
        }}
        onStartNewLootRun={lootRun.startNewPlan}
        onBuildLootRunRoute={buildLootRunRoute}
        onClearLootRun={lootRun.removeRun}
        onFindCraftingItem={findCraftingItem}
        onSaveCoordinate={(point) => beginMarker(point, activeFloor, "coordinate")}
        onEditMarker={(point) => {
          if (isUserMapMarker(point)) setMarkerDraft({ marker: { ...point, mapId: data.id }, note: saved.notes[point.id] ?? "", source: "edit" });
        }}
        mapLibraryEntries={mapLibrary.entries}
        activeMapModKeys={mapLibrary.activeModKeys}
        mapLibraryError={mapLibrary.error}
        zomboidRootMissing={mapLibrary.zomboidRootMissing}
        zomboidRootSelectionInvalid={mapLibrary.zomboidRootSelectionInvalid}
        onToggleMapMods={mapLibrary.togglePreparedMods}
        onLocateZomboidRoot={mapLibrary.locateZomboidRoot}
        onRemoveMap={mapLibrary.uninstallPackage}
        />
      )}
      <div className="min-w-0 flex-1">
        {minimapMode && <BridgeModNotice compact />}
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
          isometricBaseSource={mapLibrary.selectedMap.kind === "mod"
            ? mapLibrary.selectedMap.isometricBaseSource
            : undefined}
          isometricOverlays={mapLibrary.selectedMap.kind === "mod"
            ? mapLibrary.selectedMap.isometricOverlays
            : undefined}
          points={renderedPoints}
          selectedPoint={resolvedSelectedPoint}
          focusPoint={focusPoint}
          focusRoute={focusRoute}
          placementMode={placementMode}
          onPickLootStart={pickingLootStart ? chooseLootStartPoint : undefined}
          routeMode={routeMode}
          routes={mapRoutes}
          visibleRouteIds={visibleRouteIds}
          draftRoutePoints={draftRoutePoints}
          livePosition={livePosition}
          followLivePosition={followLivePosition}
          onToggleFollowLivePosition={onToggleFollowLivePosition}
          controlsIntroVisible={controlsIntroVisible}
          minimapMode={minimapMode}
          selectedFloor={activeFloor}
          onFloorChange={setActiveFloor}
          onSelectPoint={selectPoint}
          onMoveMarker={(point, coordinate) => {
            if (!isUserMapMarker(point)) return;
            const marker = { ...point, x: Math.round(coordinate.x), y: Math.round(coordinate.y) };
            saved.saveMarker(marker, saved.notes[point.id] ?? "");
            setSelectedPoint(marker);
          }}
          onPlaceMarker={(coordinate, floor) => {
            if (!placementMode || !pendingMarker) return;
            const marker = { ...pendingMarker.marker, x: Math.round(coordinate.x), y: Math.round(coordinate.y), floors: [floor] };
            try {
              persistMarker(marker, pendingMarker.note, pendingMarker.source, pendingMarker.useForLootBase);
            } catch (error) {
              console.error("Failed to place custom marker.", error);
              setMarkerDraft({ ...pendingMarker, marker, chooseLocation: false, saveFailed: true });
              setPendingMarker(null);
            }
          }}
          onTogglePlacement={() => {
            setDraftRoute(null);
            if (placementMode) setPendingMarker(null);
            else beginMarker({ x: 0, y: 0 }, activeFloor, "placement");
          }}
          onAddRoutePoint={(coordinate) => addRoutePoint(coordinate)}
          onSaveRoute={saveDraftRoute}
          onCancelRoute={() => {
            setDraftRoute(null);
            setRouteBuildFeedback(null);
          }}
          onUndoRoutePoint={() => {
            setDraftRoute((current) => current && current.mapId === data.id
              ? { ...current, points: current.points.slice(0, -1) }
              : current);
          }}
        />
      </div>
      {active && markerDraft && markerDraft.marker.mapId === data.id && (
        <CustomMarkerDialog draft={markerDraft} onClose={closeMarkerDialog}
          onSave={(marker, note) => {
            if (markerDraft.chooseLocation) {
              setPendingMarker({ ...markerDraft, marker, note, chooseLocation: false });
              setQuery("");
              setSelectedPoint(null);
              setSidebarOpen(false);
              setRoutesOpen(false);
              setLibraryOpen(false);
              closeMarkerDialog();
              return;
            }
            persistMarker(marker, note, markerDraft.source, markerDraft.useForLootBase);
          }} />
      )}
      {minimapMode && resolvedSelectedPoint && resolvedSelectedPoint.category !== "custom" && (
        <OverlayLootPanel
          key={resolvedSelectedPoint.id}
          location={resolvedSelectedPoint as MapLocation}
          data={data}
          onClose={() => setSelectedPoint(null)}
        />
      )}
      </MapRouteFeedback>
    </div>
  );
};

export default MapWorkspace;
