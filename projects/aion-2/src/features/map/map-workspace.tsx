import type { ReferenceTarget } from "../reference/reference-types";
import { navigateReferenceHistory } from "../reference/reference-history";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { ArrowLeft } from "lucide-react";
import { cn } from "../../lib/cn";
import { track } from "../../services/optional-usage";
import {
  recordMarkerOpened,
  type MarkerOpenSource,
} from "../../services/optional-usage";
import { reportMapPageview } from "../../state/use-analytics";
import InteractiveMap, { type MapCameraFocus } from "./interactive-map";
import { DEFAULT_CATEGORY_IDS, FILTER_CATEGORIES, getPointFilterCategories, isMapCategoryAvailable, type MapCategoryGroupId } from "./map-config";
import MapDataState from "./map-data-state";
import MapEventsPanel from "./map-events-panel";
import EventDiscoveryCard from "../events/event-discovery-card";
import { groupNearbySameNameLocations } from "./map-nearby-locations";
import { createMapSearchDocument, groupMapSearchMatches, searchMapDocuments } from "./map-fuzzy-search";
import MapPrimaryControls from "./map-primary-controls";
import { MAP_DEFINITIONS } from "./map-registry";
import MapSearchOverlay from "./map-search-overlay";
import MapSidebar from "./map-sidebar";
import { MAP_MARKER_SIZE_PANEL_EVENT } from "./map-marker-size-navigation";
import { MAP_FILTER_GROUP_EVENT } from "./map-filter-navigation";
import { MAP_FOCUS_REQUEST_KEY, requestMapPointInMain, requestMapReferenceInMain } from "./map-window-bridge";
import { getLocalizedMapPointDisplayName } from "./map-point-display-name";
import { createMapOverviewFocusPoint, createMapRegionFocusPoint, resolveMapFocusPoint, type MapFocusRequest } from "./map-focus-request";
import OverlayPointCard from "./overlay-point-card";
import { isUserMapMarker, type MapMarkerTarget, type MapPoint, type UserMapMarker } from "./types";
import { useMapData } from "./use-map-data";
import { saveMapReferencePoint, useMapReferencePoint } from "./use-map-reference-point";
import { useSavedMapState } from "./use-saved-map-state";
import { ONBOARDING_MAP_PANEL_EVENT, type OnboardingMapPanel } from "../onboarding/onboarding-map-panel";
import { useSelectedMap } from "./use-selected-map";
import { useMapFilterPreferences } from "./use-map-filter-preferences";
import { setMapFilterCategories, toggleMapFilterHiddenLayer } from "./map-filter-preferences";
import { getMapCompanionSources } from "./map-companion-sources";
import { getMapPetSources, listMapPetSources, petFilterId } from "./map-pet-sources";
import { DEFAULT_MARKER_GROUP } from "./marker-group-config";
import { activeMapEvents } from "../events/active-map-events";
import { eventServerTimeZone } from "../events/event-server-region";
import { useEventCatalog } from "../events/use-event-catalog";
import { useEventPreferences } from "../events/use-event-preferences";

/** Typing pause after which a search is reported once, not per keystroke. */
const SEARCH_REPORT_DELAY_MS = 900;
/** Place rows the search dropdown shows. */
const LOCATION_RESULT_LIMIT = 8;
/** Same-name enemy spawn points inside this share of the map merge into one marker. */
const NEARBY_ENEMY_RADIUS_RATIO = 1 / 320;
const referenceSearchRegion = (region: string, mapName: string) =>
  region && !region.includes("\uFFFD") ? region : mapName;
const DRAFT_MARKER_PREFIX = "draft-custom-";
const isDraftMarker = (point: MapPoint | null): point is UserMapMarker =>
  point !== null && isUserMapMarker(point) && point.id.startsWith(DRAFT_MARKER_PREFIX);

const SIDEBAR_STORAGE_KEY = "gm:sidebar-open";

interface MapWorkspaceProps {
  active?: boolean;
  /** Space reserved above the bottom margin for external map controls. */
  bottomInset?: number;
  onSelectedMarkerChange?: (marker: MapMarkerTarget | null) => void;
  onReturnToPanel?: () => void;
  returnDestination?: { mapId: string; pointId: string };
  returnToQuestPage?: boolean;
  compactSidebar?: boolean;
  controlsIntroVisible?: boolean;
  /** The in-game minimap: no sidebar, no search, a card instead of details. */
  minimapMode?: boolean;
  desktopFollow?: boolean;
  overlayMode?: boolean;
  onOpenEvents?: () => void;
}

/**
 * The map screen: owns which map is showing, what is filtered and selected,
 * and the one rule every floating panel obeys — only one of them is open at a
 * time (filters or a point's details). Everything the map draws is derived
 * here and handed down as props.
 */
const MapWorkspace = ({
  active = true,
  bottomInset = 0,
  onSelectedMarkerChange,
  onReturnToPanel,
  returnDestination,
  returnToQuestPage = false,
  compactSidebar = false,
  controlsIntroVisible = false,
  minimapMode = false,
  desktopFollow = false,
  overlayMode = false,
  onOpenEvents,
}: MapWorkspaceProps) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const { definition: selectedMap, select: selectMap } = useSelectedMap();
  const { data, error, loading: mapDataLoading } = useMapData(selectedMap);
  const { events, status: eventStatus } = useEventCatalog();
  const { preferences: eventPreferences } = useEventPreferences();
  const [scheduleNow, setScheduleNow] = useState(Date.now);
  const timeZone = eventServerTimeZone(eventPreferences.serverRegion);
  const { byMarkerId: activeEventMarkers, nextChangeAt } = useMemo(
    () => activeMapEvents(events, selectedMap.id, scheduleNow, timeZone),
    [events, selectedMap.id, scheduleNow, timeZone],
  );
  useEffect(() => {
    if (!active) return;
    const delay = Math.max(100, Math.min(60_000, (nextChangeAt ?? scheduleNow + 60_000) - Date.now() + 50));
    const timer = window.setTimeout(() => setScheduleNow(Date.now()), delay);
    const refresh = () => { if (!document.hidden) setScheduleNow(Date.now()); };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, nextChangeAt, scheduleNow]);
  const saved = useSavedMapState();
  const referencePoint = useMapReferencePoint();
  const [query, setQuery] = useState("");
  const [referenceFilter, setReferenceFilter] = useState<{
    referenceId?: string; itemId?: string; markerIds?: ReadonlySet<string>; query: string; region?: string;
  } | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [selectedSource, setSelectedSource] = useState<{ mapId: string; point: MapPoint; context: MapFocusRequest["sourceContext"] } | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{ mapId: string; pointId: string; history: ReferenceTarget[] } | null>(null);
  const [returnPanel, setReturnPanel] = useState<{
    mapId: string; pointId: string; name: string; history: ReferenceTarget[];
    sourceContext?: MapFocusRequest["sourceContext"];
    destination: { mapId: string; pointId: string };
  } | null>(null);
  const pendingReturn = useRef<typeof returnPanel>(null);
  const [trackedInsetVisibility, setTrackedInsetVisibility] = useState<{ key: string; visible: boolean } | null>(null);
  const [focusPoint, setFocusPoint] = useState<MapCameraFocus | null>(null);
  const { categories: storedCategories, hideCompleted, hideFavorites } = useMapFilterPreferences(selectedMap.id);
  const [placementMode, setPlacementMode] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const topControlsRef = useRef<HTMLDivElement>(null);
  const [topControlsHeight, setTopControlsHeight] = useState(44);
  const [draftSource, setDraftSource] = useState<"placement" | "coordinate" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false",
  );
  const [eventDiscoveryHeight, setEventDiscoveryHeight] = useState(0);
  const eventDiscoveryBottom = Math.max(64, 20 + bottomInset);
  const [markerSizePanelOpen, setMarkerSizePanelOpen] = useState(false);
  const [requestedFilterGroup, setRequestedFilterGroup] = useState<{ groupId: MapCategoryGroupId } | null>(null);
  const handleFilterGroupOpened = useCallback((request: { groupId: MapCategoryGroupId }) => {
    setRequestedFilterGroup((current) => current === request ? null : current);
  }, []);
  useEffect(() => {
    if (minimapMode) return;
    const openFilterGroup = (event: Event) => {
      const groupId = (event as CustomEvent<MapCategoryGroupId>).detail;
      setSelectedPoint(null);
      setSelectedDetail(null);
      setSelectedSource(null);
      setPlacementMode(false);
      setEventsOpen(false);
      setMarkerSizePanelOpen(false);
      setSidebarOpen(true);
      setRequestedFilterGroup({ groupId });
    };
    window.addEventListener(MAP_FILTER_GROUP_EVENT, openFilterGroup);
    return () => window.removeEventListener(MAP_FILTER_GROUP_EVENT, openFilterGroup);
  }, [minimapMode]);
  useEffect(() => {
    if (minimapMode) return;
    const openMarkerSizes = () => {
      setSelectedPoint(null);
      setSelectedDetail(null);
      setSelectedSource(null);
      setPlacementMode(false);
      setEventsOpen(false);
      setSidebarOpen(true);
      setMarkerSizePanelOpen(true);
    };
    window.addEventListener(MAP_MARKER_SIZE_PANEL_EVENT, openMarkerSizes);
    return () => window.removeEventListener(MAP_MARKER_SIZE_PANEL_EVENT, openMarkerSizes);
  }, [minimapMode]);
  useEffect(() => {
    if (minimapMode || !topControlsRef.current) return;
    const controls = topControlsRef.current;
    const measure = () => setTopControlsHeight(controls.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    return () => observer.disconnect();
  }, [minimapMode]);
  useEffect(() => {
    if (minimapMode) return;
    const showPanel = (event: Event) => {
      const mode = (event as CustomEvent<OnboardingMapPanel>).detail;
      if (mode !== "explore" && mode !== null) return;
      setSelectedPoint(null);
      setSelectedDetail(null);
      setPlacementMode(false);
      setSidebarOpen(mode === "explore");
    };
    window.addEventListener(ONBOARDING_MAP_PANEL_EVENT, showPanel);
    return () => window.removeEventListener(ONBOARDING_MAP_PANEL_EVENT, showPanel);
  }, [minimapMode]);

  const mapId = data?.id ?? selectedMap.id;
  useEffect(() => {
    onSelectedMarkerChange?.(selectedPoint ? { mapId, markerId: selectedPoint.id, name: selectedPoint.name } : null);
  }, [mapId, onSelectedMarkerChange, selectedPoint]);

  const selectedReferenceHistory = selectedDetail?.mapId === mapId && selectedDetail.pointId === selectedPoint?.id
    ? selectedDetail.history
    : [];
  const currentMapMarkers = useMemo(
    () => saved.markers.filter((marker) => marker.mapId === mapId),
    [mapId, saved.markers],
  );

  const sourcePoints = useMemo(
    () => [...(data?.locations ?? []), ...currentMapMarkers].filter((point) => isMapCategoryAvailable(point.category)),
    [currentMapMarkers, data?.locations],
  );

  const categoryCounts = useMemo(() => {
    const counts = sourcePoints.reduce<Record<string, number>>((counts, point) => {
      for (const categoryId of getPointFilterCategories(point)) {
        counts[categoryId] = (counts[categoryId] ?? 0) + 1;
      }
      return counts;
    }, {});
    counts.region = data?.regions.filter((region) => !region.inset).length ?? 0;
    return counts;
  }, [sourcePoints, data?.regions]);
  const pets = useMemo(() => listMapPetSources(sourcePoints), [sourcePoints]);

  const activeCategories = useMemo(() => {
    const resolvePetCategories = (categories: string[]) => categories.includes("pet-souls")
      ? [...new Set([...categories.filter((id) => id !== "pet-souls"), ...pets.map(({ id }) => petFilterId(id))])]
      : categories;
    if (storedCategories !== null) return resolvePetCategories(storedCategories);
    return mapDataLoading || !data ? [] : DEFAULT_CATEGORY_IDS;
  }, [storedCategories, data, mapDataLoading, pets]);

  const allPoints = sourcePoints;
  const completedPoints = useMemo(
    () => allPoints.filter((point) => saved.completedIds.includes(point.id)),
    [allPoints, saved.completedIds],
  );

  // Ties between equally good search hits go to the last place the user looked at.
  const searchOrigin = referencePoint;

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
  const searchDocuments = useMemo(() => allPoints.map((point) => createMapSearchDocument(
    point,
    [point.name, point.label, ...getMapCompanionSources(point).map(({ companion }) => companion.name),
      ...getMapPetSources(point).map(({ name }) => name)],
    [point.region, point.label, point.subtype, point.x, point.y].join(" "),
  )), [allPoints]);

  const locationMatches = useMemo(() => {
    if (referenceFilter?.query === query) {
      return allPoints.filter((point) => "reference" in point
        && (referenceFilter.markerIds?.size ? referenceFilter.markerIds.has(point.id)
          : referenceFilter.itemId ? point.itemId === referenceFilter.itemId : point.reference?.id === referenceFilter.referenceId)
        && (!referenceFilter.region || referenceSearchRegion(point.region, data?.displayName ?? "") === referenceFilter.region))
        .map((point) => ({ point, score: 0 }));
    }
    return searchMapDocuments(searchDocuments, query, searchOrigin);
  }, [allPoints, data?.displayName, query, referenceFilter, searchDocuments, searchOrigin]);
  const locationResults = useMemo(() => {
    const groups = groupMapSearchMatches(locationMatches, LOCATION_RESULT_LIMIT);
    if (!coordinatePoint) return groups;
    return [
      { point: coordinatePoint, score: -1, count: 1 },
      ...groups.filter(({ point }) => point.id !== coordinatePoint.id),
    ];
  }, [coordinatePoint, locationMatches]);

  // The pins the map keeps while a search is running — every match, uncapped,
  // even though the dropdown lists only the strongest leads.
  const searchMatchIds = useMemo(
    () => new Set(locationMatches.map(({ point }) => point.id)),
    [locationMatches],
  );

  const visiblePoints = useMemo(() => {
    const searching = query.trim().length > 0;
    const matches = allPoints.filter((point) => {
      if (searching) return searchMatchIds.has(point.id);
      const savedLayerPoint = point.category === "custom" || saved.favoriteIds.includes(point.id);
      const completedLayerPoint = saved.completedIds.includes(point.id);
      const personalLayerPoint = savedLayerPoint || completedLayerPoint;
      if (hideCompleted && completedLayerPoint) return false;
      if (hideFavorites && saved.favoriteIds.includes(point.id)) return false;
      if (!personalLayerPoint && !getPointFilterCategories(point).some((categoryId) => activeCategories.includes(categoryId))) return false;
      return true;
    });
    const filtered = coordinatePoint
      ? [coordinatePoint, ...matches]
      : matches;
    if (!data || (searching && referenceFilter?.query !== query)) return filtered;
    const protectedIds = new Set([...saved.favoriteIds, ...saved.completedIds]);
    const mapSize = Math.min(data.bounds.maxX - data.bounds.minX, data.bounds.maxY - data.bounds.minY);
    return groupNearbySameNameLocations(filtered, "enemy", mapSize * NEARBY_ENEMY_RADIUS_RATIO, protectedIds);
  }, [activeCategories, allPoints, coordinatePoint, data, hideCompleted, hideFavorites, query, referenceFilter?.query, searchMatchIds, saved.completedIds, saved.favoriteIds]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  // The minimap overlay renders no sidebar, so it never reports pageviews.
  const dataId = data?.id;
  useEffect(() => {
    if (!active || minimapMode || !dataId) return;
    reportMapPageview(dataId);
  }, [active, dataId, minimapMode]);

  // One MAP_SEARCHED per settled query, not one per keystroke.
  const searchReportRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(searchReportRef.current), []);

  // Escape closes things innermost-first; Ctrl+K jumps to the search box.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!minimapMode && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>("#map-search-input");
        window.requestAnimationFrame(() => searchInput?.focus());
      }
      if (event.key === "Escape") {
        if (minimapMode) {
          if (selectedPoint) setSelectedPoint(null);
          return;
        }
        if (eventsOpen) {
          setEventsOpen(false);
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
        if (sidebarOpen) setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, eventsOpen, minimapMode, placementMode, selectedReferenceHistory.length, selectedPoint, sidebarOpen]);

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

  useEffect(() => {
    if (resolvedSelectedPoint && !isDraftMarker(resolvedSelectedPoint)) saveMapReferencePoint(resolvedSelectedPoint);
  }, [resolvedSelectedPoint]);
  // A selected marker remains visible even when its category is filtered out.
  // Use its exact point when a nearby group shares the same marker ID.
  const renderedPoints = resolvedSelectedPoint
    ? [...visiblePoints.filter((point) => point.id !== resolvedSelectedPoint.id), resolvedSelectedPoint]
    : visiblePoints;

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
      if (!request || (request.mapId && !MAP_DEFINITIONS.some((map) => map.id === request.mapId))) return;
      if (request.mapId && request.mapId !== selectedMap.id) {
        setSelectedPoint(null);
        setFocusPoint(null);
        setQuery("");
        setReferenceFilter(null);
        selectMap(request.mapId);
        return;
      }
      if (request.searchQuery?.trim()) {
        if ((request.referenceId || request.searchItemId) && (!data || (request.mapId && data.id !== request.mapId))) return;
        localStorage.removeItem(MAP_FOCUS_REQUEST_KEY);
        setSelectedPoint(null);
        setSelectedDetail(null);
        setSelectedSource(null);
        const searchQuery = request.searchQuery.trim();
        const requestedPoint = request.pointId ? data?.locations.find((point) => point.id === request.pointId) : undefined;
        const requestedRegion = request.allRegions ? undefined : requestedPoint && data
          ? referenceSearchRegion(requestedPoint.region, data.displayName)
          : request.region;
        setQuery(searchQuery);
        setReferenceFilter(request.referenceId || request.searchItemId
          ? { referenceId: request.referenceId, itemId: request.searchItemId,
            markerIds: request.searchMarkerIds?.length ? new Set(request.searchMarkerIds) : undefined, query: searchQuery,
            region: request.referenceId ? requestedRegion : undefined } : null);
        if ((request.referenceId || request.searchItemId) && data) {
          const matches = data.locations.filter((point) =>
            (request.searchMarkerIds?.length ? request.searchMarkerIds.includes(point.id)
              : request.searchItemId ? point.itemId === request.searchItemId : point.reference?.id === request.referenceId)
            && (!request.referenceId || !requestedRegion || referenceSearchRegion(point.region, data.displayName) === requestedRegion));
          const requestedMatch = matches.find((point) => point.id === request.pointId);
          const selectedMatch = requestedMatch ?? (request.referenceId
            ? matches.find((point) => point.category === "enemy") : undefined);
          if (selectedMatch) {
            setSelectedPoint(selectedMatch);
            setFocusPoint({ point: { ...selectedMatch },
              zoom: request.zoom, preserveZoom: true, centerOnPoint: true });
            setSidebarOpen(true);
            if (selectedMatch.id !== request.pointId) setReturnPanel((current) => current?.destination.mapId === data.id
              && current.destination.pointId === request.pointId
              ? { ...current, destination: { mapId: data.id, pointId: selectedMatch.id } } : current);
            return;
          }
          setSidebarOpen(false);
          if (matches.length) {
            const bounds = matches.reduce((frame, point) => ({
              minX: Math.min(frame.minX, point.x), minY: Math.min(frame.minY, point.y),
              maxX: Math.max(frame.maxX, point.x), maxY: Math.max(frame.maxY, point.y),
            }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
            setFocusPoint({
              point: { ...createMapOverviewFocusPoint(data),
                x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
              bounds, zoom: request.zoom,
            });
          }
        }
        if (!request.referenceId && !request.searchItemId) window.requestAnimationFrame(() => document.getElementById("map-search-input")?.focus());
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
      const point = resolveMapFocusPoint(request, data, [...data.locations, ...currentMapMarkers]);
      if (!point) return;
      if (request.destination?.companionId || point.category === "rift" || point.category === "event-object") {
        const categories = [...new Set([...activeCategories, point.category])];
        setMapFilterCategories(selectedMap.id, categories);
      }
      localStorage.removeItem(MAP_FOCUS_REQUEST_KEY);
      setQuery("");
      setReferenceFilter(null);
      const returning = pendingReturn.current?.mapId === data.id && pendingReturn.current.pointId === point.id
        ? pendingReturn.current : null;
      setSelectedDetail(returning?.history.length
        ? { mapId: data.id, pointId: point.id, history: returning.history } : null);
      setSelectedPoint(point.subtype === "region" ? null : point);
      const sourceContext = returning?.sourceContext ?? request.sourceContext;
      setSelectedSource(sourceContext ? { mapId: data.id, point, context: sourceContext } : null);
      if (returning) {
        pendingReturn.current = null;
        setReturnPanel(null);
      }
      if (point.subtype === "region" || point.category === "rift") {
        if (point.subtype === "region") saveMapReferencePoint(point);
      }
      setFocusPoint({ point: { ...point },
        zoom: request.zoom,
        preserveZoom: request.preserveZoom,
        centerOnPoint: request.centerOnPoint });
      setSidebarOpen(true);
    };
    window.addEventListener("storage", focusRequestedPoint);
    window.addEventListener(MAP_FOCUS_REQUEST_KEY, focusRequestedPoint);
    focusRequestedPoint(new Event(MAP_FOCUS_REQUEST_KEY));
    return () => {
      window.removeEventListener("storage", focusRequestedPoint);
      window.removeEventListener(MAP_FOCUS_REQUEST_KEY, focusRequestedPoint);
    };
  }, [active, activeCategories, currentMapMarkers, data, minimapMode, selectedMap.id, selectMap]);

  if (mapDataLoading || !data) return <MapDataState error={error} compact={minimapMode} />;

  const destination = returnPanel?.destination ?? returnDestination;
  const destinationInsetId = destination?.mapId === data.id && destination.pointId.startsWith("region:")
    ? destination.pointId.slice("region:".length) : undefined;
  const destinationInset = data.insets?.find((inset) => inset.id === destinationInsetId);
  const destinationInsetKey = destinationInset ? `${data.id}:${destinationInset.id}` : undefined;
  const destinationVisible = !!destinationInset
    && trackedInsetVisibility?.key === destinationInsetKey && trackedInsetVisibility?.visible === true;
  const markerPanelReturnAvailable = !!returnPanel && data.id === returnPanel.destination.mapId
    && (resolvedSelectedPoint?.id === returnPanel.destination.pointId
      || (referenceFilter?.query === query && !!referenceFilter.referenceId
        && resolvedSelectedPoint && "reference" in resolvedSelectedPoint
        && resolvedSelectedPoint.reference?.id === referenceFilter.referenceId));
  const regionReturnAvailable = !!returnPanel && destinationVisible;
  const pageReturnAvailable = !!onReturnToPanel && (returnToQuestPage || destinationVisible);
  const returnToPreviousMarker = () => {
    if (!returnPanel) return;
    pendingReturn.current = returnPanel;
    requestMapPointInMain(returnPanel.pointId, returnPanel.mapId, undefined, true);
  };

  /** Writes the visible layer set once, so every filter control (single
   *  toggle, group checkbox, "Only") persists through the same path. */
  const applyCategories = (categories: string[]) => {
    setMapFilterCategories(selectedMap.id, categories);
  };

  const selectPoint = (
    point: MapPoint | null,
    source: MarkerOpenSource = "map",
    options?: { preserveZoom?: boolean },
  ) => {
    if (point && isDraftMarker(point) && isDraftMarker(selectedPoint) && point.id === selectedPoint.id) return;
    setEventsOpen(false);
    setDraftSource(null);
    setSelectedSource(null);
    setMarkerSizePanelOpen(false);
    setSelectedPoint(point);
    if (point) {
      recordMarkerOpened(point, { map: data.id, source });
      if (minimapMode) return;
      setFocusPoint({ point: { ...point }, preserveZoom: source === "map" || options?.preserveZoom,
        moveOnlyIfObscured: source === "map" });
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
    setReferenceFilter(null);
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
    setSelectedPoint(null);
    saveMapReferencePoint(region);
    setFocusPoint({ point: createMapRegionFocusPoint(region) });
  };

  const switchMap = (nextMapId: string) => {
    if (nextMapId === selectedMap.id) return;
    setQuery("");
    setReferenceFilter(null);
    setSelectedPoint(null);
    setDraftSource(null);
    setFocusPoint(null);
    setPlacementMode(false);
    selectMap(nextMapId);
    track("MAP_SWITCHED", { map: nextMapId });
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
      color: "sage",
      icon: "pin",
      group: DEFAULT_MARKER_GROUP,
      mapId: data.id,
    };
    setDraftSource(source);
    setQuery("");
    setPlacementMode(false);
    setSelectedPoint(marker);
    setFocusPoint({ point: { ...marker } });
    setSidebarOpen(true);
  };

  const createMarker = (name: string, note: string) => {
    if (!isDraftMarker(selectedPoint) || !draftSource || !name.trim()) return;
    const marker = saved.addMarker(selectedPoint, name, selectedPoint.label, selectedPoint.region, data.id, {
      color: selectedPoint.color,
      icon: selectedPoint.icon,
      group: selectedPoint.group,
      note,
    });
    track("CUSTOM_MARKER_CREATED", { source: draftSource, map: data.id });
    setDraftSource(null);
    setSelectedPoint(marker);
    setFocusPoint({ point: { ...marker } });
  };

  const filtersOpen = sidebarOpen && !resolvedSelectedPoint && !markerSizePanelOpen;

  /** A second press on the filter button closes the sidebar. */
  const toggleFilters = () => {
    setEventsOpen(false);
    if (markerSizePanelOpen) {
      setMarkerSizePanelOpen(false);
      setSidebarOpen(true);
      return;
    }
    const alreadyOpen = sidebarOpen && !resolvedSelectedPoint;
    if (alreadyOpen) {
      setSidebarOpen(false);
      return;
    }
    setSelectedPoint(null);
    setSelectedDetail(null);
    setPlacementMode(false);
    setSidebarOpen(true);
  };
  return (
    // The map owns the full frame; the sidebar floats over it as a panel, so
    // opening or closing it never resizes the world underneath.
    <div data-map-workspace className={cn("relative flex h-full min-h-0 w-full", overlayMode ? "bg-transparent" : "bg-background")}>
      {!minimapMode && (
        // Single top row: filter and map selection on the left, region jump and search right.
        <div ref={topControlsRef} data-app-window-top-controls className="pointer-events-none absolute inset-x-5 top-5 z-50 flex flex-nowrap items-start justify-between gap-2.5">
          <MapPrimaryControls
            filtersOpen={filtersOpen}
            activeFilterCount={FILTER_CATEGORIES.filter(({ id }) => activeCategories.includes(id)).length
              + pets.filter(({ id }) => activeCategories.includes(petFilterId(id))).length}
            onToggleFilters={toggleFilters}
            maps={MAP_DEFINITIONS}
            selectedMapId={selectedMap.id}
            onSelectMap={switchMap}
          />
          <MapSearchOverlay
            mapId={data.id}
            mapName={data.displayName}
            query={query}
            locations={locationResults}
            regions={data.regions}
            linkedSearchActive={referenceFilter?.query === query && Boolean(referenceFilter.referenceId || referenceFilter.itemId)}
            onQueryChange={handleQueryChange}
            onSelect={(point) => selectPoint(point, "sidebar")}
            onNavigate={(nextMapId, markerId, context) => requestMapPointInMain(markerId, nextMapId, context, true)}
            onSelectRegion={focusRegion}
          />
        </div>
      )}
      {!minimapMode && <MapEventsPanel events={events} status={eventStatus} open={eventsOpen} top={20 + topControlsHeight + 16}
        onToggle={() => {
          if (!eventsOpen) {
            setSelectedPoint(null);
            setSelectedDetail(null);
            setPlacementMode(false);
            setSidebarOpen(false);
          }
          setEventsOpen((current) => !current);
        }}
        onClose={() => setEventsOpen(false)}
        onOpenEvents={onOpenEvents ? () => { setEventsOpen(false); onOpenEvents(); } : undefined} />}
      {!minimapMode && (
        <MapSidebar
          data={data}
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
          onOpenMapFromReference={(nextMapId, markerId, search) => {
            setReturnPanel(resolvedSelectedPoint ? {
              mapId: data.id,
              pointId: resolvedSelectedPoint.id,
              name: getLocalizedMapPointDisplayName(resolvedSelectedPoint, gameText),
              history: selectedReferenceHistory,
              sourceContext: selectedSource?.mapId === data.id && selectedSource.point === selectedPoint
                ? selectedSource.context : undefined,
              destination: { mapId: nextMapId, pointId: markerId },
            } : null);
            setSelectedDetail(null);
            if (search) requestMapReferenceInMain(search.referenceId, search.name, nextMapId, search.region, markerId, search.allRegions);
            else requestMapPointInMain(markerId, nextMapId, undefined, true);
          }}
          returnToMarker={markerPanelReturnAvailable && returnPanel
            ? { name: returnPanel.name, onReturn: returnToPreviousMarker } : undefined}
          selectedPoint={resolvedSelectedPoint}
          draftMarker={isDraftMarker(resolvedSelectedPoint)}
          markerNotes={saved.notes}
          onCreateMarker={createMarker}
          onSaveMarkerEdits={saved.saveMarkerEdits}
          open={sidebarOpen}
          bottomInset={eventDiscoveryHeight ? eventDiscoveryHeight + eventDiscoveryBottom - 20 + 12 : bottomInset}
          markerSizePanelOpen={markerSizePanelOpen}
          onMarkerSizePanelOpenChange={setMarkerSizePanelOpen}
          compact={compactSidebar}
          activeCategories={activeCategories}
          pets={pets}
          requestedFilterGroup={requestedFilterGroup}
          onFilterGroupOpened={handleFilterGroupOpened}
          categoryCounts={categoryCounts}
          favoriteIds={saved.favoriteIds}
          completedIds={saved.completedIds}
          hideCompleted={hideCompleted}
          hideFavorites={hideFavorites}
          completedPoints={completedPoints}
          shownMarkerCount={visiblePoints.length + (activeCategories.includes("region") ? categoryCounts.region : 0)}
          onOpenChange={setSidebarOpen}
          onToggleCategory={(categoryId) => applyCategories(activeCategories.includes(categoryId)
            ? activeCategories.filter((item) => item !== categoryId)
            : [...activeCategories, categoryId])}
          onSetCategories={applyCategories}
          onSelectPoint={(point) => selectPoint(point, "sidebar")}
          onToggleFavorite={saved.toggleFavorite}
          onToggleCompleted={saved.toggleCompleted}
          onToggleHideCompleted={() => toggleMapFilterHiddenLayer("completed")}
          onToggleHideFavorites={() => toggleMapFilterHiddenLayer("favorites")}
          onUpdateMarkerStyle={(id, change) => {
            if (isDraftMarker(selectedPoint) && selectedPoint.id === id) setSelectedPoint({ ...selectedPoint, ...change });
          }}
          onUpdateMarkerGroup={(id, group) => {
            if (isDraftMarker(selectedPoint) && selectedPoint.id === id) setSelectedPoint({ ...selectedPoint, group });
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
          completedIds={saved.completedIds}
          trackedInsetId={destinationInset?.id}
          onTrackedInsetVisibilityChange={destinationInsetKey ? (visible) => {
            setTrackedInsetVisibility({ key: destinationInsetKey, visible });
          } : undefined}
          points={renderedPoints}
          activeEventMarkers={activeEventMarkers}
          selectedPoint={resolvedSelectedPoint}
          focusPoint={focusPoint}
          showAllMarkers={referenceFilter?.query === query}
          placementMode={placementMode}
          controlsIntroVisible={controlsIntroVisible}
          minimapMode={minimapMode}
          desktopFollow={desktopFollow}
          showRegionPins={activeCategories.includes("region")}
          onSelectPoint={(point, options) => selectPoint(point, "map", options)}
          onSelectRegion={focusRegion}
          onToggleCompleted={(point) => saved.toggleCompleted(point.id)}
          onPlaceMarker={(coordinate) => prepareMarker(coordinate, "placement")}
          onTogglePlacement={() => setPlacementMode((current) => !current)}
        />
      </div>
      {!minimapMode && !markerPanelReturnAvailable && (regionReturnAvailable || pageReturnAvailable) && <button type="button" onClick={() => {
        if (regionReturnAvailable) returnToPreviousMarker();
        else onReturnToPanel?.();
      }} data-map-ui
        className="absolute bottom-4 left-1/2 z-50 flex h-11 -translate-x-1/2 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[var(--radius-full)] border border-border bg-surface/90 px-5 text-sm font-medium text-zinc-200 shadow-lg shadow-black/30 backdrop-blur-xl transition-colors hover:border-accent/50 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        <ArrowLeft size={17} aria-hidden="true" />{regionReturnAvailable && returnPanel
          ? t("mapInteriors.backToMarker", { name: returnPanel.name })
          : t(returnToQuestPage ? "reference.adventure.backToQuestPage" : "mapInteriors.backToDetails")}
      </button>}
      {!minimapMode && <div className="absolute left-5 z-40 w-[19rem] max-w-[calc(100%-2.5rem)]" style={{ bottom: eventDiscoveryBottom }}><EventDiscoveryCard enabled={!eventsOpen && !placementMode && !resolvedSelectedPoint} onHeightChange={setEventDiscoveryHeight} /></div>}
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
