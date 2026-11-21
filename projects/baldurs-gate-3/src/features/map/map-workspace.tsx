import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import {
  recordMarkerOpened,
  type MarkerOpenSource,
} from "../../services/analytics/map-events";
import { reportMapPageview } from "../../state/use-analytics";
import { subscribeToMapLocationNavigation } from "./map-location-navigation";
import { useLivePosition } from "../live-position/live-position-store";
import { useGameTrackerState } from "../game-events/game-tracker-store";
import InteractiveMap from "./interactive-map";
import MapAtlasOverview from "./map-atlas-overview";
import MapNavigation from "./map-navigation";
import {
  getMapPointInstanceId,
  getPointSourceCoordinate,
  projectPointToAtlas,
} from "./map-atlas-projection";
import { worldToMapCoordinate } from "./map-coordinate-reference";
import { DEFAULT_MARKER_GROUP, MARKER_GROUPS } from "./marker-group-config";
import { DEFAULT_CATEGORY_IDS, MAP_CONNECTIONS, MAP_LOCATION_ALIASES } from "./map-config";
import { getOutgoingConnectionKeys } from "./map-connection-directions";
import MapDataState from "./map-data-state";
import { createMapSearchDocument, groupMapSearchMatches, searchMapDocuments } from "./map-fuzzy-search";
import type { MapPointStatusFilter } from "./map-filter-quick-controls";
import type { PersonalMarkerLayer } from "./map-personal-marker-filter";
import MapPrimaryControls from "./map-primary-controls";
import {
  getMapAtlas,
  getMapAtlasForMap,
  MAP_DEFINITIONS,
  resolveGameMapDefinition,
} from "./map-registry";
import MapSearchOverlay from "./map-search-overlay";
import MapSidebar, { type MapSidebarMode } from "./map-sidebar";
import { MAP_FOCUS_REQUEST_KEY } from "./map-window-bridge";
import OverlayPointCard from "./overlay-point-card";
import {
  isUserMapMarker,
  type MapMetadata,
  type MapPoint,
  type UserMarkerGroup,
} from "./types";
import { useMapData } from "./use-map-data";
import { saveMapReferencePoint, useMapReferencePoint } from "./use-map-reference-point";
import { useMapSearchIndex } from "./use-map-search-index";
import { useSavedMapState } from "./use-saved-map-state";
import { useSelectedMap } from "./use-selected-map";

/** Typing pause after which a search is reported once, not per keystroke. */
const SEARCH_REPORT_DELAY_MS = 900;
/** Place rows the search dropdown shows. */
const LOCATION_RESULT_LIMIT = 8;
/** Cross-map rows shown after matches from the current map. */
const GLOBAL_LOCATION_RESULT_LIMIT = 10;
/** A category with more markers than this starts hidden, whatever its config says. */
const DEFAULT_CATEGORY_MARKER_LIMIT = 1_000;

const CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:";
const SIDEBAR_STORAGE_KEY = "gm:sidebar-open";
const HIDDEN_MARKER_GROUPS_STORAGE_KEY = "gm:hidden-marker-groups";
const HIDDEN_PERSONAL_MARKER_LAYERS_STORAGE_KEY = "gm:hidden-personal-marker-layers";
const HIDDEN_POINT_STATUSES_STORAGE_KEY = "gm:hidden-point-statuses";

const readHiddenPointStatuses = () => {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_POINT_STATUSES_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value)
      ? value.filter((status): status is MapPointStatusFilter => status === "completed" || status === "favorite")
      : [];
  } catch {
    return [];
  }
};

const readHiddenPersonalMarkerLayers = () => {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_PERSONAL_MARKER_LAYERS_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value)
      ? value.filter((layer): layer is PersonalMarkerLayer => layer === "saved" || layer === "completed")
      : [];
  } catch {
    return [];
  }
};

const readHiddenMarkerGroups = () => {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_MARKER_GROUPS_STORAGE_KEY) ?? "[]") as unknown;
    const validGroups = new Set<string>(MARKER_GROUPS.map(({ id }) => id));
    return Array.isArray(value)
      ? value.filter((group): group is UserMarkerGroup => typeof group === "string" && validGroups.has(group))
      : [];
  } catch {
    return [];
  }
};

const categoryStorageKey = (mapId: string) => `${CATEGORY_STORAGE_KEY_PREFIX}${mapId}`;

const readStoredCategories = (mapId: string): string[] | null => {
  try {
    const stored = localStorage.getItem(categoryStorageKey(mapId));
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

const getPointCategories = (point: MapPoint) => [...new Set([
  point.category,
  ...("categoryFacets" in point ? point.categoryFacets ?? [] : []),
])];

interface MapWorkspaceProps {
  active?: boolean;
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
  compactSidebar = false,
  controlsIntroVisible = false,
  followLivePosition = false,
  onToggleFollowLivePosition,
  minimapMode = false,
  overlayMode = false,
}: MapWorkspaceProps) => {
  const { t } = useTranslation();
  const { definition: selectedMap, select: selectMap } = useSelectedMap();
  const [atlasId, setAtlasId] = useState<string | null>(() =>
    minimapMode ? null : getMapAtlasForMap(selectedMap.id).id);
  const activeAtlas = getMapAtlas(atlasId ?? getMapAtlasForMap(selectedMap.id).id);
  const atlasOverview = !minimapMode && atlasId !== null;
  const categoryScopeId = atlasOverview ? `atlas:${activeAtlas.id}` : selectedMap.id;
  const { data, error, loading: mapDataLoading } = useMapData(selectedMap);
  const { data: mapSearchIndex, loading: mapSearchLoading, error: mapSearchError } = useMapSearchIndex();
  const verifiedMapConnections = useMemo(
    () => [...MAP_CONNECTIONS, ...(mapSearchIndex?.connections ?? [])],
    [mapSearchIndex?.connections],
  );
  const saved = useSavedMapState(MAP_LOCATION_ALIASES);
  const livePosition = useLivePosition();
  const gameTracker = useGameTrackerState();
  const appliedGameMapObservation = useRef<string | null>(null);
  const revealedLivePosition = useRef(false);
  const referencePoint = useMapReferencePoint();

  useEffect(() => {
    if (!livePosition.position) {
      revealedLivePosition.current = false;
      return;
    }
    if (minimapMode || revealedLivePosition.current) return;
    revealedLivePosition.current = true;
    const frame = window.requestAnimationFrame(() => setAtlasId(null));
    return () => window.cancelAnimationFrame(frame);
  }, [livePosition.position, minimapMode]);

  useEffect(() => {
    const observation = `${gameTracker.sessionId ?? ""}:${gameTracker.mainMap ?? ""}:${gameTracker.subMap ?? ""}`;
    if (appliedGameMapObservation.current === observation) return;
    appliedGameMapObservation.current = observation;
    const observedMap = resolveGameMapDefinition(gameTracker.mainMap, gameTracker.subMap);
    if (!observedMap) return;
    const frame = window.requestAnimationFrame(() => {
      // A live game observation belongs on the playable map itself. The atlas
      // overview cannot project or follow a source-world player coordinate.
      if (!minimapMode) setAtlasId(null);
      if (observedMap.id !== selectedMap.id) selectMap(observedMap.id);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [gameTracker.mainMap, gameTracker.sessionId, gameTracker.subMap, minimapMode, selectMap, selectedMap.id]);
  const [query, setQuery] = useState("");
  const [sidebarMode, setSidebarMode] = useState<MapSidebarMode>("explore");
  const [focusPoint, setFocusPoint] = useState<MapPoint | null>(null);
  // A cross-link inside a detail panel drills down instead of jumping: the stack
  // keeps the panel it was opened from, so the new details can offer a way back
  // to it. Every other selection (map pin, search hit, checklist) starts fresh.
  const [selectionStack, setSelectionStack] = useState<MapPoint[]>([]);
  const selectedPoint = selectionStack[selectionStack.length - 1] ?? null;
  const parentPoint = selectionStack[selectionStack.length - 2] ?? null;
  const setSelectedPoint = useCallback(
    (point: MapPoint | null) => setSelectionStack(point ? [point] : []),
    [],
  );
  const pushSelectedPoint = useCallback(
    (point: MapPoint) => setSelectionStack((stack) => [...stack, point]),
    [],
  );
  /** The panel a drill-down leaves behind has to remember which map it sits on,
   *  so the way back can return to that map before restoring it. */
  const stampSelectionMap = useCallback(
    (id: string) => setSelectionStack((stack) => stack.map((point, index) => (
      index === stack.length - 1 && !point.mapId ? { ...point, mapId: id } : point
    ))),
    [],
  );
  /** Returns the details to the panel this one was drilled into from. */
  const goBackToParent = useCallback(() => {
    if (!parentPoint) return;
    if (parentPoint.mapId && parentPoint.mapId !== selectedMap.id) {
      setQuery("");
      selectMap(parentPoint.mapId);
      track(EVENTS.MAP_SWITCHED, { map: parentPoint.mapId });
    }
    setSelectionStack((stack) => stack.slice(0, -1));
    setFocusPoint({ ...parentPoint });
  }, [parentPoint, selectMap, selectedMap.id]);
  const [pendingSearchTarget, setPendingSearchTarget] = useState<
    { mapId: string; pointId: string; drill: boolean } | null
  >(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [hiddenPersonalMarkerLayers, setHiddenPersonalMarkerLayers] = useState<PersonalMarkerLayer[]>(
    readHiddenPersonalMarkerLayers,
  );
  const [hiddenPointStatuses, setHiddenPointStatuses] = useState<MapPointStatusFilter[]>(
    readHiddenPointStatuses,
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false",
  );
  const [hiddenMarkerGroups, setHiddenMarkerGroups] = useState<UserMarkerGroup[]>(readHiddenMarkerGroups);
  const [categorySelection, setCategorySelection] = useState(() => {
    const stored = readStoredCategories(categoryScopeId);
    return { mapId: categoryScopeId, categories: stored ?? [], resolved: stored !== null };
  });

  const openAtlas = (id: string) => {
    if (followLivePosition) onToggleFollowLivePosition?.();
    setAtlasId(id);
    setQuery("");
    setSelectedPoint(null);
    setFocusPoint(null);
    setPlacementMode(false);
  };

  const switchMap = (nextMapId: string, keepSelection = false) => {
    setAtlasId(null);
    if (followLivePosition) onToggleFollowLivePosition?.();
    setQuery("");
    if (!keepSelection) setSelectedPoint(null);
    setFocusPoint(null);
    setPlacementMode(false);
    selectMap(nextMapId);
    track(EVENTS.MAP_SWITCHED, { map: nextMapId });
  };

  const mapId = data?.id ?? selectedMap.id;
  const atlasMapIds = useMemo(
    () => new Set(activeAtlas.placements.map(({ mapId: placedMapId }) => placedMapId)),
    [activeAtlas.placements],
  );
  const boundsByMapId = useMemo(
    () => new Map((mapSearchIndex?.maps ?? []).map((map) => [map.id, map.bounds])),
    [mapSearchIndex?.maps],
  );
  const atlasLocations = useMemo(
    () => (mapSearchIndex?.locations ?? [])
      .filter((point) => atlasMapIds.has(point.mapId))
      .flatMap((point) => {
        const projected = projectPointToAtlas(activeAtlas, boundsByMapId, point);
        return projected ? [projected] : [];
      }),
    [activeAtlas, atlasMapIds, boundsByMapId, mapSearchIndex?.locations],
  );
  const currentMapMarkers = useMemo(
    () => atlasOverview
      ? saved.markers
        .filter((marker) => marker.mapId && atlasMapIds.has(marker.mapId))
        .flatMap((marker) => {
          const projected = projectPointToAtlas(activeAtlas, boundsByMapId, marker);
          return projected ? [projected] : [];
        })
      : saved.markers.filter((marker) => marker.mapId === mapId),
    [activeAtlas, atlasMapIds, atlasOverview, boundsByMapId, mapId, saved.markers],
  );

  const allPoints = useMemo(
    () => [...(atlasOverview ? atlasLocations : data?.locations ?? []), ...currentMapMarkers],
    [atlasLocations, atlasOverview, currentMapMarkers, data?.locations],
  );

  useEffect(() => {
    if (atlasOverview || !pendingSearchTarget || !data || data.id !== pendingSearchTarget.mapId) return;
    const timeout = window.setTimeout(() => {
      const point = data.locations.find((candidate) => candidate.id === pendingSearchTarget.pointId);
      if (!point) {
        console.error(
          `Global search target "${pendingSearchTarget.pointId}" was not found on map "${pendingSearchTarget.mapId}".`,
        );
        setPendingSearchTarget(null);
        return;
      }
      setPendingSearchTarget(null);
      setSidebarMode("explore");
      if (pendingSearchTarget.drill) pushSelectedPoint(point);
      else setSelectedPoint(point);
      setFocusPoint({ ...point });
      setSidebarOpen(true);
      recordMarkerOpened(point, { map: data.id, source: "sidebar" });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [atlasOverview, data, pendingSearchTarget, pushSelectedPoint, setSelectedPoint]);

  const savedPoints = useMemo(
    () => allPoints.filter((point) => point.category === "custom" || saved.favoriteIds.includes(point.id)),
    [allPoints, saved.favoriteIds],
  );

  const completedPoints = useMemo(
    () => allPoints.filter((point) => saved.completedIds.includes(point.id)),
    [allPoints, saved.completedIds],
  );

  const { categoryCounts, completedCategoryCounts } = useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    const completedCategoryCounts: Record<string, number> = {};
    const completed = new Set(saved.completedIds);
    for (const point of allPoints) {
      for (const category of getPointCategories(point)) {
        categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
        if (completed.has(point.id)) completedCategoryCounts[category] = (completedCategoryCounts[category] ?? 0) + 1;
      }
    }
    return { categoryCounts, completedCategoryCounts };
  }, [allPoints, saved.completedIds]);
  const activeCategories = useMemo(() => {
    if (categorySelection.mapId === categoryScopeId && categorySelection.resolved) {
      return categorySelection.categories;
    }
    const stored = readStoredCategories(categoryScopeId);
    if (stored !== null) return stored;
    return (atlasOverview ? mapSearchLoading || !mapSearchIndex : mapDataLoading || !data)
      ? []
      : getDefaultCategories(categoryCounts);
  }, [atlasOverview, categoryCounts, categoryScopeId, categorySelection, data, mapDataLoading, mapSearchIndex, mapSearchLoading]);

  const markerGroupCounts = useMemo(
    () => currentMapMarkers.reduce<Partial<Record<UserMarkerGroup, number>>>((counts, marker) => {
      const group = marker.group ?? DEFAULT_MARKER_GROUP;
      counts[group] = (counts[group] ?? 0) + 1;
      return counts;
    }, {}),
    [currentMapMarkers],
  );

  const personalMarkerCounts = useMemo(() => ({
    saved: savedPoints.length,
    completed: completedPoints.length,
  }), [completedPoints, savedPoints]);

  // Ties between equally good search hits go to whatever is nearest the
  // player, or failing that the last place the user looked at.
  const projectedLivePosition = useMemo(() => {
    if (!livePosition.position) return null;
    return data?.coordinateReference
      ? worldToMapCoordinate(livePosition.position, data.coordinateReference)
      : livePosition.position;
  }, [data, livePosition.position]);
  const searchOrigin = atlasOverview ? null : projectedLivePosition ?? referencePoint;

  const coordinatePoint = useMemo<MapPoint | null>(() => {
    if (atlasOverview || !data) return null;
    const match = query.match(/(-?\d{1,7})\D+(-?\d{1,7})/);
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
      regionId: "coordinate",
      region: t("map.search.coordinate"),
      x,
      y,
    };
  }, [atlasOverview, data, query, t]);

  // What a place ANSWERS TO (its names) stays separate from what merely
  // describes it (region, kind, coordinates): context is real evidence, but it
  // can never outrank someone typing an actual name.
  const searchDocuments = useMemo(() => allPoints.map((point) => {
    const sourceCoordinate = getPointSourceCoordinate(point);
    return createMapSearchDocument(
      point,
      [point.name, point.label],
      [
        "mapName" in point ? point.mapName : "",
        point.region,
        point.label,
        point.subtype,
        ...("searchTerms" in point ? point.searchTerms ?? [] : []),
        sourceCoordinate.x,
        sourceCoordinate.y,
      ].join(" "),
    );
  }), [allPoints]);

  const otherMapSearchDocuments = useMemo(() => (mapSearchIndex?.locations ?? [])
    .filter((point) => atlasOverview ? !atlasMapIds.has(point.mapId) : point.mapId !== selectedMap.id)
    .map((point) => createMapSearchDocument(
      point,
      [point.name, point.label],
      [
        point.mapName,
        point.region,
        point.label,
        point.subtype,
        ...(point.searchTerms ?? []),
      ].join(" "),
    )), [atlasMapIds, atlasOverview, mapSearchIndex?.locations, selectedMap.id]);

  const locationMatches = useMemo(
    () => searchMapDocuments(searchDocuments, query, searchOrigin),
    [query, searchDocuments, searchOrigin],
  );
  const locationResults = useMemo(() => {
    const groups = groupMapSearchMatches(locationMatches, LOCATION_RESULT_LIMIT);
    if (!coordinatePoint) return groups;
    return [
      { point: coordinatePoint, score: -1, count: 1 },
      ...groups.filter(({ point }) => point.id !== coordinatePoint.id),
    ];
  }, [coordinatePoint, locationMatches]);
  const otherMapLocationResults = useMemo(() => groupMapSearchMatches(
    searchMapDocuments(otherMapSearchDocuments, query),
    GLOBAL_LOCATION_RESULT_LIMIT,
  ), [otherMapSearchDocuments, query]);

  // The pins the map keeps while a search is running — every match, uncapped,
  // even though the dropdown lists only the strongest leads.
  const searchMatchIds = useMemo(
    () => new Set(locationMatches.map(({ point }) => point.id)),
    [locationMatches],
  );

  const visiblePoints = useMemo(() => {
    const searching = query.trim().length > 0;
    const matches = allPoints.filter((point) => {
      if (hiddenPointStatuses.includes("completed") && saved.completedIds.includes(point.id)) return false;
      if (hiddenPointStatuses.includes("favorite") && saved.favoriteIds.includes(point.id)) return false;
      const savedLayerPoint = point.category === "custom" || saved.favoriteIds.includes(point.id);
      const completedLayerPoint = saved.completedIds.includes(point.id);
      const personalLayerPoint = savedLayerPoint || completedLayerPoint;
      const personalLayerVisible = (savedLayerPoint && !hiddenPersonalMarkerLayers.includes("saved"))
        || (completedLayerPoint && !hiddenPersonalMarkerLayers.includes("completed"));
      if (personalLayerPoint
        ? !personalLayerVisible
        : !getPointCategories(point).some((category) => activeCategories.includes(category))) return false;
      if (isUserMapMarker(point) && hiddenMarkerGroups.includes(point.group ?? DEFAULT_MARKER_GROUP)) return false;
      if (sidebarMode === "saved" && !personalLayerPoint) return false;
      return !searching || searchMatchIds.has(point.id);
    });
    return coordinatePoint && sidebarMode !== "saved"
      ? [coordinatePoint, ...matches]
      : matches;
  }, [activeCategories, allPoints, coordinatePoint, hiddenMarkerGroups, hiddenPersonalMarkerLayers, hiddenPointStatuses, query, searchMatchIds, saved.completedIds, saved.favoriteIds, sidebarMode]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem(HIDDEN_MARKER_GROUPS_STORAGE_KEY, JSON.stringify(hiddenMarkerGroups));
  }, [hiddenMarkerGroups]);

  useEffect(() => {
    localStorage.setItem(
      HIDDEN_PERSONAL_MARKER_LAYERS_STORAGE_KEY,
      JSON.stringify(hiddenPersonalMarkerLayers),
    );
  }, [hiddenPersonalMarkerLayers]);

  useEffect(() => {
    localStorage.setItem(HIDDEN_POINT_STATUSES_STORAGE_KEY, JSON.stringify(hiddenPointStatuses));
  }, [hiddenPointStatuses]);

  // The sidebar modes are this app's "pages" (/map, /map/saved). The minimap
  // overlay renders no sidebar, so it never reports pageviews.
  const dataId = data?.id;
  useEffect(() => {
    if (!active || minimapMode || !dataId) return;
    reportMapPageview(sidebarMode, dataId);
  }, [active, dataId, minimapMode, sidebarMode]);

  // One MAP_SEARCHED per settled query, not one per keystroke.
  const searchReportRef = useRef<number | undefined>(undefined);
  const pendingSearchRef = useRef<string | null>(null);
  const reportSearchRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    window.clearTimeout(searchReportRef.current);
    reportSearchRef.current = null;
    const settled = query.trim().toLowerCase();
    if (!settled || pendingSearchRef.current !== settled) return;
    const report = () => {
      if (pendingSearchRef.current !== settled) return;
      pendingSearchRef.current = null;
      const count = locationResults.length + otherMapLocationResults.length;
      track(EVENTS.MAP_SEARCHED, {
        query_length: settled.length,
        result_count: count,
        has_results: count > 0,
        index_ready: Boolean(mapSearchIndex),
        map: atlasOverview ? activeAtlas.id : selectedMap.id,
      });
    };
    reportSearchRef.current = report;
    searchReportRef.current = window.setTimeout(report, SEARCH_REPORT_DELAY_MS);
    return () => window.clearTimeout(searchReportRef.current);
  }, [query, locationResults, otherMapLocationResults, mapSearchIndex, atlasOverview, activeAtlas.id, selectedMap.id]);

  // Escape closes things innermost-first; Ctrl+K jumps to the search box.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!minimapMode && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>("#map-search-toggle")?.click();
        window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#map-search-input")?.focus());
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
        if (selectedPoint) {
          if (parentPoint) goBackToParent();
          else setSelectedPoint(null);
          return;
        }
        if (sidebarOpen) setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, goBackToParent, minimapMode, parentPoint, placementMode, selectedPoint, setSelectedPoint, sidebarOpen]);

  // A personal marker's details must follow its edits (rename, restyle), so the
  // selection resolves to the live stored copy rather than the clicked snapshot.
  const resolvedSelectedPoint = useMemo(() => {
    if (selectedPoint?.subtype !== "custom") return selectedPoint;
    const marker = saved.markers.find((candidate) => candidate.id === selectedPoint.id);
    if (!marker) return null;
    return atlasOverview
      ? projectPointToAtlas(activeAtlas, boundsByMapId, marker) ?? null
      : marker;
  }, [activeAtlas, atlasOverview, boundsByMapId, saved.markers, selectedPoint]);
  const connectedLocations = useMemo(() => {
    if (!resolvedSelectedPoint) return [];
    const pointMapId = resolvedSelectedPoint.mapId ?? selectedMap.id;
    const currentKey = `${pointMapId}:${resolvedSelectedPoint.id}`;
    const destinationKeys = getOutgoingConnectionKeys(verifiedMapConnections, currentKey);
    return (mapSearchIndex?.locations ?? []).filter((location) =>
      destinationKeys.has(`${location.mapId}:${location.id}`));
  }, [mapSearchIndex?.locations, resolvedSelectedPoint, selectedMap.id, verifiedMapConnections]);
  const accessLocations = useMemo(() => {
    if (!resolvedSelectedPoint || !("contentId" in resolvedSelectedPoint) || !resolvedSelectedPoint.contentId) return [];
    const access = data?.content.entities[resolvedSelectedPoint.contentId]?.access;
    if (!access) return [];
    const relatedContentIds = new Set(access.related.map(({ contentId }) => contentId));
    return (mapSearchIndex?.locations ?? []).filter(({ contentId }) =>
      contentId !== undefined && relatedContentIds.has(contentId));
  }, [data?.content.entities, mapSearchIndex?.locations, resolvedSelectedPoint]);
  const itemOwnerLocations = useMemo(() => {
    if (!resolvedSelectedPoint || !("contentId" in resolvedSelectedPoint) || !resolvedSelectedPoint.contentId) return [];
    const ownerContentId = data?.content.entities[resolvedSelectedPoint.contentId]?.itemLocation?.ownerContentId;
    if (!ownerContentId) return [];
    return (mapSearchIndex?.locations ?? []).filter(({ contentId }) => contentId === ownerContentId);
  }, [data?.content.entities, mapSearchIndex?.locations, resolvedSelectedPoint]);
  const partyMemberLocations = useMemo(() => {
    if (!resolvedSelectedPoint || !("contentId" in resolvedSelectedPoint) || !resolvedSelectedPoint.contentId) return [];
    const profile = data?.content.entities[resolvedSelectedPoint.contentId]?.partyMember;
    if (!profile) return [];
    const positionContentIds = new Set(profile.positions.map(({ contentId }) => contentId));
    return (mapSearchIndex?.locations ?? []).filter(({ contentId }) =>
      contentId !== undefined && contentId !== resolvedSelectedPoint.contentId && positionContentIds.has(contentId));
  }, [data?.content.entities, mapSearchIndex?.locations, resolvedSelectedPoint]);
  const combinationLocations = useMemo(() => {
    if (!resolvedSelectedPoint || !("contentId" in resolvedSelectedPoint) || !resolvedSelectedPoint.contentId) return [];
    const profile = data?.content.entities[resolvedSelectedPoint.contentId]?.puzzleCombinations;
    if (!profile) return [];
    const relatedContentIds = new Set(profile.related.map(({ contentId }) => contentId));
    return (mapSearchIndex?.locations ?? []).filter(({ contentId }) =>
      contentId !== undefined && relatedContentIds.has(contentId));
  }, [data?.content.entities, mapSearchIndex?.locations, resolvedSelectedPoint]);
  const mechanismLocations = useMemo(() => {
    if (!resolvedSelectedPoint || !("contentId" in resolvedSelectedPoint) || !resolvedSelectedPoint.contentId) return [];
    const profile = data?.content.entities[resolvedSelectedPoint.contentId]?.mechanism;
    if (!profile) return [];
    const relatedContentIds = new Set([
      ...profile.related.map(({ contentId }) => contentId),
      ...(profile.movements ?? []).map(({ destinationContentId }) => destinationContentId),
      ...(profile.sequence?.steps ?? []).map(({ contentId }) => contentId),
      ...(profile.sequence ? [profile.sequence.result.contentId] : []),
    ]);
    return (mapSearchIndex?.locations ?? []).filter(({ contentId }) =>
      contentId !== undefined && relatedContentIds.has(contentId));
  }, [data?.content.entities, mapSearchIndex?.locations, resolvedSelectedPoint]);

  useEffect(() => {
    if (resolvedSelectedPoint) saveMapReferencePoint(resolvedSelectedPoint);
  }, [resolvedSelectedPoint]);
  const renderedPoints = resolvedSelectedPoint && !visiblePoints.some((point) =>
    getMapPointInstanceId(point) === getMapPointInstanceId(resolvedSelectedPoint))
    ? [...visiblePoints, resolvedSelectedPoint]
    : visiblePoints;

  // The overlay minimap asks the desktop window to open a point in full.
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
        if (atlasOverview && point.mapId && point.mapId !== selectedMap.id) selectMap(point.mapId);
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
  }, [allPoints, atlasOverview, minimapMode, selectMap, selectedMap.id, setSelectedPoint]);

  useEffect(() => subscribeToMapLocationNavigation(({ mapId: targetMapId, locationId, drill = false }) => {
    // Stamp before the map switch below: the panel a drill-down leaves behind
    // belongs to the map that is still current here.
    if (drill) stampSelectionMap(selectedMap.id);
    if (atlasOverview) {
      const target = (mapSearchIndex?.locations ?? []).find((location) =>
        location.mapId === targetMapId && location.id === locationId);
      const targetAtlas = getMapAtlasForMap(targetMapId);
      const projected = target
        ? projectPointToAtlas(targetAtlas, boundsByMapId, target)
        : null;
      if (!projected) {
        console.error(`Atlas target "${targetMapId}:${locationId}" could not be projected.`);
        return;
      }
      setAtlasId(targetAtlas.id);
      setQuery("");
      setPlacementMode(false);
      if (targetMapId !== selectedMap.id) selectMap(targetMapId);
      if (drill) pushSelectedPoint(projected);
      else setSelectedPoint(projected);
      setFocusPoint({ ...projected });
      setSidebarOpen(true);
      return;
    }
    setPendingSearchTarget({ mapId: targetMapId, pointId: locationId, drill });
    if (targetMapId === selectedMap.id) return;
    setQuery("");
    if (!drill) setSelectedPoint(null);
    setFocusPoint(null);
    setPlacementMode(false);
    setAtlasId(null);
    selectMap(targetMapId);
    track(EVENTS.MAP_SWITCHED, { map: targetMapId });
  }), [
    atlasOverview,
    boundsByMapId,
    mapSearchIndex?.locations,
    pushSelectedPoint,
    selectMap,
    selectedMap.id,
    setSelectedPoint,
    stampSelectionMap,
  ]);

  if (atlasOverview && (mapSearchLoading || !mapSearchIndex)) {
    return <MapDataState error={mapSearchError} compact={false} />;
  }
  if (!atlasOverview && (mapDataLoading || !data)) {
    return <MapDataState error={error} compact={minimapMode} />;
  }

  const atlasSidebarData: MapMetadata = {
    id: resolvedSelectedPoint?.mapId ?? data?.id ?? selectedMap.id,
    displayName: activeAtlas.name,
    schemaVersion: 1,
    bounds: { minX: 0, minY: 0, maxX: activeAtlas.width, maxY: activeAtlas.height },
    tileSize: 256,
    detailLevels: [0],
    regions: [],
    locations: atlasLocations,
    content: data?.id === (resolvedSelectedPoint?.mapId ?? selectedMap.id)
      ? data.content
      : { schemaVersion: 1, entities: {}, relationships: [] },
    tileSource: { basePath: "", tilePattern: "" },
  };
  const workspaceData = atlasOverview ? atlasSidebarData : data!;

  /** Writes the visible layer set once, so every filter control (single
   *  toggle, group checkbox, "Only") persists through the same path. */
  const applyCategories = (categories: string[]) => {
    localStorage.setItem(categoryStorageKey(categoryScopeId), JSON.stringify(categories));
    setCategorySelection({ mapId: categoryScopeId, categories, resolved: true });
  };
  const selectPoint = (point: MapPoint | null, source: MarkerOpenSource = "map", drill = false) => {
    if (atlasOverview && point?.mapId && point.mapId !== selectedMap.id) {
      selectMap(point.mapId);
    }
    if (drill && point) pushSelectedPoint(point);
    else setSelectedPoint(point);
    if (point) {
      recordMarkerOpened(point, { map: point.mapId ?? data?.id ?? selectedMap.id, source });
      if (minimapMode) return;
      setFocusPoint({ ...point });
      setSidebarOpen(true);
      return;
    }
    // Dismissing a marker by clicking the map closes its panel outright: the
    // panel the details replaced must not spring back on a click that was
    // meant to clear the map. The details' own back button still returns to
    // it, because that one reports itself as a sidebar action.
    if (selectedPoint && source === "map") setSidebarOpen(false);
  };

  /** The search box only — internal setQuery calls (map switch resets) must
   *  never report a phantom search. */
  const handleQueryChange = (next: string) => {
    setQuery(next);
    window.clearTimeout(searchReportRef.current);
    pendingSearchRef.current = next.trim().toLowerCase() || null;
  };

  const selectSearchResult = (point: MapPoint, drill = false) => {
    // Stamp before any map switch: the panel being left behind belongs to the
    // map that is still current at this moment.
    if (drill) stampSelectionMap(resolvedSelectedPoint?.mapId ?? data?.id ?? selectedMap.id);
    const targetMapId = "mapId" in point ? point.mapId : undefined;
    if (atlasOverview && targetMapId) {
      const targetAtlas = getMapAtlasForMap(targetMapId);
      const sourceCoordinate = getPointSourceCoordinate(point);
      const projected = point.sourceCoordinate && targetAtlas.id === activeAtlas.id
        ? point
        : projectPointToAtlas(targetAtlas, boundsByMapId, {
          ...point,
          x: sourceCoordinate.x,
          y: sourceCoordinate.y,
          mapId: targetMapId,
        });
      if (!projected) return;
      setAtlasId(targetAtlas.id);
      if (targetMapId !== selectedMap.id) selectMap(targetMapId);
      selectPoint(projected, "sidebar", drill);
      return;
    }
    if (targetMapId && targetMapId !== selectedMap.id) {
      setPendingSearchTarget({ mapId: targetMapId, pointId: point.id, drill });
      switchMap(targetMapId, drill);
      return;
    }
    selectPoint(point, "sidebar", drill);
  };

  const placeMarker = (
    coordinate: { x: number; y: number },
    source: "placement" | "coordinate",
    targetMapId = data?.id ?? selectedMap.id,
  ) => {
    const marker = saved.addMarker(
      coordinate,
      source === "coordinate"
        ? t("map.custom.coordinateName", { x: Math.round(coordinate.x), y: Math.round(coordinate.y) })
        : t("map.custom.defaultName", { count: currentMapMarkers.length + 1 }),
      t("map.categories.custom"),
      t("map.custom.personal"),
      targetMapId,
    );
    track(EVENTS.CUSTOM_MARKER_CREATED, { source, map: targetMapId });
    setQuery("");
    setSidebarMode("explore");
    setPlacementMode(false);
    const projectedMarker = atlasOverview
      ? projectPointToAtlas(activeAtlas, boundsByMapId, marker)
      : marker;
    setSelectedPoint(projectedMarker ?? marker);
    setFocusPoint({ ...(projectedMarker ?? marker) });
    setSidebarOpen(true);
  };

  const filtersOpen = sidebarOpen && !resolvedSelectedPoint && sidebarMode === "explore";

  /** Opening the menu closes point details; a second press closes the menu. */
  const toggleMenu = () => {
    if (filtersOpen) {
      setSidebarOpen(false);
      return;
    }
    setSelectedPoint(null);
    setSidebarMode("explore");
    setSidebarOpen(true);
  };

  return (
    // The map owns the full frame; the sidebar floats over it as a panel, so
    // opening or closing it never resizes the world underneath.
    <div className={cn("relative flex h-full min-h-0 w-full", overlayMode ? "bg-transparent" : "bg-background")}>
      {!minimapMode && (
        // Region navigation stays centered independently of the search width.
        <div className="pointer-events-none absolute inset-x-5 top-5 z-50 flex flex-wrap items-start justify-between gap-2.5">
          <MapPrimaryControls
            filtersOpen={filtersOpen}
            onToggleFilters={toggleMenu}
          />
          <MapSearchOverlay
            query={query}
            locations={locationResults}
            otherMapLocations={otherMapLocationResults}
            navigation={<MapNavigation atlas={activeAtlas} mapId={selectedMap.id} overview={atlasOverview}
              onAtlas={openAtlas} onMap={switchMap} />}
            onQueryChange={handleQueryChange}
            onSelect={(point) => {
              reportSearchRef.current?.();
              track(EVENTS.MAP_SEARCH_RESULT_SELECTED, {
                category: point.category,
                map: atlasOverview ? activeAtlas.id : selectedMap.id,
                target_map: point.mapId ?? selectedMap.id,
              });
              selectSearchResult(point);
            }}
          />
        </div>
      )}
      {!minimapMode && (
        <MapSidebar
          data={workspaceData}
          selectedPoint={resolvedSelectedPoint}
          parentPoint={parentPoint}
          mode={sidebarMode}
          open={sidebarOpen}
          compact={compactSidebar}
          activeCategories={activeCategories}
          categoryCounts={categoryCounts}
          completedCategoryCounts={completedCategoryCounts}
          completedIds={saved.completedIds}
          favoriteIds={saved.favoriteIds}
          markerGroupCounts={markerGroupCounts}
          hiddenMarkerGroups={hiddenMarkerGroups}
          personalMarkerCounts={personalMarkerCounts}
          hiddenPersonalMarkerLayers={hiddenPersonalMarkerLayers}
          hiddenPointStatuses={hiddenPointStatuses}
          connectedLocations={connectedLocations}
          accessLocations={accessLocations}
          partyMemberLocations={partyMemberLocations}
          itemOwnerLocations={itemOwnerLocations}
          combinationLocations={combinationLocations}
          mechanismLocations={mechanismLocations}
          questLocations={mapSearchIndex?.locations ?? []}
          savedPoints={savedPoints}
          completedPoints={completedPoints}
          onOpenChange={setSidebarOpen}
          onModeChange={setSidebarMode}
          onToggleCategory={(categoryId) => applyCategories(activeCategories.includes(categoryId)
            ? activeCategories.filter((item) => item !== categoryId)
            : [...activeCategories, categoryId])}
          onSetCategories={applyCategories}
          onSelectPoint={(point) => selectPoint(point, "sidebar")}
          onSelectMatchingLocation={(location) => {
            if (location.mapId === resolvedSelectedPoint?.mapId && location.id === resolvedSelectedPoint.id) {
              setFocusPoint({ ...resolvedSelectedPoint });
              return;
            }
            selectSearchResult(location, true);
          }}
          onToggleCompleted={saved.toggleCompleted}
          onToggleFavorite={saved.toggleFavorite}
          onCenterPoint={(point) => setFocusPoint({ ...point })}
          onRenameMarker={saved.renameMarker}
          onUpdateMarkerStyle={saved.updateMarkerStyle}
          onUpdateMarkerGroup={saved.updateMarkerGroup}
          onToggleMarkerGroup={(group) => setHiddenMarkerGroups((current) =>
            current.includes(group) ? current.filter((item) => item !== group) : [...current, group],
          )}
          onTogglePersonalMarkerLayer={(layer) => setHiddenPersonalMarkerLayers((current) =>
            current.includes(layer) ? current.filter((item) => item !== layer) : [...current, layer],
          )}
          onTogglePointStatus={(status) => setHiddenPointStatuses((current) =>
            current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
          )}
          onRemoveMarker={(id) => {
            saved.removeMarker(id);
            setSelectedPoint(null);
          }}
          onSaveCoordinate={(point) => placeMarker(
            getPointSourceCoordinate(point),
            "coordinate",
            point.mapId ?? data?.id ?? selectedMap.id,
          )}
          onBackToParent={goBackToParent}
        />
      )}
      <div className="min-w-0 flex-1">
        {(error || mapSearchError) && (
          <div
            role="alert"
            className="pointer-events-none absolute left-1/2 top-5 z-50 max-w-sm -translate-x-1/2 rounded-[var(--radius-md)] border border-warning/40 bg-surface/95 px-3 py-2 text-center text-xs text-white shadow-lg"
          >
            {t("map.data.errorBody")}
          </div>
        )}
        {atlasOverview ? (
          <MapAtlasOverview
            key={activeAtlas.id}
            atlas={activeAtlas}
            maps={MAP_DEFINITIONS}
            connections={verifiedMapConnections}
            points={renderedPoints}
            selectedMapId={selectedMap.id}
            selectedPoint={resolvedSelectedPoint}
            focusPoint={focusPoint}
            onSelectPoint={selectPoint}
          />
        ) : (
          <InteractiveMap
            key={data!.id}
            data={data!}
            points={renderedPoints}
            selectedPoint={resolvedSelectedPoint}
            focusPoint={focusPoint}
            placementMode={placementMode}
            livePosition={livePosition}
            followLivePosition={followLivePosition}
            onToggleFollowLivePosition={onToggleFollowLivePosition}
            controlsIntroVisible={controlsIntroVisible}
            minimapMode={minimapMode}
            onSelectPoint={selectPoint}
            onPlaceMarker={(coordinate) => placeMarker(coordinate, "placement")}
            onTogglePlacement={() => setPlacementMode((current) => !current)}
          />
        )}
      </div>
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
