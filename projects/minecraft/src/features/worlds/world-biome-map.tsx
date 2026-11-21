import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { Copy, Eye, EyeOff, LocateFixed, MapPinPlus, Minus, Navigation, Plus, RotateCcw, Route } from "lucide-react";
import { GAME_BIOME_CANOPY_STYLES, GAME_BIOME_RASTER_COLORS, GAME_BIOME_PREVIEWS, GAME_MAP_DIMENSIONS, GAME_OBSERVED_PORTAL_APPEARANCE,
  GAME_PORTAL_PROJECTIONS, GAME_ROUTE_PROFILE, GAME_STRUCTURE_DISCOVERIES, GAME_STRUCTURE_FILTER_MIGRATIONS, formatGameTeleportCommand,
  GAME_STRUCTURE_FILTER_REVISION, GAME_STRUCTURE_GROUPS, GAME_STRUCTURE_TYPES, WORLD_LIBRARY_CONFIG } from "../../game-config";
import MapCubePicker from "../map/map-cube-picker";
import { createBrowserBiomePool } from "../generation/create-browser-biome-pool";
import { createBiomeTileSource } from "../generation/biome-tile-source";
import { createUniformBiomeTileSource } from "../generation/create-uniform-biome-source";
import { createBiomeCanvas, type BiomeCanvasState } from "../generation/biome-canvas";
import { resolveDimensionBiomePreview, type BiomePreviewConfig } from "../generation/resolve-biome-preview";
import { defaultDimensionView, type WorldMapSurface, type WorldRecord } from "./world-types";
import { readWorldCamera2d, writeWorldCamera2d } from "./world-view-state";
import { worldRepository } from "./use-world-library";
import { cn } from "../../lib/cn";
import WorldPlayerMarker from "./world-player-marker";
import WorldLastPositionMarker from "./world-last-position-marker";
import { readLastWorldPosition, readResumeDimension } from "./world-resume-state";
import type { WorldMapPlayer } from "./world-map-player";
import { useCurrentMapPlayer } from "./use-current-map-player";
import { BIOME_DEFAULT_ZOOM, type BiomeCamera } from "../generation/biome-viewport";
import { createStructureSource } from "../generation/structure-source";
import { createBrowserStructurePool } from "../generation/create-browser-structure-pool";
import { createStructureViewportStream, type StructurePoint, type StructureViewportState } from "../generation/structure-viewport-stream";
import WorldStructureLayer, { type SaveWorldPersonal } from "./world-structure-layer";
import { applyStructureFilter, readStructureFilter, type StructureFilterState } from "./world-structure-filter-state";
import { WorldDestinationMarkers } from "./world-map-destinations";
import { EMPTY_KNOWLEDGE_CATALOGS, type KnowledgeCatalogs } from "../knowledge/knowledge-catalogs";
import type { MapWindowCommand } from "../map/map-window-command";
import { DEFAULT_USER_MARKER_COLOR, DEFAULT_USER_MARKER_ICON } from "../map/map-config";
import { DEFAULT_MARKER_GROUP } from "../map/marker-group-config";
import { putWorldPin, removeObservedPortal, removeWorldPin } from "./world-personal-actions";
import WorldPinDialog, { type WorldPinDraft } from "./world-pin-dialog";
import { isDeathPin } from "./world-death-pin";
import WorldPinLayer from "./world-pin-layer";
import { useSmoothedWorldMapPlayer, type SmoothedWorldMapPlayer } from "./use-smoothed-world-map-player";
import { WorldJourneyLayer } from "../journey/world-journey-layer";
import { useWorldJourney } from "../journey/use-world-journey";
import { mergeObservedPortals, observedJourneyPortals } from "../journey/journey-observed-portals";
import JourneyPortalMarkers from "../journey/journey-portal-markers";
import WorldObservedPortalDetails from "./world-observed-portal-details";
import type { JourneyDimensionTransition } from "../journey/journey-dimension-transitions";
import Tooltip from "../../components/tooltip";
import type { BiomeTileSource } from "../generation/biome-tile-source.ts";
import type { TerrainScope } from "../terrain/terrain-scope.ts";
import WorldRouteLayer from "./world-route-layer.tsx";
import WorldRoutePanel from "./world-route-panel.tsx";
import { calculateWorldRoute } from "./world-route-pathfinder.ts";
import { findNearestWorldStructure, StructureNotFoundError, StructureUnavailableError } from "./world-nearest-structure.ts";
import type { CalculatedWorldRoute, WorldRouteEndpointSelection, WorldRouteError, WorldRoutePoint } from "./world-route-types.ts";
import WorldMapLocationStatus from "./world-map-location-status";
import { worldMarkerCameraTarget } from "./world-marker-camera";
import { closeOverlayMarkerDetails, openOverlayMarkerDetails,
  subscribeOverlayMarkerDetails } from "../overlay/overlay-marker-details";
import { gameKnowledgeSubjectDisplay } from "../knowledge/game-knowledge-subject-display";
import { availableDiscoveryIds } from "./world-structure-discovery-sections";
import { searchStructureTypes } from "./world-structure-search";
import WorldStructureSearchControl from "./world-structure-search-control";
import { resolveWorldStructureSearchTarget, type WorldStructureSearchRequest } from "./world-structure-search-request";
import { findStructureSearchTarget } from "./world-structure-search-target";
import { createWorldMapFrames, shouldPublishWorldMapState } from "./world-map-frames";
import { WorldMapFrameContext } from "./world-map-frame-context";
import WorldMapZoomLevel from "./world-map-zoom-level";

const controlsClass = "rounded-[var(--radius-md)] border border-border bg-[var(--panel-bg)] shadow-[var(--panel-shadow)]";
type Dimension = typeof GAME_MAP_DIMENSIONS[number];
type SaveCamera = (worldId: string, dimension: string, surface: WorldMapSurface, camera: BiomeCamera) => Promise<unknown>;
type SaveFilter = (worldId: string, dimension: string, filter: StructureFilterState) => Promise<unknown>;
const biomeStructureBounds = (view: Pick<BiomeCanvasState, "x" | "z" | "width" | "height" | "zoom">) => ({
  minX: Math.max(-30000000, Math.floor(view.x - view.width / view.zoom / 2)),
  maxX: Math.min(30000000, Math.ceil(view.x + view.width / view.zoom / 2)),
  minZ: Math.max(-30000000, Math.floor(view.z - view.height / view.zoom / 2)),
  maxZ: Math.min(30000000, Math.ceil(view.z + view.height / view.zoom / 2)),
});
const persistCamera: SaveCamera = (worldId, dimension, surface, camera2d) => worldRepository.updatePersonal(worldId, personal => ({
  ...personal, views: { ...personal.views, [dimension]: writeWorldCamera2d(personal.views[dimension], surface, camera2d) },
  resume: { ...personal.resume, dimensionBySurface: { ...personal.resume?.dimensionBySurface, [surface]: dimension } },
}));
const persistFilter: SaveFilter = (worldId, dimension, filter) => worldRepository.updatePersonal(worldId, personal => ({
  ...personal, views: { ...personal.views, [dimension]: applyStructureFilter(personal.views[dimension] ?? defaultDimensionView(), filter) },
}));
const persistPersonal: SaveWorldPersonal = async (worldId, change) => (await worldRepository.updatePersonal(worldId, change)).personal;
const EMPTY_STRUCTURE_STATE: Readonly<StructureViewportState> = Object.freeze({
  phase: "ready", completed: 0, total: 0, points: Object.freeze([]), unsupported: Object.freeze([]), error: null,
});
const deferredStructureTypes = GAME_STRUCTURE_TYPES.filter(type => "loadPriority" in type && type.loadPriority === "deferred").map(type => type.id);

const BiomeSurface = ({ world, config, dimension, active, player, motion, now, following, minimapMode, unboundPositionVisible, viewScope, onManualCamera,
  onFollow, onFollowPortal, portalFocus, filterOpen, onFilterOpenChange, zoomCommand, takeInitialZoom,
  saveCamera, saveFilter, savePersonal, knowledgeCatalogs, personalEditingEnabled, structureSearchRequest }: {
  world: WorldRecord; config: BiomePreviewConfig; dimension: Dimension; active: boolean; player: WorldMapPlayer | null;
  motion: SmoothedWorldMapPlayer;
  takeInitialZoom: () => number | null;
  now: number;
  following: boolean; minimapMode: boolean; unboundPositionVisible: boolean; viewScope: WorldMapSurface; onManualCamera: () => void; onFollow: () => void;
  onFollowPortal: (target: JourneyDimensionTransition["to"]) => void;
  portalFocus: { dimension: string; x: number; z: number } | null;
  filterOpen: boolean; onFilterOpenChange: (open: boolean) => void;
  zoomCommand?: MapWindowCommand | null;
  saveCamera: SaveCamera; saveFilter: SaveFilter; savePersonal: SaveWorldPersonal; knowledgeCatalogs: KnowledgeCatalogs;
  personalEditingEnabled: boolean;
  structureSearchRequest?: { revision: number; typeId: string } | null;
}) => {
  const { t } = useTranslation(), canvas = useRef<HTMLCanvasElement>(null);
  const backgroundPointer = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const renderer = useRef<ReturnType<typeof createBiomeCanvas> | null>(null);
  const handledZoomCommand = useRef(0);
  const structures = useRef<ReturnType<typeof createStructureViewportStream> | null>(null);
  const routeBiomeSource = useRef<BiomeTileSource | null>(null);
  const routeBiomeScope = useRef<TerrainScope | null>(null);
  const routeStructureSource = useRef<ReturnType<typeof createStructureSource> | null>(null);
  const routeStructureScope = useRef<TerrainScope | null>(null);
  const [structureState, setStructureState] = useState<Readonly<StructureViewportState> | null>(null);
  const latestStructureState = useRef<Readonly<StructureViewportState> | null>(null);
  const lastPosition = !player ? readLastWorldPosition(world, now) : null;
  const resumeCamera = lastPosition?.dimension === dimension.id ? { x: lastPosition.x, z: lastPosition.z, zoom: 0.5 } : undefined;
  const initial = useRef(portalFocus?.dimension === dimension.id
    ? { x: portalFocus.x, z: portalFocus.z, zoom: Math.max(1, readWorldCamera2d(world.personal.views[dimension.id], viewScope)?.zoom ?? 1) }
    : minimapMode ? resumeCamera ?? { x: 0, z: 0, zoom: 0.5 }
      : readWorldCamera2d(world.personal.views[dimension.id], viewScope) ?? resumeCamera);
  const [state, setState] = useState<BiomeCanvasState | null>(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const [mapFrames] = useState(createWorldMapFrames);
  const publishedState = useRef<BiomeCanvasState | null>(null);
  const stateRef = useRef<BiomeCanvasState | null>(null);
  const cameraSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFrame = useRef(0);
  const cancelFocusRequest = useCallback(() => {
    if (focusFrame.current) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = 0;
  }, []);
  const manualCamera = useCallback(() => { cancelFocusRequest(); onManualCamera(); }, [cancelFocusRequest, onManualCamera]);
  const [hasCursor, setHasCursor] = useState(false);
  const [coordinateMenu, setCoordinateMenu] = useState<{ left: number; top: number; x: number; z: number } | null>(null);
  const coordinateMenuRef = useRef<HTMLDivElement>(null);
  const [coordinateCopyFailed, setCoordinateCopyFailed] = useState(false);
  useEffect(() => {
    if (!coordinateMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (!coordinateMenuRef.current?.contains(event.target as Node)) setCoordinateMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setCoordinateMenu(null); }
    };
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", dismiss, true); window.removeEventListener("keydown", escape); };
  }, [coordinateMenu]);
  const [saveError, setSaveError] = useState(false);
  const [journeyCommandError, setJourneyCommandError] = useState(false);
  const altitude = 64;
  const [filterSaveError, setFilterSaveError] = useState(false);
  const [pinDraft, setPinDraft] = useState<WorldPinDraft | null>(null);
  const [selectedPortalId, setSelectedPortalId] = useState<string | null>(null);
  const [selectedDeathPin, setSelectedDeathPin] = useState<WorldRecord["personal"]["pins"][number] | null>(null);
  const [dismissDetailsRevision, setDismissDetailsRevision] = useState(0);
  const journey = useWorldJourney(world.id);
  const portalRules = useMemo(() => GAME_PORTAL_PROJECTIONS.filter(rule => rule.edition === world.edition
    && rule.versions.some(version => version === world.generation.version)), [world.edition, world.generation.version]);
  const journeyPortalLinks = useMemo(() => observedJourneyPortals([
    ...(journey.data.active ? [journey.data.active] : []), ...journey.data.journeys,
  ], portalRules, GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs,
  GAME_OBSERVED_PORTAL_APPEARANCE.maxTargetOffset, GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance),
  [journey.data.active, journey.data.journeys, portalRules]);
  const portalLinks = useMemo(() => mergeObservedPortals([], world.personal.portals ?? journeyPortalLinks,
    GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance, world.personal.removedPortals ?? []),
  [world.personal.portals, world.personal.removedPortals, journeyPortalLinks]);
  const portalCleanup = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !world.personal.portals || world.personal.portals.length === portalLinks.length) return;
    const key = `${world.id}:${world.personal.portals.map(portal => portal.id).join(",")}`;
    if (portalCleanup.current === key) return;
    portalCleanup.current = key;
    void savePersonal(world.id, personal => ({ ...personal,
      portals: mergeObservedPortals([], personal.portals ?? [],
        GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance, personal.removedPortals ?? []),
    })).catch(error => { portalCleanup.current = null; console.error("Observed portal cleanup failed", error); });
  }, [active, portalLinks, savePersonal, world.id, world.personal.portals]);
  const portalMigration = useRef<string | null>(null);
  useEffect(() => {
    if (!active || world.personal.portals !== undefined || !portalLinks.length) return;
    const key = `${world.id}:${portalLinks.map(portal => portal.id).join(",")}`;
    if (portalMigration.current === key) return;
    portalMigration.current = key;
    void savePersonal(world.id, personal => ({ ...personal,
      portals: mergeObservedPortals(personal.portals ?? [], journeyPortalLinks,
        GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance, personal.removedPortals ?? []),
    })).catch(error => { portalMigration.current = null; console.error("Observed portal migration failed", error); });
  }, [active, journeyPortalLinks, portalLinks, savePersonal, world.id, world.personal.portals]);
  const selectedPortal = filterOpen ? null : portalLinks.find(link => link.id === selectedPortalId) ?? null;
  const [pendingPin, setPendingPin] = useState(false);
  if (filterOpen && (pendingPin || pinDraft)) {
    setPendingPin(false);
    setPinDraft(null);
  }
  const [compactStructure, setCompactStructure] = useState<StructurePoint | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const isPlayerAvailable = !!player && player.dimension === dimension.id;
  const [routeStart, setRouteStart] = useState<WorldRouteEndpointSelection>(() =>
    isPlayerAvailable ? { kind: "player" } : { kind: "map", point: null }
  );
  const [routeDestination, setRouteDestination] = useState<WorldRouteEndpointSelection>({
    kind: "nearest", structureType: GAME_STRUCTURE_TYPES[0]!.id,
  });
  const [routePick, setRoutePick] = useState<"start" | "destination" | null>(null);
  const routePickRef = useRef(routePick);
  const routeStartRef = useRef(routeStart);
  const routeDestinationRef = useRef(routeDestination);
  const [resolvedNearest, setResolvedNearest] = useState<WorldRoutePoint | null>(null);
  const [calculatedRoute, setCalculatedRoute] = useState<CalculatedWorldRoute | null>(null);
  const [routePhase, setRoutePhase] = useState<"idle" | "resolving" | "calculating" | "ready" | "error">("idle");
  const [routeError, setRouteError] = useState<WorldRouteError | null>(null);
  const routeAbort = useRef<AbortController | null>(null);
  const searchTargetAbort = useRef<AbortController | null>(null);
  useEffect(() => () => searchTargetAbort.current?.abort(), []);
  useEffect(() => { routePickRef.current = routePick; }, [routePick]);
  useEffect(() => { routeStartRef.current = routeStart; }, [routeStart]);
  useEffect(() => { routeDestinationRef.current = routeDestination; }, [routeDestination]);
  useEffect(() => {
    if (!routePick) return;
    const cancelPick = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setRoutePick(null);
    };
    window.addEventListener("keydown", cancelPick);
    return () => window.removeEventListener("keydown", cancelPick);
  }, [routePick]);
  const pendingPinRef = useRef(pendingPin);
  useEffect(() => { pendingPinRef.current = pendingPin; }, [pendingPin]);
  useEffect(() => {
    if (!pendingPin) return;
    const cancelPin = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPendingPin(false);
    };
    window.addEventListener("keydown", cancelPin);
    return () => window.removeEventListener("keydown", cancelPin);
  }, [pendingPin]);
  const onFilterOpenChangeRef = useRef(onFilterOpenChange);
  useEffect(() => { onFilterOpenChangeRef.current = onFilterOpenChange; }, [onFilterOpenChange]);
  const [filter, setFilter] = useState(() => readStructureFilter(world.personal.views[dimension.id],
    GAME_STRUCTURE_TYPES.map(type => type.id), GAME_STRUCTURE_GROUPS.map(group => group.id),
    GAME_STRUCTURE_FILTER_REVISION, GAME_STRUCTURE_FILTER_MIGRATIONS));
  const [searchQuery, setSearchQuery] = useState("");
  const handledSearchRevision = useRef(0);
  useEffect(() => {
    if (!active || !structureSearchRequest || handledSearchRevision.current === structureSearchRequest.revision) return;
    handledSearchRevision.current = structureSearchRequest.revision;
    searchTargetAbort.current?.abort();
    searchTargetAbort.current = null;
    setSearchQuery(t(`structureMap.types.${structureSearchRequest.typeId}`));
  }, [active, structureSearchRequest, t]);
  const searchEntries = useMemo(() => GAME_STRUCTURE_TYPES.map(type => ({
    id: type.id,
    name: t(`structureMap.types.${type.id}`),
    items: availableDiscoveryIds(GAME_STRUCTURE_DISCOVERIES[type.id].loot, world.edition, world.generation.version)
      .flatMap(id => [id, gameKnowledgeSubjectDisplay("item", id).name]),
  })), [t, world.edition, world.generation.version]);
  const searchTypeIds = useMemo(() => searchStructureTypes(searchEntries, searchQuery), [searchEntries, searchQuery]);
  const searching = searchQuery.trim().length > 0;
  const searchCategories = searching ? searchTypeIds : filter.visibleCategories;
  const searchCategoriesRef = useRef(searchCategories);
  const boundsRef = useRef<{ minX: number; maxX: number; minZ: number; maxZ: number } | null>(null);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null), pendingFilterSave = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const altitudeRef = useRef(altitude);
  const pendingCameraSave = useRef<(() => void) | null>(null);
  const { id: worldId, edition } = world, { seed, version } = world.generation;
  const { code, id: dimensionId } = dimension;
  const dimensionPreview = resolveDimensionBiomePreview(world, config, code, GAME_BIOME_PREVIEWS);
  if (!dimensionPreview) throw new Error("The selected world has no dimension biome source.");
  const { config: sourceConfig, profile: generationProfile, uniformBiomeId } = dimensionPreview;
  const visibleStructureState = sourceConfig.kind === "uniform" ? EMPTY_STRUCTURE_STATE : structureState;
  const generationActive = active;
  const structureActive = active;
  const activeRef = useRef(generationActive);
  const structureActiveRef = useRef(structureActive);
  const liveRef = useRef({ player: motion.getSnapshot(), following, onManualCamera: manualCamera });
  useEffect(() => cancelFocusRequest, [cancelFocusRequest]);
  useEffect(() => () => { if (cameraSettleTimer.current) clearTimeout(cameraSettleTimer.current); }, []);
  useEffect(() => {
    activeRef.current = generationActive; structureActiveRef.current = structureActive;
    renderer.current?.setActive(generationActive); structures.current?.setActive(structureActive);
  }, [generationActive, structureActive]);
  useEffect(() => {
    if (state && !state.panning && !state.zooming) {
      const bounds = biomeStructureBounds(state); boundsRef.current = bounds;
      structures.current?.setViewport(bounds, searchCategoriesRef.current);
    }
  }, [state]);
  useLayoutEffect(() => {
    const follow = () => {
      const visual = motion.getSnapshot();
      liveRef.current = { player: visual, following, onManualCamera: manualCamera };
      if (generationActive && following && visual?.dimension === dimensionId && visual.expiresAt >= Date.now())
        renderer.current?.center(visual.x, visual.z);
    };
    const unsubscribe = motion.subscribe(follow);
    follow();
    return unsubscribe;
  }, [motion, following, manualCamera, generationActive, dimensionId]);
  useEffect(() => {
    const abort = new AbortController();
    const source = sourceConfig.kind === "uniform" ? createUniformBiomeTileSource(uniformBiomeId!)
      : createBiomeTileSource(createBrowserBiomePool());
    const structureSource = sourceConfig.kind === "uniform" ? null : createStructureSource(createBrowserStructurePool());
    let view: ReturnType<typeof createBiomeCanvas> | null = null;
    void (async () => {
      try {
        let bytes: Uint8Array, artifactConfig: { sha256: string; profiles: readonly string[] };
        if (sourceConfig.kind === "seeded") {
          const response = await fetch(`${import.meta.env.BASE_URL}${sourceConfig.url}`, { signal: abort.signal });
          if (!response.ok) throw new Error(`Biome artifact load failed: ${response.status}`);
          bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length !== sourceConfig.bytes) throw new Error("Biome artifact size mismatch");
          artifactConfig = { sha256: sourceConfig.sha256, profiles: sourceConfig.profiles };
        } else {
          bytes = new Uint8Array([uniformBiomeId!]);
          artifactConfig = { sha256: "0".repeat(64), profiles: [generationProfile] };
        }
        if (abort.signal.aborted || !canvas.current) return;
        const scope = source.select({ worldId, edition, version: generationProfile, seed, dimension: code,
           artifact: { bytes, config: artifactConfig } })!;
        const structureScope = structureSource?.select({ worldId, edition, version: generationProfile, seed, dimension: code,
          artifact: { bytes, config: { ...artifactConfig, structures: GAME_STRUCTURE_TYPES.map(type => type.id) } } }) ?? null;
        routeBiomeSource.current = source; routeBiomeScope.current = scope;
        routeStructureSource.current = structureSource; routeStructureScope.current = structureScope;
        // The 1,024-query library default is intentionally conservative. The full map allows a wider,
        // still-bounded viewport; sequential batches keep one structure worker from monopolizing the host.
        const stream = structureSource && structureScope ? createStructureViewportStream(structureSource, structureScope, next => {
          latestStructureState.current = next;
          if (!stateRef.current?.panning && !stateRef.current?.zooming) setStructureState(next);
        },
          minimapMode
            ? { batchSize: 32, maxQueries: 384, cacheLimit: 1024, deferredTypes: deferredStructureTypes }
            : { batchSize: 64, maxQueries: 4096, cacheLimit: 8192, deferredTypes: deferredStructureTypes }) : null;
        structures.current = stream; stream?.setActive(structureActiveRef.current);
        const live = liveRef.current;
        let camera = live.following && live.player?.dimension === dimensionId && live.player.expiresAt >= Date.now()
          ? { x: live.player.x, z: live.player.z, zoom: initial.current?.zoom ?? 0.25 } : initial.current;
        const initialZoom = takeInitialZoom();
        if (initialZoom !== null) {
          camera = { x: camera?.x ?? 0, z: camera?.z ?? 0, zoom: initialZoom };
          initial.current = camera;
        }
        view = createBiomeCanvas(canvas.current, source, scope, GAME_BIOME_RASTER_COLORS, (next, painting) => {
          stateRef.current = next;
          if (painting) {
            const previous = publishedState.current;
            const publishWorkspace = shouldPublishWorldMapState(previous, next);
            if (publishWorkspace) publishedState.current = next;
            if (cameraSettleTimer.current) clearTimeout(cameraSettleTimer.current);
            cameraSettleTimer.current = null;
            if (!publishWorkspace && previous && (previous.x !== next.x || previous.z !== next.z)) {
              cameraSettleTimer.current = setTimeout(() => {
                cameraSettleTimer.current = null;
                const settled = stateRef.current;
                if (!settled || settled.panning || settled.zooming || publishedState.current === settled) return;
                publishedState.current = settled;
                startTransition(() => setState(settled));
              }, 250);
            }
            if (publishWorkspace && previous?.zoom !== next.zoom && !next.zooming) {
              // The zoomed raster and marker stage are already in place. Let
              // expensive marker clustering finish at lower React priority.
              mapFrames.publishView(next);
              startTransition(() => {
                setState(next);
                setStructureState(latestStructureState.current);
              });
              return;
            }
            // Keep moving overlays and raster painting on the same frame.
            // Intermediate camera frames bypass the workspace and its panels.
            flushSync(() => {
              if (publishWorkspace) setState(next);
              if (!next.panning && !next.zooming) setStructureState(latestStructureState.current);
              mapFrames.publishView(next);
            });
            return;
          }
          if (next.panning || next.zooming) return;
          // Camera publication is synchronized with raster painting; non-frame
          // notifications still drive source scheduling without moving markers.
          const bounds = biomeStructureBounds(next);
          boundsRef.current = bounds; stream?.setViewport(bounds, searchCategoriesRef.current);
        }, camera, () => liveRef.current.onManualCamera(), selection => {
          const routeTarget = routePickRef.current;
          if (routeTarget) {
            const point = { x: selection.x, z: selection.z };
            setResolvedNearest(null);
            setCalculatedRoute(null);
            setRouteError(null);
            setRoutePhase("idle");
            if (routeTarget === "start") {
              setRouteStart({ kind: "map", point });
              const currentDest = routeDestinationRef.current;
              if (currentDest.kind === "map" && !currentDest.point) {
                routePickRef.current = "destination";
                setRoutePick("destination");
              } else {
                routePickRef.current = null;
                setRoutePick(null);
              }
            } else {
              setRouteDestination({ kind: "map", point });
              routePickRef.current = null;
              setRoutePick(null);
            }
            return;
          }
          if (!pendingPinRef.current) { setPinDraft(null); return; }
          const values = new Uint32Array(2); crypto.getRandomValues(values);
          const pin = {
            id: `custom-${Date.now()}-${values.join("-")}`, dimension: dimensionId, name: "",
            x: selection.x, y: selection.y, z: selection.z, note: "",
            color: DEFAULT_USER_MARKER_COLOR, icon: DEFAULT_USER_MARKER_ICON, group: DEFAULT_MARKER_GROUP,
          };
          setPendingPin(false);
          onFilterOpenChangeRef.current(false);
          setSelectedDeathPin(null);
          setPinDraft({ source: "placement", pin });
        }, next => { mapFrames.publishCursor(next); setHasCursor(Boolean(next)); },
        sourceConfig.kind === "seeded" ? GAME_BIOME_CANOPY_STYLES : {}, () => liveRef.current.following);
        renderer.current = view; view.setAltitude(altitudeRef.current); view.setActive(activeRef.current);
      } catch (reason) {
        if (!abort.signal.aborted) { console.error("World biome map initialization failed", reason); setError(true); }
      }
    })();
    return () => { abort.abort(); routeAbort.current?.abort(); view?.dispose(); structures.current?.dispose(); structures.current = null;
      if (routeBiomeSource.current === source) { routeBiomeSource.current = null; routeBiomeScope.current = null; }
      if (routeStructureSource.current === structureSource) { routeStructureSource.current = null; routeStructureScope.current = null; }
      structureSource?.dispose(); source.dispose(); renderer.current = null; };
  }, [sourceConfig, worldId, edition, version, seed, code, dimensionId, generationProfile, uniformBiomeId, retry, minimapMode, mapFrames, takeInitialZoom]);
  useEffect(() => {
    if (!minimapMode || !zoomCommand || handledZoomCommand.current === zoomCommand.revision || !renderer.current) return;
    handledZoomCommand.current = zoomCommand.revision;
    if (zoomCommand.type === "zoom") renderer.current.zoom(zoomCommand.direction === "in" ? 2 : 0.5);
    else { onManualCamera(); renderer.current.center(zoomCommand.x, zoomCommand.z); }
  }, [minimapMode, onManualCamera, state, zoomCommand]);
  const x = state?.x, z = state?.z, zoom = state?.zoom;
  useEffect(() => {
    if (minimapMode || x === undefined || z === undefined || zoom === undefined) return;
    initial.current = { x, z, zoom };
    const save = () => {
      pendingCameraSave.current = null;
      void saveCamera(worldId, dimensionId, viewScope, { x, z, zoom }).then(() => setSaveError(false), reason => { console.error("World camera persistence failed", reason); setSaveError(true); });
    };
    pendingCameraSave.current = save;
    const timer = setTimeout(save, 500);
    return () => clearTimeout(timer);
  }, [worldId, dimensionId, viewScope, x, z, zoom, saveCamera, minimapMode]);
  useEffect(() => () => { if (!minimapMode) pendingCameraSave.current?.(); }, [minimapMode]);
  useEffect(() => () => { mounted.current = false; if (filterTimer.current) clearTimeout(filterTimer.current); pendingFilterSave.current?.(); }, []);
  const changeFilter = (next: StructureFilterState) => {
    setFilter(next);
    if (boundsRef.current && !searching) structures.current?.setViewport(boundsRef.current, next.visibleCategories);
    if (filterTimer.current) clearTimeout(filterTimer.current);
    const save = () => { filterTimer.current = null; pendingFilterSave.current = null;
      void saveFilter(worldId, dimensionId, next).then(() => { if (mounted.current) setFilterSaveError(false); }, reason => {
        console.error("World structure filter persistence failed", reason); if (mounted.current) setFilterSaveError(true);
      }); };
    pendingFilterSave.current = save; filterTimer.current = setTimeout(save, 350);
  };
  useEffect(() => {
    searchCategoriesRef.current = searchCategories;
    if (boundsRef.current) structures.current?.setViewport(boundsRef.current, searchCategories);
  }, [searchCategories]);
  const markersVisible = (state?.zoom ?? BIOME_DEFAULT_ZOOM) >= BIOME_DEFAULT_ZOOM * 0.5;
  const hasLocationStatus = hasCursor || player?.dimension === dimensionId;
  const centerSharedTarget = (targetX: number, targetZ: number) => {
    manualCamera();
    renderer.current?.center(targetX, targetZ);
  };
  const focusSelectedMarker = (targetX: number, targetZ: number, panelSelector: string) => {
    cancelFocusRequest();
    onManualCamera();
    let attempts = 0;
    const move = () => {
      focusFrame.current = 0;
      const view = stateRef.current;
      const mapRect = canvas.current?.getBoundingClientRect();
      if (!view || !mapRect) return;
      const panels = [...(canvas.current?.parentElement?.querySelectorAll<HTMLElement>(panelSelector) ?? [])]
        .filter(panel => panel.getClientRects().length > 0);
      if (!panels.length && attempts < 8) {
        attempts += 1;
        focusFrame.current = requestAnimationFrame(move);
        return;
      }
      const panelRight = panels.length ? Math.max(...panels.map(panel => panel.getBoundingClientRect().right)) : null;
      const target = worldMarkerCameraTarget(targetX, targetZ, view, mapRect.left, panelRight);
      const travel = Math.hypot((target.x - view.x) * view.zoom, (target.z - view.z) * view.zoom);
      renderer.current?.panTo(target.x, target.z, travel <= view.width ? 400 : 600);
    };
    focusFrame.current = requestAnimationFrame(move);
  };
  const changeSearchQuery = (value: string) => {
    searchTargetAbort.current?.abort();
    searchTargetAbort.current = null;
    setSearchQuery(value);
  };
  const selectSearchType = (typeId: string) => {
    if (!state) return;
    const bounds = biomeStructureBounds(state);
    if (visibleStructureState?.points.some(point => point.type === typeId && point.x >= bounds.minX && point.x <= bounds.maxX &&
      point.z >= bounds.minZ && point.z <= bounds.maxZ)) return;
    const source = routeStructureSource.current, scope = routeStructureScope.current;
    if (!source || !scope) return;
    const controller = new AbortController();
    searchTargetAbort.current = controller;
    void findStructureSearchTarget(source, scope, typeId, { x: state.x, z: state.z }, bounds, controller.signal)
      .then(target => {
        if (!target || controller.signal.aborted) return;
        const currentBounds = boundsRef.current;
        if (!currentBounds || currentBounds.minX !== bounds.minX || currentBounds.maxX !== bounds.maxX ||
          currentBounds.minZ !== bounds.minZ || currentBounds.maxZ !== bounds.maxZ) return;
        centerSharedTarget(target.x, target.z);
      })
      .catch(reason => {
        if (controller.signal.aborted || reason instanceof DOMException && reason.name === "AbortError") return;
        console.error("Structure search navigation failed", reason);
      })
      .finally(() => { if (searchTargetAbort.current === controller) searchTargetAbort.current = null; });
  };
  const searchResults = searchEntries.filter(entry => searchTypeIds.includes(entry.id)).map(entry => {
    const matchingPoints = visibleStructureState?.points.filter(point => point.type === entry.id) ?? [];
    return { id: entry.id, name: entry.name, count: matchingPoints.length,
      available: sourceConfig.kind !== "uniform" && !(visibleStructureState?.unsupported.includes(entry.id) ?? false) };
  });
  const beginPin = () => {
    if (!personalEditingEnabled || !state) return;
    setPinDraft(null);
    setSelectedDeathPin(null);
    setRouteOpen(false);
    setRoutePick(null);
    onFilterOpenChange(false);
    setPendingPin(true);
  };
  const toggleJourneyVisibility = () => {
    try {
      journey.setVisible(!journey.preferences.visible);
      setJourneyCommandError(false);
    } catch (reason) {
      console.error("Journey visibility change failed", reason);
      setJourneyCommandError(true);
    }
  };
  const visiblePins = world.personal.pins.filter(pin => pin.dimension === dimensionId
    && !(world.personal.views[dimensionId]?.hiddenPinGroups ?? []).includes(pin.group));
  const renderedPins = pinDraft && !visiblePins.some(pin => pin.id === pinDraft.pin.id)
    ? [...visiblePins, pinDraft.pin] : visiblePins;
  const portalMarkerCount = portalLinks.filter(link => link.transition.from.dimension === dimensionId
    || link.transition.to.dimension === dimensionId).length;
  const portalsVisible = markersVisible && !(world.personal.views[dimensionId]?.hiddenPinGroups ?? [])
    .includes(GAME_OBSERVED_PORTAL_APPEARANCE.group);
  const routePins = world.personal.pins.filter(pin => pin.dimension === dimensionId);
  const endpointPoint = (selection: WorldRouteEndpointSelection): WorldRoutePoint | null => {
    if (selection.kind === "player") return player?.dimension === dimensionId ? { x: player.x, z: player.z } : null;
    if (selection.kind === "map") return selection.point;
    if (selection.kind === "pin") {
      const pin = routePins.find(candidate => candidate.id === selection.pinId);
      return pin ? { x: pin.x, z: pin.z } : null;
    }
    return resolvedNearest;
  };
  const routeStartPoint = endpointPoint(routeStart), routeDestinationPoint = endpointPoint(routeDestination);
  const resetCalculatedRoute = () => {
    routeAbort.current?.abort(); routeAbort.current = null;
    setCalculatedRoute(null); setResolvedNearest(null); setRouteError(null); setRoutePhase("idle");
  };
  const changeRouteStart = (selection: WorldRouteEndpointSelection) => { resetCalculatedRoute(); setRouteStart(selection); };
  const changeRouteDestination = (selection: WorldRouteEndpointSelection) => { resetCalculatedRoute(); setRouteDestination(selection); };
  const calculateRoute = async () => {
    const start = endpointPoint(routeStart), biomeSource = routeBiomeSource.current, biomeScope = routeBiomeScope.current;
    if (!start || !biomeSource || !biomeScope) { setRouteError("endpoint-unavailable"); setRoutePhase("error"); return; }
    routeAbort.current?.abort();
    const controller = new AbortController(); routeAbort.current = controller;
    setCalculatedRoute(null); setRouteError(null);
    try {
      let destination = endpointPoint(routeDestination);
      if (routeDestination.kind === "nearest") {
        const structureSource = routeStructureSource.current, structureScope = routeStructureScope.current;
        if (!structureSource || !structureScope) throw new StructureUnavailableError();
        setRoutePhase("resolving");
        destination = await findNearestWorldStructure(structureSource, structureScope,
          routeDestination.structureType, start, controller.signal);
        if (!controller.signal.aborted) setResolvedNearest(destination);
      }
      if (!destination) { setRouteError("endpoint-unavailable"); setRoutePhase("error"); return; }
      if (Math.hypot(destination.x - start.x, destination.z - start.z) < 1) {
        setRouteError("same-point"); setRoutePhase("error"); return;
      }
      setRoutePhase("calculating");
      const next = await calculateWorldRoute(biomeSource, biomeScope, start, destination, GAME_ROUTE_PROFILE, controller.signal);
      if (controller.signal.aborted) return;
      setCalculatedRoute(next); setRoutePhase("ready"); setRouteOpen(false);
    } catch (reason) {
      if (controller.signal.aborted || reason instanceof DOMException && reason.name === "AbortError") return;
      console.error("World route calculation failed", reason);
      setRouteError(reason instanceof StructureUnavailableError ? "structure-unavailable"
        : reason instanceof StructureNotFoundError ? "structure-not-found" : "calculation-failed");
      setRoutePhase("error");
    } finally { if (routeAbort.current === controller) routeAbort.current = null; }
  };
  const focusRoute = () => {
    if (!calculatedRoute || !state) return;
    manualCamera();
    const xs = calculatedRoute.points.map(point => point.x), zs = calculatedRoute.points.map(point => point.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    renderer.current?.center((minX + maxX) / 2, (minZ + maxZ) / 2);
    const usableWidth = Math.max(180, state.width - (routeOpen ? 380 : 80));
    const targetZoom = Math.max(1 / 64, Math.min(8, usableWidth / Math.max(96, maxX - minX),
      (state.height - 120) / Math.max(96, maxZ - minZ)));
    renderer.current?.zoom(targetZoom / (stateRef.current?.zoom ?? state.zoom));
  };
  const addMarkerLabel = t("map.controls.addMarker");
  const routeLabel = t("worldRoute.title");
  const journeyActionLabel = t(journey.preferences.visible ? "journey.hide" : "journey.show");
  const journeyLabel = journey.error ? t("journey.storageError") : `${journeyActionLabel} ${t("journey.mapLayer")}`;
  const centerLabel = t(!player ? "mapPlayer.unavailable" : "map.controls.centerLivePosition");
  const followLabel = t(!player ? "mapPlayer.unavailable" : following ? "mapPlayer.pause" : "mapPlayer.follow");
  const zoomOutLabel = t("biomeMap.zoomOut");
  const zoomInLabel = t("biomeMap.zoomIn");
  const toggleRoutePlanner = () => {
    setPendingPin(false);
    setPinDraft(null);
    setRouteOpen(open => {
      const next = !open;
      if (next) {
        if (!isPlayerAvailable && routeStart.kind === "player") {
          setRouteStart({ kind: "map", point: null });
          setRoutePick("start");
        } else if (routeStart.kind === "map" && !routeStart.point) {
          setRoutePick("start");
        } else if (routeDestination.kind === "map" && !routeDestination.point) {
          setRoutePick("destination");
        }
      } else {
        setRoutePick(null);
      }
      return next;
    });
  };
  const selectCompactStructure = (point: StructurePoint | null) => {
    setCompactStructure(point);
    if (!minimapMode) return;
    if (point) void openOverlayMarkerDetails({ worldId, dimension: dimensionId, point });
    else void closeOverlayMarkerDetails();
  };
  const dismissMapPanels = () => {
    setPinDraft(null);
    setSelectedPortalId(null);
    setSelectedDeathPin(null);
    setRouteOpen(false);
    onFilterOpenChange(false);
    setDismissDetailsRevision(revision => revision + 1);
  };
  useEffect(() => {
    if (!minimapMode) return;
    return subscribeOverlayMarkerDetails(request => {
      if (!request || request.worldId !== worldId || request.dimension !== dimensionId) setCompactStructure(null);
    });
  }, [dimensionId, minimapMode, worldId]);
  return <WorldMapFrameContext.Provider value={mapFrames}>
    <canvas ref={canvas} data-map-zoom={state?.zoom} tabIndex={0} role="application"
      onPointerDown={event => {
        if (active && !minimapMode && event.button === 0) {
          backgroundPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        }
      }}
      onPointerMove={event => {
        const down = backgroundPointer.current;
        if (down?.id === event.pointerId && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) {
          down.moved = true;
        }
      }}
      onPointerUp={event => {
        const down = backgroundPointer.current;
        backgroundPointer.current = null;
        if (!down || down.id !== event.pointerId || down.moved || !active || minimapMode || pendingPin || routePick) return;
        if (Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 4) dismissMapPanels();
      }}
      onPointerCancel={() => { backgroundPointer.current = null; }}
      onContextMenu={event => {
        if (minimapMode || !active) return;
        event.preventDefault();
        const view = stateRef.current;
        const rect = canvas.current?.getBoundingClientRect();
        if (!view || !rect || !view.zoom) return;
        const offsetX = event.clientX - rect.left, offsetY = event.clientY - rect.top;
        setCoordinateCopyFailed(false);
        setCoordinateMenu({
          left: Math.max(8, Math.min(offsetX, rect.width - 192)),
          top: Math.max(8, Math.min(offsetY, rect.height - 48)),
          x: Math.floor(view.x + (offsetX - view.width / 2) / view.zoom),
          z: Math.floor(view.z + (offsetY - view.height / 2) / view.zoom),
        });
      }}
      aria-label={t("biomeMap.canvas")}
      className={cn("absolute inset-0 h-full w-full touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        routePick === "start" ? "cursor-pin-start"
          : routePick === "destination" ? "cursor-pin-destination"
          : pendingPin ? "cursor-pin" : "cursor-grab")} />
    {!minimapMode && coordinateMenu && <div ref={coordinateMenuRef} data-map-ui role="menu"
      aria-label={t("map.details.coordinates")}
      onContextMenu={event => event.preventDefault()}
      className="pointer-events-auto absolute z-[60] min-w-44 rounded-[var(--radius-md)] border border-border bg-[var(--panel-bg)] p-1 shadow-[var(--panel-shadow)]"
      style={{ left: coordinateMenu.left, top: coordinateMenu.top }}>
      <button type="button" role="menuitem" className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-xs font-medium text-zinc-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(formatGameTeleportCommand({ x: coordinateMenu.x, y: null, z: coordinateMenu.z }));
            setCoordinateMenu(null);
          } catch (error) { console.error("Map coordinate copy failed", error); setCoordinateCopyFailed(true); }
        }}>
        <Copy size={14} aria-hidden="true" />{t("map.details.copyCoordinates")}
      </button>
      {coordinateCopyFailed && <span className="sr-only" role="alert">{t("map.details.coordinatesCopyFailed")}</span>}
    </div>}
    {!minimapMode && <WorldStructureSearchControl query={searchQuery} onQueryChange={changeSearchQuery}
      openRevision={structureSearchRequest?.revision}
      results={searchResults} loading={visibleStructureState?.phase === "loading" || visibleStructureState?.phase === "idle"}
      onSelect={selectSearchType} />}
    {active && <WorldJourneyLayer read={journey} dimension={dimensionId} view={state} portals={portalLinks} />}
    {active && (routeOpen || calculatedRoute || routeStartPoint || routeDestinationPoint) && (
      <WorldRouteLayer route={calculatedRoute} startPoint={routeStartPoint} destinationPoint={routeDestinationPoint}
        showStartMarker={routeStart.kind !== "player"} view={state} />
    )}
    {active && <WorldPlayerMarker motion={motion} dimension={dimensionId} view={state} centered={following} />}
    {active && lastPosition && <WorldLastPositionMarker position={lastPosition} dimension={dimensionId} view={state} />}
    {active && portalsVisible && <JourneyPortalMarkers links={portalLinks} dimension={dimensionId} view={state}
      selectedId={selectedPortalId} onFollow={minimapMode ? onFollowPortal : undefined}
      onSelect={minimapMode ? undefined : link => {
        setPinDraft(null); setSelectedDeathPin(null); setSelectedPortalId(link.id);
        onFilterOpenChange(false);
      }} />}
    {(markersVisible || pinDraft) && <WorldPinLayer
      pins={renderedPins}
      view={state} selectedId={selectedDeathPin?.id ?? pinDraft?.pin.id ?? null} interactive={!minimapMode && !pendingPin && !routePick}
      onSelect={pin => {
        if (pinDraft?.source === "placement" && pin.id === pinDraft.pin.id) return;
        setSelectedPortalId(null);
        onFilterOpenChange(false);
        if (isDeathPin(pin)) { setPinDraft(null); setSelectedDeathPin(pin); }
        else { setSelectedDeathPin(null); setPinDraft({ source: "edit", pin }); }
        focusSelectedMarker(pin.x, pin.z, isDeathPin(pin) ? ".inspector-panel" : ".world-pin-panel");
      }} />}
    {minimapMode && active && <WorldDestinationMarkers destinations={world.personal.tracked} dimension={dimensionId} view={state} player={player}
      area={state ? { left: 20, top: 20, right: Math.max(20, state.width - 20), bottom: Math.max(20, state.height - 64) } : { left: 0, top: 0, right: 0, bottom: 0 }}
      portalProjection={null}
      onCenter={(targetX, targetZ) => { onManualCamera(); renderer.current?.center(targetX, targetZ); }} />}
    <WorldStructureLayer key={`${worldId}:${edition}:${version}:${seed}:${dimensionId}:${retry}`} world={world} dimension={dimensionId} view={state} state={visibleStructureState} filter={filter} active={active}
      dismissDetailsRevision={dismissDetailsRevision}
      portalMarkerCount={portalMarkerCount}
      searchTypeIds={searching ? searchTypeIds : null}
      selectedDeathPin={selectedDeathPin} onDeathPinClose={() => setSelectedDeathPin(null)}
      personalMarkerOpen={!!pinDraft || !!selectedPortal} onSelectStructure={point => {
        setPinDraft(null);
        setSelectedPortalId(null);
        focusSelectedMarker(point.x, point.z, ".inspector-panel");
      }}
      compact={minimapMode || !!routePick}
      compactInteractive={minimapMode && !routePick}
      compactSelection={compactStructure} onCompactSelectionChange={selectCompactStructure}
      markersVisible={markersVisible} player={player} filterOpen={filterOpen} onFilterOpenChange={open => {
        if (open) setSelectedPortalId(null);
        onFilterOpenChange(open);
      }}
      onFilterChange={changeFilter} savePersonal={savePersonal}
      knowledgeCatalogs={knowledgeCatalogs}
      onCenter={centerSharedTarget}
      onCenterSelected={(x, z) => focusSelectedMarker(x, z, ".inspector-panel")}
      onDisperse={(x, z, targetZoom) => { manualCamera(); renderer.current?.center(x, z);
        if (stateRef.current) renderer.current?.zoom(targetZoom / stateRef.current.zoom); }}
      onDismiss={() => { setSelectedDeathPin(null); canvas.current?.focus({ preventScroll: true }); }} />
    {!minimapMode && <div className="sr-only" aria-live="polite">
      <p>{t(error || state?.error ? "biomeMap.failed" : state && state.ready === state.total ? "biomeMap.ready" : "biomeMap.loading", { ready: state?.ready ?? 0, total: state?.total ?? 0 })}</p>
      <p data-structure-status={visibleStructureState?.phase ?? "loading"} data-structure-total={visibleStructureState?.total ?? 0}>{t(`structureMap.${visibleStructureState?.phase ?? "loading"}`, { completed: visibleStructureState?.completed ?? 0, total: visibleStructureState?.total ?? 0 })}</p>
    </div>}
    <WorldMapLocationStatus cursor={null} player={player} dimension={dimensionId} compact={minimapMode}
      suppressWaiting={unboundPositionVisible} />
    {!minimapMode && (error || state?.error || visibleStructureState?.phase === "error" || saveError || filterSaveError || journeyCommandError) &&
      <div className={cn(controlsClass, "pointer-events-auto absolute left-3 z-10 max-w-[calc(100%-5rem)] px-3 py-2 text-[11px] leading-4 text-zinc-100",
        hasLocationStatus ? "bottom-14" : "bottom-3")}>
        {visibleStructureState?.phase === "error" && <button type="button" className="flex cursor-pointer items-center gap-1 text-accent" onClick={() => structures.current?.retry()}><RotateCcw size={12} />{t("structureMap.retry")}</button>}
        {saveError && <p role="alert">{t("biomeMap.saveFailed")}</p>}
        {filterSaveError && <p role="alert">{t("structureMap.filters.saveFailed")}</p>}
        {journeyCommandError && <p role="alert">{t("journey.commandFailed")}</p>}
        {(error || state?.error) && <button type="button" className="flex cursor-pointer items-center gap-1 text-accent" onClick={() => { setError(false); setState(null); setStructureState(null); setRetry(value => value + 1); }}><RotateCcw size={12} />{t("worlds.retry")}</button>}
      </div>}
    <div className="world-map-control-dock">
      {!minimapMode && routeOpen && <WorldRoutePanel start={routeStart} destination={routeDestination}
        startPoint={routeStartPoint} destinationPoint={routeDestinationPoint}
        playerAvailable={isPlayerAvailable} pins={routePins}
        structures={sourceConfig.kind === "uniform" ? [] : GAME_STRUCTURE_TYPES.map(type => ({ id: type.id, label: t(`structureMap.types.${type.id}`) }))}
        picking={routePick} phase={routePhase} error={routeError} route={calculatedRoute}
        onStartChange={changeRouteStart} onDestinationChange={changeRouteDestination}
        onPickMap={target => { setPendingPin(false); setPinDraft(null); setRoutePick(target); }}
        onCalculate={() => { void calculateRoute(); }} onFocus={focusRoute}
        onClear={resetCalculatedRoute} onClose={() => { setRouteOpen(false); setRoutePick(null); }}
        onCancelPick={() => setRoutePick(null)} />}
      {!minimapMode && <div className="map-control-stack">
        <Tooltip label={routeLabel} side="left" className="map-control-tooltip">
          <button type="button" data-tour="map-route" className={cn("map-control-button", (routeOpen || calculatedRoute) && "map-control-active")}
            aria-pressed={routeOpen} aria-label={routeLabel} onClick={toggleRoutePlanner}>
            <Route size={16} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>}
      {!minimapMode && personalEditingEnabled && <div className="map-control-stack">
        <Tooltip label={addMarkerLabel} side="left" className="map-control-tooltip">
          <button type="button" data-tour="map-marker" className={cn("map-control-button", pendingPin && "map-control-active")}
            aria-pressed={!!pendingPin} aria-label={addMarkerLabel}
            onClick={() => pendingPin ? setPendingPin(false) : beginPin()}><MapPinPlus size={16} /></button>
        </Tooltip>
      </div>}
      <div className="map-control-stack">
        <Tooltip label={journeyLabel} side="left" className="map-control-tooltip">
          <button type="button" data-tour="map-journey" className={cn("map-control-button disabled:cursor-not-allowed", journey.preferences.visible && "map-control-active")}
            disabled={!!journey.error} aria-pressed={journey.preferences.visible} aria-label={journeyLabel}
            onClick={toggleJourneyVisibility}>
            {journey.preferences.visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
          </button>
        </Tooltip>
      </div>
      {player && <div className="map-control-stack">
        <Tooltip label={centerLabel} side="left" className="map-control-tooltip">
          <button type="button" data-tour="map-center" className="map-control-button disabled:cursor-not-allowed" disabled={!active || !player}
            aria-label={t("map.controls.centerLivePosition")}
            onClick={() => { if (player) renderer.current?.center(player.x, player.z); }}><LocateFixed size={16} /></button>
        </Tooltip>
        <Tooltip label={followLabel} side="left" className="map-control-tooltip">
          <button type="button" data-tour="map-follow" className={cn("map-control-button disabled:cursor-not-allowed", following && "map-control-active")}
            disabled={!active || !player} aria-pressed={following} aria-label={t(following ? "mapPlayer.pause" : "mapPlayer.follow")}
            onClick={onFollow}><Navigation size={16} fill={following ? "currentColor" : "none"} /></button>
        </Tooltip>
      </div>}
      <div className="map-control-stack world-map-zoom-controls" data-tour="map-zoom" role="group" aria-label={t("map.controls.zoomControls")}>
        <Tooltip label={zoomOutLabel} side="top" className="map-control-tooltip">
          <button type="button" data-tour="map-zoom-out" className="map-control-button" aria-label={zoomOutLabel} onClick={() => renderer.current?.zoom(0.5)}><Minus size={16} /></button>
        </Tooltip>
        <WorldMapZoomLevel view={state} />
        <Tooltip label={zoomInLabel} side="top" className="map-control-tooltip">
          <button type="button" data-tour="map-zoom-in" className="map-control-button" aria-label={zoomInLabel} onClick={() => renderer.current?.zoom(2)}><Plus size={16} /></button>
        </Tooltip>
      </div>
    </div>
    {!minimapMode && pendingPin && <div className="map-placement-hint">
      {t("map.placementHint")}
    </div>}
    {!minimapMode && pinDraft && <WorldPinDialog key={`${pinDraft.source}:${pinDraft.pin.id}`} draft={pinDraft}
      availableGroups={world.personal.pins.map(pin => pin.group)} onClose={() => setPinDraft(null)}
      onDraftChange={pin => setPinDraft(current => current?.source === "placement" ? { ...current, pin } : current)}
      onRemove={pinDraft.source === "edit" ? async () => {
        await savePersonal(worldId, personal => removeWorldPin(personal, pinDraft.pin.id));
        setPinDraft(null);
      } : undefined}
      onSave={async pin => {
        await savePersonal(worldId, personal => putWorldPin(personal, pin));
        setPinDraft({ source: "edit", pin });
      }} />}
    {!minimapMode && portalsVisible && selectedPortal && <WorldObservedPortalDetails key={selectedPortal.id}
      portal={selectedPortal} dimension={dimensionId} onClose={() => setSelectedPortalId(null)}
      onBack={() => { setSelectedPortalId(null); onFilterOpenChange(true); }} onFollow={onFollowPortal}
      onRemove={async () => {
        await savePersonal(worldId, personal => removeObservedPortal(personal, selectedPortal));
        setSelectedPortalId(null);
      }} />}
  </WorldMapFrameContext.Provider>;
};

const WorldBiomeMap = ({ world, config, active, player: candidate = null, minimapMode = false, unboundPositionVisible = false, followLivePosition = false,
  onToggleFollowLivePosition, zoomCommand, saveCamera = persistCamera, saveFilter = persistFilter, savePersonal = persistPersonal,
  knowledgeCatalogs = EMPTY_KNOWLEDGE_CATALOGS, viewScope = "desktop", filterOpen = false, onFilterOpenChange = () => {},
  personalEditingEnabled = true, structureSearchRequest, onStructureSearchApplied, now: snapshotNow }: {
  world: WorldRecord; config: BiomePreviewConfig; active: boolean; player?: WorldMapPlayer | null; minimapMode?: boolean;
  unboundPositionVisible?: boolean;
  followLivePosition?: boolean; onToggleFollowLivePosition?: () => void;
  zoomCommand?: MapWindowCommand | null;
  saveCamera?: SaveCamera; saveFilter?: SaveFilter; savePersonal?: SaveWorldPersonal; knowledgeCatalogs?: KnowledgeCatalogs;
  viewScope?: WorldMapSurface;
  filterOpen?: boolean; onFilterOpenChange?: (open: boolean) => void;
  personalEditingEnabled?: boolean;
  structureSearchRequest?: WorldStructureSearchRequest | null;
  onStructureSearchApplied?: (revision: number) => void;
  now?: number;
}) => {
  const { t } = useTranslation();
  const [initialTime] = useState(Date.now);
  const now = snapshotNow ?? initialTime;
  const currentPlayer = useCurrentMapPlayer(candidate?.worldId === world.id ? candidate : null);
  const player = currentPlayer;
  const motion = useSmoothedWorldMapPlayer(player);
  const initialZoomApplied = useRef(false);
  const takeInitialZoom = useCallback(() => {
    if (initialZoomApplied.current || world.id === WORLD_LIBRARY_CONFIG.exampleWorld.id) return null;
    initialZoomApplied.current = true;
    return BIOME_DEFAULT_ZOOM * 4;
  }, [world.id]);
  const [manualDimension, setDimension] = useState<Dimension>(() => GAME_MAP_DIMENSIONS.find(item =>
    item.id === readResumeDimension(world, viewScope, GAME_MAP_DIMENSIONS.map(entry => entry.id), now)) ?? GAME_MAP_DIMENSIONS[0]);
  const [portalFocus, setPortalFocus] = useState<{ dimension: string; x: number; z: number } | null>(null);
  const [resolvedSearch, setResolvedSearch] = useState<{ revision: number; typeId: string; dimensionId: string } | null>(null);
  const handledSearchRevision = useRef(0);
  const initialFollowKey = !minimapMode && candidate?.worldId === world.id ? candidate.sessionKey : null;
  const [followingKey, setFollowingKey] = useState<string | null>(initialFollowKey);
  const minimapSessionRef = useRef<string | null>(null);
  const fullMapSessionRef = useRef<string | null>(initialFollowKey);
  const observedPlayerDimension = useRef<string | null>(null);
  const playerSessionKey = player?.sessionKey ?? null;
  const playerDimensionId = player?.dimension ?? null;
  useEffect(() => {
    if (!active || !playerSessionKey || !playerDimensionId) return;
    const observation = `${playerSessionKey}:${playerDimensionId}`;
    if (observedPlayerDimension.current === observation) return;
    const next = GAME_MAP_DIMENSIONS.find(item => item.id === playerDimensionId);
    if (!next) return;
    const frame = window.requestAnimationFrame(() => {
      observedPlayerDimension.current = observation;
      setPortalFocus(null);
      setDimension(current => current.id === next.id ? current : next);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, playerSessionKey, playerDimensionId]);
  const following = active && !!player && (minimapMode ? followLivePosition : followingKey === player.sessionKey);
  const dimension = following ? GAME_MAP_DIMENSIONS.find(item => item.id === player.dimension) ?? manualDimension : manualDimension;
  // Retain the last followed dimension when telemetry expires or the view becomes hidden.
  if (following && dimension.id !== manualDimension.id) setDimension(dimension);
  useEffect(() => {
    if (!active || minimapMode || !structureSearchRequest
      || handledSearchRevision.current === structureSearchRequest.revision) return;
    const target = resolveWorldStructureSearchTarget(structureSearchRequest.knowledgeId, dimension.id);
    if (!target) throw new Error("The guide requested an unknown structure type.");
    const targetDimension = GAME_MAP_DIMENSIONS.find(item => item.id === target.dimensionId);
    if (!targetDimension) throw new Error("The guide requested an unknown map dimension.");
    handledSearchRevision.current = structureSearchRequest.revision;
    setFollowingKey(null);
    setDimension(targetDimension);
    setResolvedSearch({ revision: structureSearchRequest.revision, ...target });
    onStructureSearchApplied?.(structureSearchRequest.revision);
  }, [active, minimapMode, structureSearchRequest, dimension.id, onStructureSearchApplied]);
  useEffect(() => {
    if (!minimapMode || !player || minimapSessionRef.current === player.sessionKey) return;
    minimapSessionRef.current = player.sessionKey;
    if (!followLivePosition) onToggleFollowLivePosition?.();
  }, [followLivePosition, minimapMode, onToggleFollowLivePosition, player]);
  useEffect(() => {
    if (!active || minimapMode || !player || fullMapSessionRef.current === player.sessionKey) return;
    fullMapSessionRef.current = player.sessionKey;
    setDimension(current => GAME_MAP_DIMENSIONS.find(item => item.id === player.dimension) ?? current);
    setFollowingKey(player.sessionKey);
  }, [active, minimapMode, player]);
  const pause = () => {
    setDimension(dimension);
    if (minimapMode) { if (followLivePosition) onToggleFollowLivePosition?.(); }
    else setFollowingKey(null);
  };
  const toggleFollow = () => {
    if (minimapMode) { if (player) onToggleFollowLivePosition?.(); }
    else if (following) pause();
    else if (player) { setDimension(GAME_MAP_DIMENSIONS.find(item => item.id === player.dimension) ?? dimension); setFollowingKey(player.sessionKey); }
  };
  const followPortal = (target: JourneyDimensionTransition["to"]) => {
    const next = GAME_MAP_DIMENSIONS.find(item => item.id === target.dimension);
    if (!next) return;
    if (minimapMode && followLivePosition) onToggleFollowLivePosition?.();
    setFollowingKey(null);
    setPortalFocus({ dimension: target.dimension, x: target.point.x, z: target.point.z });
    setDimension(next);
  };
  return <>
    <BiomeSurface key={dimension.id} world={world} config={config} dimension={dimension} active={active}
      structureSearchRequest={resolvedSearch?.dimensionId === dimension.id ? resolvedSearch : null}
      player={player} motion={motion} now={now} minimapMode={minimapMode} unboundPositionVisible={unboundPositionVisible}
      takeInitialZoom={takeInitialZoom}
      viewScope={viewScope} following={following} onManualCamera={pause}
      portalFocus={portalFocus} onFollowPortal={followPortal}
      saveCamera={saveCamera} saveFilter={saveFilter} savePersonal={savePersonal} knowledgeCatalogs={knowledgeCatalogs}
      filterOpen={filterOpen} onFilterOpenChange={onFilterOpenChange} onFollow={toggleFollow} zoomCommand={zoomCommand}
      personalEditingEnabled={personalEditingEnabled} />
    {!minimapMode && <div data-tour="map-dimension" className="pointer-events-auto absolute bottom-3 left-3 z-20">
      <MapCubePicker options={GAME_MAP_DIMENSIONS.map(item => ({ id: item.id, label: t(item.labelKey), artwork: item.artwork }))}
        value={dimension.id} onSelect={id => { const next = GAME_MAP_DIMENSIONS.find(item => item.id === id); if (next) { setDimension(next); setFollowingKey(null); setResolvedSearch(null); setPortalFocus(null); } }}
        ariaLabel={t("biomeMap.dimension")} />
    </div>}
  </>;
};
export default WorldBiomeMap;
