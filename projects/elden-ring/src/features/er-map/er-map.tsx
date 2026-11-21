import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer } from "react-leaflet";
import * as L from "leaflet";
import { TriangleAlert, X } from "lucide-react";
import FilterRailView from "../filters/filter-rail-view";
import { MapCameraControls } from "../map/map-controls";
import RegionLabelsLayer from "../map/region-labels-layer";
import { rawPositionFor, layerForArea, TEST_MAP_LAYERS, TEST_MAP_LAYER_ORDER } from "./raw-coordinate-system";
import ErMapBlackMapGuards from "./er-map-black-map-guards";
import { erMapContentBoundsFor } from "./er-map-bounds";
import ErMapEditControls from "./er-map-edit-controls";
import ErMapDetailPanel from "./er-map-detail-panel";
import ErMapGrid from "./er-map-grid";
import ErMapMarkerLayer from "./er-map-marker-layer";
import ErMapSelection from "./er-map-selection";
import ErMapViewCamera from "./er-map-view-camera";
import {
  loadProductionIdMap,
  useErMapManifest,
  useErMapViewMarkers,
} from "./er-map-spatial-data";
import ErMapTiles from "./er-map-tiles";
import ErMapToolbar from "./er-map-toolbar";
import SavePositionLayer from "../save-tracking/save-position-layer";
import SaveTrackingControls from "../save-tracking/save-tracking-controls";
import PositionTrackingNotice from "../save-tracking/position-tracking-notice";
import MarkerPlacer from "../custom-markers/marker-placer";
import { useCustomMarkerUi } from "../custom-markers/custom-marker-ui";
import SingleTooltipController from "../map/single-tooltip-controller";
import { erMapCustomMarker } from "./er-map-custom-marker";
import type { ErMapLayer, ErMapViewDefinition } from "./types";
import useErMapState from "./use-er-map-state";
import type { Game } from "../../data/types";
import { groupsByGame } from "../../data/categories";
import { useKeyHints } from "../hints/use-key-hints";
import { cn } from "../../lib/cn";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import {
  type MarkerOpenSource,
  recordErMarkerOpened,
} from "../../services/analytics/map-events";
import { useMapStore } from "../../store/map-store";
import { useUiStore } from "../../store/ui-store";
import { useIsMobile } from "../../utils/platform";

const FALLBACK_VIEWS: ErMapViewDefinition[] = TEST_MAP_LAYER_ORDER.map((key) => ({
  key,
  map: key,
  label: key,
  kind: "tiled",
  recordCount: 0,
  typeCounts: {},
}));

const tiledLayerFor = (view: ErMapViewDefinition | null): ErMapLayer =>
  TEST_MAP_LAYER_ORDER.find((candidate) => candidate === view?.key) ?? "overworld";

// Stable stand-in for the full-pool load below — with loadAllCategories the set is
// ignored for chunk selection, and a fixed identity keeps filter toggles from
// re-running that fetch effect.
const ALL_CATEGORIES = new Set<string>();
const NO_ACTIVE_CATEGORIES = new Set<string>();

const boundsForView = (tiledLayer: ErMapLayer) =>
  erMapContentBoundsFor(TEST_MAP_LAYERS[tiledLayer]);

/** Same threshold as the live map shell's performance nudge. */
const MARKER_WARN_THRESHOLD = 1000;

/** Quiet period after the last keystroke before a search is reported. */
const SEARCH_REPORT_DELAY_MS = 900;

const ErMap = () => {
  const { t } = useTranslation();
  // The Test Map is the Elden Ring raw-data sandbox. Nightreign's overworld is
  // procedural (seed/pattern-based), so it has no single fixed raw map — its real,
  // full experience already lives on the live Maps view. Selecting Nightreign here
  // therefore switches the live map to NR and drops out of the Test Map onto it,
  // rather than rendering a second (raw) NR map.
  const [game] = useState<Game>("elden-ring");
  const isMobile = useIsMobile();
  const setLiveGame = useMapStore((s) => s.setGame);
  const closeOverlay = useUiStore((s) => s.closeOverlay);
  const { manifest, error: manifestError } = useErMapManifest(game);
  // Elden Ring ships tiled overworld/underground/DLC layers as its base views;
  // Nightreign is native-only, so its views come entirely from the manifest.
  const views = manifest?.views ?? (game === "elden-ring" ? FALLBACK_VIEWS : []);
  const [viewKey, setViewKey] = useState("overworld");
  const placing = useCustomMarkerUi((s) => s.placing);
  const armPlacing = useCustomMarkerUi((s) => s.arm);
  const disarmPlacing = useCustomMarkerUi((s) => s.disarm);
  const savedMarkerId = useCustomMarkerUi((s) => s.savedId);
  const clearSavedMarker = useCustomMarkerUi((s) => s.clearSaved);
  const [focusNonce, setFocusNonce] = useState(0);
  const storedActiveCategories = useMapStore((state) => state.erMapActiveCategories);
  const setActiveCategories = useMapStore((state) => state.setErMapCategories);
  const activeCategories = storedActiveCategories ?? NO_ACTIVE_CATEGORIES;
  // Search must rank across the view's WHOLE marker set — categories the user filtered
  // off included — while the map itself keeps loading only the active chunks. The full
  // pool loads on first search use and then sticks for the view (chunks are cached), so
  // a selected filtered-out marker keeps resolving after the query is cleared.
  const [searchUsed, setSearchUsed] = useState(false);
  const currentView = views.find((view) => view.key === viewKey) ?? views[0] ?? null;
  const viewData = useErMapViewMarkers(currentView, activeCategories, false);
  const fullData = useErMapViewMarkers(searchUsed ? currentView : null, ALL_CATEGORIES, true);
  const tiledLayerKey = tiledLayerFor(currentView);
  const tiledLayer = TEST_MAP_LAYERS[tiledLayerKey];
  const storedCustomMarkers = useMapStore((s) => s.customMarkers);
  const customViewMarkers = useMemo(
    () => storedCustomMarkers
      .filter((marker) => marker.game === game && marker.layer === tiledLayerKey)
      .map(erMapCustomMarker),
    [game, storedCustomMarkers, tiledLayerKey],
  );
  const activeViewMarkers = useMemo(
    () => [...viewData.markers, ...customViewMarkers],
    [customViewMarkers, viewData.markers],
  );
  const allViewMarkers = useMemo(
    () => [...fullData.markers, ...customViewMarkers],
    [customViewMarkers, fullData.markers],
  );
  const state = useErMapState(tiledLayerKey, {
    game,
    markers: manifest ? activeViewMarkers : undefined,
    allMarkers: allViewMarkers,
    additionalCategories: manifest?.categories,
    additionalGroups: manifest?.groups,
    viewCounts: manifest ? currentView?.typeCounts : undefined,
    bossRewardFilters: currentView?.bossRewardFilters,
    viewKey: currentView?.key,
    activeCategories,
    setActiveCategories,
  });
  // Same performance nudge as the live map shell: dismissible, and it re-arms
  // once the count drops back under the threshold and climbs again (render-phase
  // state adjustment, no effect needed).
  const markerCount = state.visibleMarkers.length;
  const overThreshold = markerCount > MARKER_WARN_THRESHOLD;
  const keyHintShowing = useKeyHints((s) => s.current !== null);
  const [warnDismissed, setWarnDismissed] = useState(false);
  const [wasOverThreshold, setWasOverThreshold] = useState(overThreshold);
  if (overThreshold !== wasOverThreshold) {
    setWasOverThreshold(overThreshold);
    if (!overThreshold) setWarnDismissed(false);
  }
  // Hold the nudge back for the first minute after the map opens, so a fresh
  // session isn't greeted by a performance warning before the player has even
  // had a chance to look around.
  const [warnDelayElapsed, setWarnDelayElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWarnDelayElapsed(true), 60_000);
    return () => clearTimeout(id);
  }, []);

  const { setQuery } = state;
  // Searches are reported once the player stops typing, not per keystroke —
  // otherwise "margit" arrives as six events, five of them prefixes of a term
  // nobody actually searched for.
  const searchReportRef = useRef<number | undefined>(undefined);
  const setSearchQuery = useCallback((next: string) => {
    if (next.trim()) setSearchUsed(true);
    setQuery(next);

    window.clearTimeout(searchReportRef.current);
    const query = next.trim().toLowerCase();
    if (!query) return;
    searchReportRef.current = window.setTimeout(() => {
      track(EVENTS.MAP_SEARCHED, {
        query: query.slice(0, 60),
        query_length: query.length,
        map: "elden-ring",
        map_view: viewKey,
      });
    }, SEARCH_REPORT_DELAY_MS);
  }, [setQuery, viewKey]);
  useEffect(() => () => window.clearTimeout(searchReportRef.current), []);

  useEffect(() => {
    if (!manifest || storedActiveCategories !== null) return;
    const landmarkKeys = new Set(
      groupsByGame["elden-ring"].find((group) => group.key === "landmarks")?.categories ?? [],
    );
    for (const category of manifest.categories) {
      if (category.group === "landmarks") landmarkKeys.add(category.key);
    }
    setActiveCategories(landmarkKeys);
  }, [manifest, setActiveCategories, storedActiveCategories]);
  // Resolve from the active-chunk load first, then the full search pool — a marker
  // picked from search keeps its detail panel even when its category is filtered off.
  const selectedMarker = state.selectedMarker;

  // Analytics: buffer what KIND of thing the player opened and how they got
  // there (one event per five — see map-events). The source is a ref set by
  // whichever entry point ran (a pin click leaves the default), never state — it
  // must not re-render or disturb the camera effects. Recording off the RESOLVED
  // marker rather than the click means a selection that only resolves once its
  // chunk lands still counts, and the id guard keeps a chunk reload (which hands
  // back a new object for the same marker) from counting it twice.
  const openSourceRef = useRef<MarkerOpenSource>("map");
  const trackedMarkerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedMarker) {
      trackedMarkerRef.current = null;
      return;
    }
    if (trackedMarkerRef.current === selectedMarker.id) return;
    trackedMarkerRef.current = selectedMarker.id;
    recordErMarkerOpened(selectedMarker, {
      view: viewKey,
      source: openSourceRef.current,
    });
    openSourceRef.current = "map";
  }, [selectedMarker, viewKey]);
  // Safety net for any selection the loaded pools turn out not to cover (its
  // category filtered off / not part of this view's load): pull the view's full
  // pool so the panel resolves AND the pin can be drawn (visibleMarkers only
  // force-keeps markers it finds in a pool — the seen-cache fallback that keeps
  // the panel alive cannot produce a pin). Deliberately decided HERE — after the
  // active load for the current view has settled — and not eagerly inside
  // navigateToMarker: pulling up front parsed and localized several MB of chunks
  // in one main-thread burst mid camera flight, which swallowed the animation
  // (wall-clock paced) and made panel→marker navigation look like a teleport.
  // Idempotent once searchUsed is already true, so an unresolvable stale id
  // can't loop it.
  const selectedIdInPools = useMemo(() => {
    if (!state.selectedId) return true;
    const id = state.selectedId;
    return state.layerMarkers.some((m) => m.id === id) || fullData.markers.some((m) => m.id === id);
  }, [state.selectedId, state.layerMarkers, fullData.markers]);
  useEffect(() => {
    if (selectedIdInPools) return;
    if (viewData.loading || viewData.loadedViewKey !== currentView?.key) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setSearchUsed(true);
    });
    return () => {
      active = false;
    };
  }, [selectedIdInPools, viewData.loading, viewData.loadedViewKey, currentView?.key]);
  const searchMarkers = fullData.markers.length > 0 ? allViewMarkers : state.layerMarkers;
  const outsideCount = useMemo(
    () => state.visibleMarkers.filter((marker) => rawPositionFor(marker, tiledLayer).outsideCanvas).length,
    [state.visibleMarkers, tiledLayer],
  );
  const bounds = boundsForView(tiledLayerKey);
  const { setRailOpen, setSelectedId } = state;
  const { layerMarkers } = state;
  useEffect(() => {
    if (!savedMarkerId) return;
    if (!customViewMarkers.some((marker) => marker.id === savedMarkerId)) return;
    openSourceRef.current = "custom-marker";
    setSelectedId(savedMarkerId);
    setRailOpen(false);
    clearSavedMarker();
  }, [clearSavedMarker, customViewMarkers, savedMarkerId, setRailOpen, setSelectedId]);
  // Does selecting this marker require the view's FULL pool? Only when the loaded
  // chunks can't cover it: the target itself (its category filtered off → chunk
  // never fetched) or a dungeon entrance it should reveal. The check matters
  // because the pull is a main-thread burst — it fetches, parses and localizes
  // every remaining chunk (the enemy chunks alone are >1MB) — and Leaflet's
  // flyTo/panTo pace themselves by wall clock, so a burst landing mid-flight
  // swallows the whole animation and the camera appears to teleport. Never pull
  // when the selection already resolves from what's loaded.
  //
  // Reads the pool through a ref so this callback (→ the settle callback handed
  // to ErMapSelection) keeps ONE identity for the life of the map: every chunk
  // arrival replaces layerMarkers, and flowing that identity into the selection
  // effect re-ran it mid-flight — restarting the camera glide it was pacing.
  const layerMarkersRef = useRef(layerMarkers);
  useEffect(() => {
    layerMarkersRef.current = layerMarkers;
  }, [layerMarkers]);
  const needsFullPool = useCallback((id: string) => {
    const pool = layerMarkersRef.current;
    const target = pool.find((marker) => marker.id === id);
    if (!target) return true;
    return (target.dungeonEntrances ?? []).some(
      (entrance) => !pool.some((marker) => marker.id === entrance.id),
    );
  }, []);

  const selectMarker = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    setRailOpen(false);
  }, [setRailOpen, setSelectedId]);
  const closeDetails = useCallback(() => setSelectedId(null), [setSelectedId]);
  // ESC also closes the filter rail — but only when it is the outermost thing open.
  // An open detail panel owns ESC first (er-map-detail-panel unwinds its own combat /
  // drill / back stack), so the rail waits for the next press. Overlays, dialogs and
  // the marker placer swallow ESC in the capture phase with stopImmediatePropagation,
  // so this never runs underneath them.
  useEffect(() => {
    if (!state.railOpen || selectedMarker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setRailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedMarker, setRailOpen, state.railOpen]);
  const centerSelected = useCallback(() => setFocusNonce((current) => current + 1), []);
  const loadSelectionExtrasAfterCameraSettles = useCallback((id: string) => {
    // A boss can reveal dungeon entrances whose category chunks are filtered out.
    // Loading every missing chunk parses and localizes several MB on the main
    // thread. Starting that work during Leaflet's wall-clock animation skips its
    // intermediate frames and looks like a teleport, so ancillary data waits until
    // the selected marker has landed. Unresolved selections still use the immediate
    // fallback above because there is no marker to animate until that data arrives.
    if (needsFullPool(id)) setSearchUsed(true);
  }, [needsFullPool]);
  // Declared BEFORE navigateToMarker: its definition line assigns
  // `navigateRef.current`, and a later `const` would still be in the TDZ there.
  const navigateRef = useRef<
    (view: string, id: string, push?: boolean, source?: MarkerOpenSource) => void
  >(() => {});

  const changeView = (next: string, clearSelection = true) => {
    if (next !== viewKey) {
      track(EVENTS.MAP_VIEW_CHANGED, { map: "elden-ring", from: viewKey, to: next });
    }
    setViewKey(next);
    if (clearSelection) {
      state.setSelectedId(null);
    }
    setSearchUsed(false); // don't eagerly pull the next view's full chunk set
  };

  // Connection click-through: the arrival marker was resolved at BUILD time
  // (reciprocal doorway, or the destination's own grace — legacy interiors are
  // projected onto the surfaces, so dungeon destinations are real markers too).
  // Navigation is therefore just: switch view if needed, select the arrival.
  const navigateToMarker = (
    targetView: string,
    markerId: string,
    push = false,
    source: MarkerOpenSource = "navigation",
  ) => {
    openSourceRef.current = source;
    const switchingView = targetView !== viewKey && views.some((view) => view.key === targetView);
    if (switchingView) {
      changeView(targetView, !push);
    }
    if (push) {
      state.pushSelect(markerId);
    } else {
      setSelectedId(markerId);
    }
  };
  useEffect(() => { navigateRef.current = navigateToMarker; });

  // An item hit in search resolves to whichever marker actually hands the item
  // over, and those sit on either layer — so it navigates instead of plain
  // selecting. A fresh jump, not a drill-down: no breadcrumb push.
  const selectMarkerInView = useCallback((view: string, id: string) => {
    navigateRef.current(view, id, false, "search");
    setRailOpen(false);
  }, [setRailOpen]);

  // Same selection as a pin click, but from the search results — worth telling
  // apart: it's the difference between browsing the map and looking something up.
  const selectMarkerFromSearch = useCallback((id: string) => {
    openSourceRef.current = "search";
    selectMarker(id);
  }, [selectMarker]);

  // Codex "show on map" jumps carry PRODUCTION marker ids (drops / where-to-find /
  // seller rows). The build-time production-id bridge translates them to this
  // map's (view, marker) pair — exact twin joins only; ids without a twin just
  // clear the intent. A ref keeps the effect off navigateToMarker's identity.
  const mapMarkerId = useUiStore((s) => s.mapMarkerId);
  const clearMapMarker = useUiStore((s) => s.clearMapMarker);
  const clearCodexIntent = useUiStore((s) => s.clearCodexIntent);
  useEffect(() => {
    if (!mapMarkerId) return;
    let active = true;
    loadProductionIdMap()
      .then((idMap) => {
        if (!active) return;
        const target = idMap[mapMarkerId];
        if (target) navigateRef.current(target.view, target.id, false, "codex");
      })
      .catch(() => {})
      .finally(() => {
        if (!active) return;
        clearCodexIntent();
        clearMapMarker();
      });
    return () => {
      active = false;
    };
  }, [mapMarkerId, clearCodexIntent, clearMapMarker]);

  const handleGoBack = () => {
    if (state.parentMarker) {
      const parentView = layerForArea(state.parentMarker.areaNo) || "overworld";
      if (parentView !== viewKey && views.some((view) => view.key === parentView)) {
        changeView(parentView, false);
      }
    }
    state.goBack();
  };

  const changeGame = (next: Game) => {
    if (next !== game) {
      track(EVENTS.GAME_SWITCHED, { from: game, to: next, source: "er-map" });
    }
    if (next === "nightreign") {
      // Hand off to the real, full Nightreign map (Maps view): pattern finder,
      // search and filters all as-is. This is the "same as the Maps tab" NR.
      setLiveGame("nightreign");
      closeOverlay();
    }
  };

  // ONE instance, mounted in one of two places (see `belowSwitcher` below) —
  // rendering it twice would double the rail's internal state.
  const filterRail = (
    <FilterRailView
      categories={state.categories}
      groups={state.groups}
      categoryById={state.categoryById}
      categoryCounts={state.categoryCounts}
      doneCounts={state.doneCounts}
      categoryArt={state.categoryArt}
      activeCategories={state.activeCategories}
      shown={state.visibleMarkers.length}
      hideCompleted={state.hideCompleted}
      setHideCompleted={state.setHideCompleted}
      hideFavorites={state.hideFavorites}
      // "Hide favorites" and the toolbar's "favorites only" are each other's
      // opposite — leaving both on would just empty the map and read as a bug.
      // Turning this one on releases the other.
      setHideFavorites={(on) => {
        state.setHideFavorites(on);
        if (on) state.setFavoritesOnly(false);
      }}
      open={state.railOpen}
      setOpen={state.setRailOpen}
      toggleCategory={state.toggleCategory}
      setGroup={state.setGroup}
      showOnly={state.showOnly}
    />
  );

  if (!currentView) {
    return (
      <div data-game={game} className="relative grid h-full w-full place-items-center overflow-hidden bg-[#0a0b12]">
        <span className="rounded-[var(--radius-full)] border border-border bg-surface/90 px-3 py-1.5 text-[12px] text-white/80 backdrop-blur-xl">
          {manifestError ? t("erMap.dataUnavailable") : t("erMap.loadingRecords")}
        </span>
      </div>
    );
  }

  return (
    <div data-game={game} className="relative h-full w-full overflow-hidden bg-[#0a0b12]">
      {/* NO key: the map must survive view switches. A per-view key remounted the
          whole container, which turned every cross-view marker navigation into a
          hard teleport even with performance mode off. Every child below already
          rebuilds itself in place when `layer`/`markers` change; ErMapViewCamera
          replaces the framing the remount used to provide. */}
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        minZoom={-5}
        maxZoom={2}
        zoomSnap={0.25}
        zoomControl={false}
        attributionControl={false}
        // Leaflet's own resize handler runs an unguarded invalidateSize, which
        // can pan against a 0-sized (minimizing) container and shear the view.
        // ErMapBlackMapGuards covers real resizes, gated on the LIVE size.
        trackResize={false}
        className="h-full w-full bg-[#0a0b12]"
      >
        <ErMapBlackMapGuards bounds={bounds} selectedId={state.selectedId} />
        <ErMapTiles layer={tiledLayer} />
        <MarkerPlacer
          imageWidth={tiledLayer.imageWidth}
          imageHeight={tiledLayer.imageHeight}
          game={game}
          layer={tiledLayerKey}
        />
        <SingleTooltipController />
        {/* The same engraved region names the live map draws — identical data,
            tones and zoom floor. Both maps render the same tile pyramids in the
            same CRS.Simple image-pixel space, so the layer is a drop-in. */}
        <RegionLabelsLayer
          game={game}
          layer={tiledLayerKey}
          imageWidth={tiledLayer.imageWidth}
          imageHeight={tiledLayer.imageHeight}
        />
        <ErMapGrid layer={tiledLayer} />
        <ErMapMarkerLayer
          layer={tiledLayer}
          activeCategories={activeCategories}
          bossRewardFilters={currentView?.bossRewardFilters}
          markers={state.visibleMarkers}
          categoryById={state.categoryById}
          categoryArt={state.categoryArt}
          selectedId={state.selectedId}
          onSelect={selectMarker}
          favorites={state.favorites}
          foundMarkers={state.foundMarkers}
        />
        <ErMapViewCamera
          viewKey={currentView.key}
          bounds={bounds}
          selectedId={state.selectedId}
        />
        <ErMapSelection
          layer={tiledLayer}
          marker={selectedMarker}
          focusNonce={focusNonce}
          onCameraSettled={loadSelectionExtrasAfterCameraSettles}
        />
        <SavePositionLayer
          onViewChange={setViewKey}
          layer={tiledLayerKey}
          imageWidth={tiledLayer.imageWidth}
          imageHeight={tiledLayer.imageHeight}
        />
        <MapCameraControls bounds={bounds} />
      </MapContainer>

      {/* z-1350: above the bottom-centre performance warning (z-1200) AND above
          the edit-entry button (z-1300, right-centre). The search results panel
          lives in here and, now that it's right-aligned and tall, hangs down over
          that button — this lifts the whole overlay column past it so the results
          paint on top instead of being cut through. Everything else in the column
          sits at the top or on the left, clear of the button, so nothing else
          changes. Stays below the placing hint (z-1400). */}
      <div className="pointer-events-none absolute inset-x-3 top-3 bottom-[calc(0.75rem+var(--anchor-ad-height))] z-[1350] flex flex-col items-start gap-3 max-sm:left-[max(0.75rem,env(safe-area-inset-left))] max-sm:right-[max(0.75rem,env(safe-area-inset-right))]">
        <ErMapToolbar
          game={game}
          onGameChange={changeGame}
          // Phone: the filter trigger rides under the world switcher instead of
          // in the row below, so it can't drift down the screen behind a wrapped
          // toolbar. Desktop keeps it docked beside the detail panel.
          belowSwitcher={<><SaveTrackingControls />{isMobile ? filterRail : null}</>}
          currentView={currentView}
          markers={searchMarkers}
          categoryById={state.categoryById}
          query={state.query}
          favoriteCount={state.favorites.size}
          favoritesOnly={state.favoritesOnly}
          placing={placing}
          onViewChange={changeView}
          setQuery={setSearchQuery}
          onSelect={selectMarkerFromSearch}
          onNavigate={selectMarkerInView}
          onToggleFavorites={() => state.setFavoritesOnly(!state.favoritesOnly)}
          onTogglePlacing={placing ? disarmPlacing : armPlacing}
        />

        <div data-left-overlay className="flex min-h-0 flex-1 items-start gap-3">
          <div className="flex h-full min-h-0 flex-col items-start gap-3">
            {!isMobile && filterRail}
            <div className="mt-auto shrink-0"><PositionTrackingNotice /></div>
          </div>
          <ErMapDetailPanel
            marker={selectedMarker}
            categoryById={state.categoryById}
            viewLabel={currentView.kind === "tiled"
              ? t(`layer.${currentView.key}`, { defaultValue: currentView.label })
              : currentView.label}
            favorite={selectedMarker ? state.favorites.has(selectedMarker.id) : false}
            found={selectedMarker ? state.foundMarkers.has(selectedMarker.id) : false}
            onClose={closeDetails}
            onToggleFavorite={() => selectedMarker && state.toggleFavorite(selectedMarker.id)}
            onToggleFound={() => selectedMarker && state.toggleFound(selectedMarker.id)}
            onCenter={centerSelected}
            onNavigateToMarker={navigateToMarker}
            parentMarker={state.parentMarker}
            onBack={handleGoBack}
          />
        </div>
      </div>

      <ErMapEditControls
        selectedMarkerId={state.selectedId}
        onSelectMarker={selectMarker}
        game={game}
        markerNames={state.markerNames}
      />

      {placing && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-[1400] flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-full)] border border-accent/40 bg-surface/95 px-4 py-2 text-[13px] font-medium text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
          {t("erMap.testMarkerHint")}
        </div>
      )}

      {/* Performance nudge — mirrors the live map shell's bottom-centre pill. */}
      {overThreshold && warnDelayElapsed && !warnDismissed && (
        <div className={cn(
          "pointer-events-none absolute inset-x-0 z-[1200] flex justify-center px-4 transition-all duration-300",
          // Steps up while a key hint occupies the bottom-centre slot (same rule
          // as the live map shell's nudge).
          keyHintShowing ? "bottom-[calc(5.25rem+var(--anchor-ad-height))]" : "bottom-[calc(1rem+var(--anchor-ad-height))]",
        )}>
          <div className="pointer-events-auto flex max-w-[calc(100%-1rem)] items-center gap-2.5 rounded-[var(--radius-lg)] border border-amber-400/40 bg-surface/95 px-3.5 py-2 shadow-2xl backdrop-blur-xl">
            <TriangleAlert size={16} className="shrink-0 text-amber-400" aria-hidden="true" />
            <p className="min-w-0 truncate text-xs text-zinc-200">
              {t("chrome.markerWarning", { count: markerCount })}
            </p>
            <button
              onClick={() => setWarnDismissed(true)}
              aria-label={t("tracking.close")}
              className="-mr-1 shrink-0 rounded-[var(--radius-md)] p-1 text-muted transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-[calc(1rem+var(--anchor-ad-height))] left-4 z-[1200] flex flex-wrap gap-2 text-[11px] text-white/80">
        {viewData.loading && (
          <span className="rounded-[var(--radius-full)] border border-border bg-surface/90 px-2.5 py-1 backdrop-blur-xl">
            {t("erMap.loadingRecords")}
          </span>
        )}
        {outsideCount > 0 && (
          <span className="rounded-[var(--radius-full)] border border-amber-400/35 bg-surface/90 px-2.5 py-1 text-amber-200 backdrop-blur-xl">
            {t("erMap.outsideCount", { count: outsideCount })}
          </span>
        )}
        {(manifestError || viewData.error) && (
          <span className="rounded-[var(--radius-full)] border border-rose-400/40 bg-surface/95 px-2.5 py-1 text-rose-200 backdrop-blur-xl">
            {t("erMap.dataUnavailable")}
          </span>
        )}
      </div>

    </div>
  );
};

export default ErMap;
