import { useEffect, useMemo, useRef, useState } from "react";
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
import InteractiveMap from "./interactive-map";
import { DEFAULT_MARKER_GROUP, MARKER_GROUPS } from "./marker-group-config";
import { DEFAULT_CATEGORY_IDS } from "./map-config";
import MapDataState from "./map-data-state";
import { createMapSearchDocument, groupMapSearchMatches, searchMapDocuments } from "./map-fuzzy-search";
import type { PersonalMarkerLayer } from "./map-personal-marker-filter";
import MapPrimaryControls from "./map-primary-controls";
import { MAP_DEFINITIONS, MAP_WORKSPACE_KIND } from "./map-registry";
import WorldMapWorkspace from "../worlds/world-map-workspace";
import type { WorldStructureSearchRequest } from "../worlds/world-structure-search-request";
import type { WorldCreateRequest, WorldMapSurface } from "../worlds/world-types";
import MapSearchOverlay from "./map-search-overlay";
import MapSidebar, { type MapSidebarMode } from "./map-sidebar";
import { ONBOARDING_MAP_PANEL_EVENT, type OnboardingMapPanel } from "../onboarding/onboarding-map-panel";
import { MAP_FOCUS_REQUEST_KEY } from "./map-window-bridge";
import type { MapWindowCommand } from "./map-window-command";
import OverlayPointCard from "./overlay-point-card";
import { isUserMapMarker, type MapPoint, type UserMarkerGroup } from "./types";
import { useMapData } from "./use-map-data";
import { saveMapReferencePoint, useMapReferencePoint } from "./use-map-reference-point";
import { useSavedMapState } from "./use-saved-map-state";
import { useSelectedMap } from "./use-selected-map";

/** Typing pause after which a search is reported once, not per keystroke. */
const SEARCH_REPORT_DELAY_MS = 900;
/** Place rows the search dropdown shows. */
const LOCATION_RESULT_LIMIT = 8;
/** A category with more markers than this starts hidden, whatever its config says. */
const DEFAULT_CATEGORY_MARKER_LIMIT = 1_000;

const CATEGORY_STORAGE_KEY_PREFIX = "gm:active-categories:";
const SIDEBAR_STORAGE_KEY = "gm:sidebar-open";
const HIDDEN_MARKER_GROUPS_STORAGE_KEY = "gm:hidden-marker-groups";
const HIDDEN_PERSONAL_MARKER_LAYERS_STORAGE_KEY = "gm:hidden-personal-marker-layers";

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

interface MapWorkspaceProps {
  active?: boolean;
  structureSearchRequest?: WorldStructureSearchRequest | null;
  onStructureSearchApplied?: (revision: number) => void;
  compactSidebar?: boolean;
  controlsIntroVisible?: boolean;
  followLivePosition?: boolean;
  onToggleFollowLivePosition?: () => void;
  /** The in-game minimap: no sidebar, no search, a card instead of details. */
  minimapMode?: boolean;
  overlayMode?: boolean;
  /** Full-map camera/mode state is private to this window surface. */
  viewScope?: WorldMapSurface;
  zoomCommand?: MapWindowCommand | null;
  createRequest?: WorldCreateRequest | null;
  onExploreSeeds?: (edition: string, version: string) => void;
}

/**
 * The map screen: owns which map is showing, what is filtered and selected,
 * and the one rule every floating panel obeys — only one of them is open at a
 * time (Menu, Saved, a point's details). Everything the map draws is derived
 * here and handed down as props.
 */
const StaticMapWorkspace = ({
  active = true,
  compactSidebar = false,
  controlsIntroVisible = false,
  followLivePosition = false,
  onToggleFollowLivePosition,
  minimapMode = false,
  overlayMode = false,
  zoomCommand,
}: MapWorkspaceProps) => {
  const { t } = useTranslation();
  const { definition: selectedMap, select: selectMap } = useSelectedMap();
  const { data, error, loading: mapDataLoading } = useMapData(selectedMap);
  const saved = useSavedMapState();
  const livePosition = useLivePosition();
  const referencePoint = useMapReferencePoint();
  const [query, setQuery] = useState("");
  const [sidebarMode, setSidebarMode] = useState<MapSidebarMode>("explore");
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [focusPoint, setFocusPoint] = useState<MapPoint | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [hiddenPersonalMarkerLayers, setHiddenPersonalMarkerLayers] = useState<PersonalMarkerLayer[]>(
    readHiddenPersonalMarkerLayers,
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false",
  );
  useEffect(() => {
    if (minimapMode) return;
    const showPanel = (event: Event) => {
      const panel = (event as CustomEvent<OnboardingMapPanel>).detail;
      setSelectedPoint(null);
      setPlacementMode(false);
      if (panel === "explore") setSidebarMode(panel);
      setSidebarOpen(panel === "explore");
    };
    window.addEventListener(ONBOARDING_MAP_PANEL_EVENT, showPanel);
    return () => window.removeEventListener(ONBOARDING_MAP_PANEL_EVENT, showPanel);
  }, [minimapMode]);
  const [hiddenMarkerGroups, setHiddenMarkerGroups] = useState<UserMarkerGroup[]>(readHiddenMarkerGroups);
  const [categorySelection, setCategorySelection] = useState(() => {
    const stored = readStoredCategories(selectedMap.id);
    return { mapId: selectedMap.id, categories: stored ?? [], resolved: stored !== null };
  });

  const mapId = data?.id ?? selectedMap.id;
  const currentMapMarkers = useMemo(
    () => saved.markers.filter((marker) => marker.mapId === mapId),
    [mapId, saved.markers],
  );

  const allPoints = useMemo(
    () => [...(data?.locations ?? []), ...currentMapMarkers],
    [currentMapMarkers, data?.locations],
  );

  const savedPoints = useMemo(
    () => allPoints.filter((point) => point.category === "custom" || saved.favoriteIds.includes(point.id)),
    [allPoints, saved.favoriteIds],
  );

  const completedPoints = useMemo(
    () => allPoints.filter((point) => saved.completedIds.includes(point.id)),
    [allPoints, saved.completedIds],
  );

  const categoryCounts = useMemo(
    () => allPoints.reduce<Record<string, number>>((counts, point) => {
      counts[point.category] = (counts[point.category] ?? 0) + 1;
      return counts;
    }, {}),
    [allPoints],
  );

  const activeCategories = useMemo(() => {
    if (categorySelection.mapId === selectedMap.id && categorySelection.resolved) {
      return categorySelection.categories;
    }
    const stored = readStoredCategories(selectedMap.id);
    if (stored !== null) return stored;
    return mapDataLoading || !data ? [] : getDefaultCategories(categoryCounts);
  }, [categoryCounts, categorySelection, data, mapDataLoading, selectedMap.id]);

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
  const searchOrigin = livePosition.position ?? referencePoint;

  const coordinatePoint = useMemo<MapPoint | null>(() => {
    if (!data) return null;
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
  }, [data, query, t]);

  // What a place ANSWERS TO (its names) stays separate from what merely
  // describes it (region, kind, coordinates): context is real evidence, but it
  // can never outrank someone typing an actual name.
  const searchDocuments = useMemo(() => allPoints.map((point) => createMapSearchDocument(
    point,
    [point.name, point.label],
    [point.region, point.label, point.subtype, point.x, point.y].join(" "),
  )), [allPoints]);

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

  // The pins the map keeps while a search is running — every match, uncapped,
  // even though the dropdown lists only the strongest leads.
  const searchMatchIds = useMemo(
    () => new Set(locationMatches.map(({ point }) => point.id)),
    [locationMatches],
  );

  const visiblePoints = useMemo(() => {
    const searching = query.trim().length > 0;
    const matches = allPoints.filter((point) => {
      const savedLayerPoint = point.category === "custom" || saved.favoriteIds.includes(point.id);
      const completedLayerPoint = saved.completedIds.includes(point.id);
      const personalLayerPoint = savedLayerPoint || completedLayerPoint;
      const personalLayerVisible = (savedLayerPoint && !hiddenPersonalMarkerLayers.includes("saved"))
        || (completedLayerPoint && !hiddenPersonalMarkerLayers.includes("completed"));
      if (personalLayerPoint ? !personalLayerVisible : !activeCategories.includes(point.category)) return false;
      if (isUserMapMarker(point) && hiddenMarkerGroups.includes(point.group ?? DEFAULT_MARKER_GROUP)) return false;
      if (sidebarMode === "saved" && !personalLayerPoint) return false;
      return !searching || searchMatchIds.has(point.id);
    });
    return coordinatePoint && sidebarMode !== "saved"
      ? [coordinatePoint, ...matches]
      : matches;
  }, [activeCategories, allPoints, coordinatePoint, hiddenMarkerGroups, hiddenPersonalMarkerLayers, query, searchMatchIds, saved.completedIds, saved.favoriteIds, sidebarMode]);

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

  // The sidebar modes are this app's "pages" (/map, /map/saved). The minimap
  // overlay renders no sidebar, so it never reports pageviews.
  const dataId = data?.id;
  useEffect(() => {
    if (!active || minimapMode || !dataId) return;
    reportMapPageview(sidebarMode, dataId);
  }, [active, dataId, minimapMode, sidebarMode]);

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
        if (placementMode) {
          setPlacementMode(false);
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
  }, [active, minimapMode, placementMode, selectedPoint, sidebarOpen]);

  // A personal marker's details must follow its edits (rename, restyle), so the
  // selection resolves to the live stored copy rather than the clicked snapshot.
  const resolvedSelectedPoint = selectedPoint?.subtype === "custom"
    ? saved.markers.find((marker) => marker.id === selectedPoint.id) ?? null
    : selectedPoint;

  useEffect(() => {
    if (resolvedSelectedPoint) saveMapReferencePoint(resolvedSelectedPoint);
  }, [resolvedSelectedPoint]);
  const renderedPoints = resolvedSelectedPoint && !visiblePoints.some((point) => point.id === resolvedSelectedPoint.id)
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
  }, [allPoints, minimapMode]);

  if (mapDataLoading || !data) return <MapDataState error={error} compact={minimapMode} />;

  /** Writes the visible layer set once, so every filter control (single
   *  toggle, group checkbox, "Only") persists through the same path. */
  const applyCategories = (categories: string[]) => {
    localStorage.setItem(categoryStorageKey(selectedMap.id), JSON.stringify(categories));
    setCategorySelection({ mapId: selectedMap.id, categories, resolved: true });
  };

  const selectPoint = (point: MapPoint | null, source: MarkerOpenSource = "map") => {
    setSelectedPoint(point);
    if (point) {
      recordMarkerOpened(point, { map: data.id, source });
      if (minimapMode) return;
      setFocusPoint({ ...point });
      if (followLivePosition) onToggleFollowLivePosition?.();
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

  const focusRegion = (regionId: string) => {
    const region = data.regions.find((candidate) => candidate.id === regionId);
    if (!region) return;
    setSidebarMode("explore");
    setSelectedPoint(null);
    saveMapReferencePoint(region);
    setFocusPoint({
      id: `region-${region.id}-${Date.now()}`,
      name: region.name,
      category: "custom",
      label: t("map.regions.label"),
      subtype: "custom",
      regionId: region.id,
      region: region.name,
      x: region.x,
      y: region.y,
    });
  };

  const switchMap = (nextMapId: string) => {
    if (nextMapId === selectedMap.id) return;
    setQuery("");
    setSelectedPoint(null);
    setFocusPoint(null);
    setPlacementMode(false);
    selectMap(nextMapId);
    track(EVENTS.MAP_SWITCHED, { map: nextMapId });
  };

  const placeMarker = (coordinate: { x: number; y: number }, source: "placement" | "coordinate") => {
    const marker = saved.addMarker(
      coordinate,
      source === "coordinate"
        ? t("map.custom.coordinateName", { x: Math.round(coordinate.x), y: Math.round(coordinate.y) })
        : t("map.custom.defaultName", { count: currentMapMarkers.length + 1 }),
      t("map.categories.custom"),
      t("map.custom.personal"),
      data.id,
    );
    track(EVENTS.CUSTOM_MARKER_CREATED, { source, map: data.id });
    setQuery("");
    setSidebarMode("explore");
    setPlacementMode(false);
    setSelectedPoint(marker);
    setFocusPoint({ ...marker });
    setSidebarOpen(true);
  };

  const filtersOpen = sidebarOpen && !resolvedSelectedPoint && sidebarMode === "explore";
  const savedOpen = sidebarOpen && !resolvedSelectedPoint && sidebarMode === "saved";

  /** Opening any panel closes the others; a second press on an open panel closes it. */
  const togglePanel = (mode: MapSidebarMode) => {
    const alreadyOpen = mode === "explore" ? filtersOpen : savedOpen;
    if (alreadyOpen) {
      setSidebarOpen(false);
      return;
    }
    setSelectedPoint(null);
    setSidebarMode(mode);
    setSidebarOpen(true);
  };

  return (
    // The map owns the full frame; the sidebar floats over it as a panel, so
    // opening or closing it never resizes the world underneath.
    <div className={cn("relative flex h-full min-h-0 w-full", overlayMode ? "bg-transparent" : "bg-background")}>
      {!minimapMode && (
        // Single top row: panel buttons on the left, region jump and search right.
        <div className="pointer-events-none absolute inset-x-5 top-5 z-50 flex flex-wrap items-start justify-between gap-2.5">
          <MapPrimaryControls
            filtersOpen={filtersOpen}
            savedOpen={savedOpen}
            onToggleFilters={() => togglePanel("explore")}
            onToggleSaved={() => togglePanel("saved")}
            maps={MAP_DEFINITIONS}
            selectedMapId={selectedMap.id}
            onSelectMap={switchMap}
          />
          <MapSearchOverlay
            query={query}
            locations={locationResults}
            regions={data.regions}
            onQueryChange={handleQueryChange}
            onSelect={(point) => selectPoint(point, "sidebar")}
            onSelectRegion={focusRegion}
          />
        </div>
      )}
      {!minimapMode && (
        <MapSidebar
          data={data}
          selectedPoint={resolvedSelectedPoint}
          mode={sidebarMode}
          open={sidebarOpen}
          compact={compactSidebar}
          activeCategories={activeCategories}
          categoryCounts={categoryCounts}
          favoriteIds={saved.favoriteIds}
          completedIds={saved.completedIds}
          notes={saved.notes}
          markerGroupCounts={markerGroupCounts}
          hiddenMarkerGroups={hiddenMarkerGroups}
          personalMarkerCounts={personalMarkerCounts}
          hiddenPersonalMarkerLayers={hiddenPersonalMarkerLayers}
          savedPoints={savedPoints}
          completedPoints={completedPoints}
          onOpenChange={setSidebarOpen}
          onModeChange={setSidebarMode}
          onToggleCategory={(categoryId) => applyCategories(activeCategories.includes(categoryId)
            ? activeCategories.filter((item) => item !== categoryId)
            : [...activeCategories, categoryId])}
          onSetCategories={applyCategories}
          onSelectPoint={(point) => selectPoint(point, "sidebar")}
          onToggleFavorite={saved.toggleFavorite}
          onToggleCompleted={saved.toggleCompleted}
          onSaveNote={saved.saveNote}
          onRenameMarker={saved.renameMarker}
          onUpdateMarkerStyle={saved.updateMarkerStyle}
          onUpdateMarkerGroup={saved.updateMarkerGroup}
          onToggleMarkerGroup={(group) => setHiddenMarkerGroups((current) =>
            current.includes(group) ? current.filter((item) => item !== group) : [...current, group],
          )}
          onTogglePersonalMarkerLayer={(layer) => setHiddenPersonalMarkerLayers((current) =>
            current.includes(layer) ? current.filter((item) => item !== layer) : [...current, layer],
          )}
          onRemoveMarker={(id) => {
            saved.removeMarker(id);
            setSelectedPoint(null);
          }}
          onSaveCoordinate={(point) => placeMarker(point, "coordinate")}
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
          points={renderedPoints}
          selectedPoint={resolvedSelectedPoint}
          focusPoint={focusPoint}
          placementMode={placementMode}
          livePosition={livePosition}
          followLivePosition={followLivePosition}
          onToggleFollowLivePosition={onToggleFollowLivePosition}
          controlsIntroVisible={controlsIntroVisible}
          minimapMode={minimapMode}
          zoomCommand={zoomCommand}
          onSelectPoint={selectPoint}
          onPlaceMarker={(coordinate) => placeMarker(coordinate, "placement")}
          onTogglePlacement={() => setPlacementMode((current) => !current)}
        />
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

const MapWorkspace = (props: MapWorkspaceProps) => MAP_WORKSPACE_KIND === "generated"
  ? <WorldMapWorkspace active={props.active} minimapMode={props.minimapMode} followLivePosition={props.followLivePosition}
      viewScope={props.viewScope} zoomCommand={props.zoomCommand} onToggleFollowLivePosition={props.onToggleFollowLivePosition}
      createRequest={props.createRequest} onExploreSeeds={props.onExploreSeeds}
      structureSearchRequest={props.structureSearchRequest} onStructureSearchApplied={props.onStructureSearchApplied} />
  : <StaticMapWorkspace {...props} />;

export default MapWorkspace;
