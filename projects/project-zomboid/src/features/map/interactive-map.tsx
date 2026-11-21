import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import LivePlayerMarker from "../live-position/live-player-marker";
import { useOnboardingActive } from "../onboarding/use-onboarding";
import { useOverlayKeyboardMovement } from "../overlay/use-overlay-keyboard-movement";
import {
  recordLiveViewCommit,
} from "../live-position/live-position-diagnostics";
import {
  getLatestLivePosition,
} from "../live-position/live-position-store";
import {
  getLatestLiveMotionPosition,
  subscribeLiveMotion,
} from "../live-position/live-motion";
import type { LivePositionState } from "../live-position/live-position-types";
import { getClusterDispersalZoom, type MapPointCluster } from "./map-clustering";
import MapDeepZoomLayer from "./map-deep-zoom-layer";
import MapForagingLayer from "./map-foraging-layer";
import MapFloorControls from "./map-floor-controls";
import { getSelectableMapFloors, isPointVisibleOnFloor } from "./map-floor-visibility";
import MapLiveControls from "./map-live-controls";
import MapMarkerLayer from "./map-marker-layer";
import MapPerformanceWarning from "./map-performance-warning";
import type { MapDisplayPreferences } from "./map-display-preferences";
import { getMarkerZoomFromNormalized } from "./map-marker-zoom";
import { getWorldUnitsPerPixel, screenToWorld, worldToScreen, type MapProjectionMode } from "./map-projection";
import MapRoutesLayer from "./map-routes-layer";
import MapSpawnPointLayer from "./map-spawn-point-layer";
import MapSpawnPointPanel from "./map-spawn-point-panel";
import MapSpawnPointTooltip from "./map-spawn-point-tooltip";
import { findSpawnPointAtCoordinate } from "./map-spawn-point-utils";
import MapBottomControls from "./map-bottom-controls";
import MapTileLayer from "./map-tile-layer";
import MapToolbar from "./map-toolbar";
import MapVehicleSpawnLayer from "./map-vehicle-spawn-layer";
import MapVehicleSpawnTooltip from "./map-vehicle-spawn-tooltip";
import OverlayKeyboardMoveHint from "./overlay-keyboard-move-hint";
import OverlayMinimapZoomControls from "./overlay-minimap-zoom-controls";
import { findVehicleSpawnAtCoordinate } from "./map-vehicle-spawn-utils";
import type { MapCoordinate, MapMetadata, MapPoint, MapRouteWaypoint, MapSpawnPoint, MapView, SavedMapRoute } from "./types";
import type { MapIsometricManifest } from "./map-isometric-types";
import { useIsometricMap } from "./use-isometric-map";
import { useMapDisplayPreferences } from "./use-map-display-preferences";

const MAP_VIEW_KEY_PREFIX = "pzim:map-view";
const MINIMAP_ZOOM_KEY_PREFIX = "pzim:minimap-zoom";
const TOP_ZOOM_RANGE = { minimum: 0.035, maximum: 1.4 };
const ISOMETRIC_ZOOM_RANGE = { minimum: 0.05, maximum: 32 };
const MINIMAP_PROJECTION: MapProjectionMode = "isometric";
const MINIMAP_DEFAULT_ZOOM_PERCENTAGE = 18;
const MINIMAP_DEFAULT_ISOMETRIC_ZOOM = getMarkerZoomFromNormalized(
  MINIMAP_DEFAULT_ZOOM_PERCENTAGE / 100,
  MINIMAP_PROJECTION,
);
const VEHICLE_SPAWN_VISIBILITY_KEY = "pzim:vehicle-spawn-overlay-visible";
const FORAGING_VISIBILITY_KEY = "pzim:foraging-overlay-visible";
const SPAWN_POINT_VISIBILITY_KEY = "pzim:spawn-point-overlay-visible";
const SPAWN_PROFESSION_KEY = "pzim:spawn-point-profession";
const ONBOARDING_ZOOM_PERCENTAGE = 18;
/** Cursor grab radius for the canvas overlays, in screen pixels. */
const HOVER_GRAB_PIXELS = 14;
/** PZ must occasionally recycle viewport tiles. Keep that operation far away
 * from the hot 20 Hz stage path; Valheim never needs it because its map is one
 * fixed texture. */
const FOLLOW_REBASE_PX = 96;
const FOLLOW_OVERSCAN_PX = 128;
const FOLLOW_SNAP_WORLD_DISTANCE = 96;
interface InteractiveMapProps {
  data: MapMetadata;
  isometricBaseSource?: MapIsometricManifest;
  isometricOverlays?: MapIsometricManifest[];
  points: MapPoint[];
  selectedPoint: MapPoint | null;
  focusPoint: MapPoint | null;
  focusRoute: SavedMapRoute | null;
  placementMode: boolean;
  onPickLootStart?: (coordinate: MapCoordinate) => void;
  routeMode: boolean;
  routes: SavedMapRoute[];
  visibleRouteIds: string[];
  draftRoutePoints: MapRouteWaypoint[];
  livePosition: LivePositionState;
  followLivePosition?: boolean;
  onToggleFollowLivePosition?: () => void;
  controlsIntroVisible?: boolean;
  minimapMode?: boolean;
  selectedFloor: number;
  onFloorChange: (floor: number) => void;
  onSelectPoint: (point: MapPoint | null) => void;
  onMoveMarker: (point: MapPoint, coordinate: MapCoordinate) => void;
  onPlaceMarker: (coordinate: MapCoordinate, floor: number) => void;
  onTogglePlacement: () => void;
  onAddRoutePoint: (coordinate: MapCoordinate) => void;
  onSaveRoute: () => void;
  onCancelRoute: () => void;
  onUndoRoutePoint: () => void;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const getZoomRange = (projection: MapProjectionMode) =>
  projection === "isometric" ? ISOMETRIC_ZOOM_RANGE : TOP_ZOOM_RANGE;

/** The default close-up a jump-to (marker pick, centre-on-player) zooms to. */
const SELECTION_ZOOM_FLOOR = { top: 0.48, isometric: 28 } as const;

/**
 * Zoom to use when the camera jumps to a point. Only ever a floor: a view
 * already closer than the target keeps its zoom, so a jump never zooms *out*.
 * Settings › Map can turn the zoom off entirely, or push the floor closer.
 */
const getJumpZoom = (
  currentZoom: number,
  projection: MapProjectionMode,
  preferences: MapDisplayPreferences,
) => {
  if (!preferences.selectionZoomEnabled) return currentZoom;
  const floor =
    SELECTION_ZOOM_FLOOR[projection === "isometric" ? "isometric" : "top"] *
    (preferences.selectionZoomPercent / 100);
  return Math.max(currentZoom, Math.min(floor, getZoomRange(projection).maximum));
};

const getDefaultView = (
  data: MapMetadata,
  projection: MapProjectionMode,
  isometricCellRange?: [number, number, number, number],
  cellSize = 256,
): MapView => {
  const zoomRange = getZoomRange(projection);
  if (projection === "isometric" && isometricCellRange) {
    const [cellX, cellY, cellWidth, cellHeight] = isometricCellRange;
    return {
      centerX: (cellX + cellWidth / 2) * cellSize,
      centerY: (cellY + cellHeight / 2) * cellSize,
      zoom: clamp(760 / Math.max(cellWidth * cellSize, cellHeight * cellSize), zoomRange.minimum, 4),
    };
  }
  return {
    centerX: (data.bounds.minX + data.bounds.maxX) / 2,
    centerY: (data.bounds.minY + data.bounds.maxY) / 2,
    zoom: clamp(900 / Math.max(data.bounds.maxX - data.bounds.minX, data.bounds.maxY - data.bounds.minY), zoomRange.minimum, 0.12),
  };
};

const readView = (
  data: MapMetadata,
  projection: MapProjectionMode,
  isometricCellRange?: [number, number, number, number],
  cellSize = 256,
): MapView => {
  const zoomRange = getZoomRange(projection);
  const fallback = getDefaultView(data, projection, isometricCellRange, cellSize);
  try {
    const value = localStorage.getItem(`${MAP_VIEW_KEY_PREFIX}:${data.id}:${projection}`);
    if (!value) return fallback;
    const parsed = JSON.parse(value) as Partial<MapView>;
    if (!Number.isFinite(parsed.centerX) || !Number.isFinite(parsed.centerY) || !Number.isFinite(parsed.zoom)) return fallback;
    return {
      centerX: clamp(parsed.centerX!, data.bounds.minX, data.bounds.maxX),
      centerY: clamp(parsed.centerY!, data.bounds.minY, data.bounds.maxY),
      zoom: clamp(parsed.zoom!, zoomRange.minimum, zoomRange.maximum),
    };
  } catch {
    return fallback;
  }
};

const readMinimapZoom = (mapId: string) => {
  try {
    const storedZoom = Number(localStorage.getItem(
      `${MINIMAP_ZOOM_KEY_PREFIX}:${mapId}:${MINIMAP_PROJECTION}`,
    ));
    return Number.isFinite(storedZoom) && storedZoom > 0
      ? clamp(storedZoom, ISOMETRIC_ZOOM_RANGE.minimum, ISOMETRIC_ZOOM_RANGE.maximum)
      : MINIMAP_DEFAULT_ISOMETRIC_ZOOM;
  } catch {
    return MINIMAP_DEFAULT_ISOMETRIC_ZOOM;
  }
};

const InteractiveMap = ({
  data,
  isometricBaseSource,
  isometricOverlays = [],
  points,
  selectedPoint,
  focusPoint,
  focusRoute,
  placementMode,
  onPickLootStart,
  routeMode,
  routes,
  visibleRouteIds,
  draftRoutePoints,
  livePosition,
  followLivePosition = false,
  onToggleFollowLivePosition,
  controlsIntroVisible = false,
  minimapMode = false,
  selectedFloor,
  onFloorChange,
  onSelectPoint,
  onPlaceMarker,
  onMoveMarker,
  onTogglePlacement,
  onAddRoutePoint,
  onSaveRoute,
  onCancelRoute,
  onUndoRoutePoint,
}: InteractiveMapProps) => {
  const { t } = useTranslation();
  const onboardingActive = useOnboardingActive();
  const { enabled: keyboardMovementEnabled } = useOverlayKeyboardMovement();
  const { preferences: displayPreferences } = useMapDisplayPreferences();
  // Read through a ref where the camera jumps: a preference change must never
  // re-run a focus effect and yank the map back to a stale focus point.
  const displayPreferencesRef = useRef(displayPreferences);
  const {
    catalog: isometricCatalog,
    groundSource: isometricGroundSource,
    source: isometricSource,
    reportSourceFailure: reportIsometricSourceFailure,
  } = useIsometricMap();
  const activeIsometricSource = isometricBaseSource ?? isometricSource;
  const localGroundSources = useMemo(() => {
    if (isometricBaseSource
      || activeIsometricSource?.floors.some(({ floor }) => floor === 0)
      || !isometricGroundSource) return [];
    return [isometricGroundSource];
  }, [activeIsometricSource, isometricBaseSource, isometricGroundSource]);
  const activeIsometricOverlays = useMemo(
    () => [...localGroundSources, ...isometricOverlays],
    [isometricOverlays, localGroundSources],
  );
  const activeIsometricCellRange = isometricBaseSource?.cellRange ?? isometricCatalog?.worldCellRange;
  const activeIsometricCellSize = isometricBaseSource?.mapInfo.cell_size ?? isometricCatalog?.cellSize ?? 256;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<
    { pointerId: number; x: number; y: number; moved: boolean; stoppedFollow: boolean } | null
  >(null);
  /** Accumulated pointer motion awaiting the next animation frame. */
  const pendingPointerRef = useRef<{
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const suppressMarkerClickRef = useRef(false);
  const cameraFrameRef = useRef<number | null>(null);
  const wasFollowingLivePositionRef = useRef(false);
  const appliedFocusPointRef = useRef<MapPoint | null>(null);
  const appliedFocusRouteRef = useRef<SavedMapRoute | null>(null);
  const onboardingPreviousViewRef = useRef<MapView | null>(null);
  const wasOnboardingActiveRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [projection] = useState<MapProjectionMode>(() =>
    minimapMode ? MINIMAP_PROJECTION : "isometric");
  // Overwolf recreates the overlay window on each show. Restore only the scale
  // the player chose; the live-position camera owns the centre.
  const [view, setView] = useState<MapView>(() => minimapMode
    ? {
        ...getDefaultView(
          data,
          MINIMAP_PROJECTION,
          activeIsometricCellRange,
          activeIsometricCellSize,
        ),
        zoom: readMinimapZoom(data.id),
      }
    : readView(data, projection));
  const viewRef = useRef(view);
  /** What the layers are currently drawn with. The imperative stage runs
   * ahead until it reaches the edge of the tile guard band. */
  const renderedViewRef = useRef(view);
  const worldRef = useRef<HTMLDivElement>(null);
  const worldOffsetAppliedRef = useRef(false);
  const followCommitRef = useRef(false);
  const followRebaseTimerRef = useRef<number | null>(null);
  const sizeRef = useRef(size);
  const projectionRef = useRef<MapProjectionMode>(projection);
  const [cursorCoordinate, setCursorCoordinate] = useState<MapCoordinate>({ x: 0, y: 0 });
  const [expandedClusterPointIds, setExpandedClusterPointIds] = useState<string[]>([]);
  // Screen-space cursor, kept only so the vehicle spawn tooltip can follow it.
  const [cursorScreen, setCursorScreen] = useState<{ left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [vehicleSpawnsVisible] = useState(
    () => localStorage.getItem(VEHICLE_SPAWN_VISIBILITY_KEY) === "true",
  );
  const [foragingVisible] = useState(
    () => localStorage.getItem(FORAGING_VISIBILITY_KEY) === "true",
  );
  const [spawnPointsVisible] = useState(
    () => localStorage.getItem(SPAWN_POINT_VISIBILITY_KEY) === "true",
  );
  const [spawnProfessionId, setSpawnProfessionId] = useState<string | null>(
    () => localStorage.getItem(SPAWN_PROFESSION_KEY),
  );
  const [spawnDetailPoint, setSpawnDetailPoint] = useState<MapSpawnPoint | null>(null);

  const availableFloors = useMemo(() => getSelectableMapFloors(
    [activeIsometricSource, ...activeIsometricOverlays]
      .flatMap((source) => source?.floors.map(({ floor }) => floor) ?? []),
  ), [activeIsometricOverlays, activeIsometricSource]);
  const activeFloor = useMemo(() => {
    if (availableFloors.length === 0 || availableFloors.includes(selectedFloor)) return selectedFloor;
    return availableFloors.reduce((closest, candidate) => {
      const candidateDistance = Math.abs(candidate - selectedFloor);
      const closestDistance = Math.abs(closest - selectedFloor);
      return candidateDistance < closestDistance
        || (candidateDistance === closestDistance && candidate > closest)
        ? candidate
        : closest;
    });
  }, [availableFloors, selectedFloor]);
  const floorPoints = useMemo(
    () => points.filter((point) => isPointVisibleOnFloor(point, activeFloor)),
    [activeFloor, points],
  );
  const activeProjection = projection === "isometric"
    ? "isometric"
    : "top";
  const spawnDetailScreen = spawnDetailPoint
    ? worldToScreen(spawnDetailPoint, view, size.width, size.height, activeProjection)
    : null;

  const stopCameraAnimation = useCallback(() => {
    if (cameraFrameRef.current === null) return;
    window.cancelAnimationFrame(cameraFrameRef.current);
    cameraFrameRef.current = null;
  }, []);

  const animateToView = useCallback((target: MapView) => {
    stopCameraAnimation();
    const zoomRange = getZoomRange(activeProjection);
    const boundedTarget = {
      centerX: clamp(target.centerX, data.bounds.minX, data.bounds.maxX),
      centerY: clamp(target.centerY, data.bounds.minY, data.bounds.maxY),
      zoom: clamp(target.zoom, zoomRange.minimum, zoomRange.maximum),
    };
    const start = viewRef.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      viewRef.current = boundedTarget;
      setView(boundedTarget);
      return;
    }

    const screenDistance = Math.hypot(
      (boundedTarget.centerX - start.centerX) * start.zoom,
      (boundedTarget.centerY - start.centerY) * start.zoom,
    );
    const duration = clamp(360 + screenDistance * 0.12, 360, 620);
    const startedAt = performance.now();
    const animate = (time: number) => {
      const progress = clamp((time - startedAt) / duration, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      const nextView = {
        centerX: start.centerX + (boundedTarget.centerX - start.centerX) * eased,
        centerY: start.centerY + (boundedTarget.centerY - start.centerY) * eased,
        zoom: start.zoom + (boundedTarget.zoom - start.zoom) * eased,
      };
      viewRef.current = nextView;
      setView(nextView);
      if (progress < 1) cameraFrameRef.current = window.requestAnimationFrame(animate);
      else cameraFrameRef.current = null;
    };
    cameraFrameRef.current = window.requestAnimationFrame(animate);
  }, [activeProjection, data.bounds, stopCameraAnimation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (onboardingActive && !minimapMode) return;
    const timer = window.setTimeout(() => {
      if (minimapMode) {
        localStorage.setItem(
          `${MINIMAP_ZOOM_KEY_PREFIX}:${data.id}:${MINIMAP_PROJECTION}`,
          String(view.zoom),
        );
        return;
      }
      localStorage.setItem(
        `${MAP_VIEW_KEY_PREFIX}:${data.id}:${activeProjection}`,
        JSON.stringify(view),
      );
    }, 150);
    return () => window.clearTimeout(timer);
  }, [activeProjection, data.id, minimapMode, onboardingActive, view]);

  useEffect(() => {
    if (minimapMode) return;

    if (onboardingActive && !wasOnboardingActiveRef.current) {
      wasOnboardingActiveRef.current = true;
      onboardingPreviousViewRef.current = viewRef.current;
      const liveTarget = getLatestLivePosition() ?? livePosition.position;
      const fallbackTown = data.towns.find(({ id }) => id === "rosewood") ?? data.towns[0];
      const target = liveTarget ?? fallbackTown ?? {
        x: (data.bounds.minX + data.bounds.maxX) / 2,
        y: (data.bounds.minY + data.bounds.maxY) / 2,
      };
      animateToView({
        centerX: target.x,
        centerY: target.y,
        zoom: getMarkerZoomFromNormalized(
          ONBOARDING_ZOOM_PERCENTAGE / 100,
          activeProjection,
        ),
      });
      return;
    }

    if (!onboardingActive && wasOnboardingActiveRef.current) {
      wasOnboardingActiveRef.current = false;
      const previousView = onboardingPreviousViewRef.current;
      onboardingPreviousViewRef.current = null;
      if (!previousView) return;
      stopCameraAnimation();
      viewRef.current = previousView;
      setView(previousView);
    }
  }, [
    activeProjection,
    animateToView,
    data.bounds,
    data.towns,
    livePosition.position,
    minimapMode,
    onboardingActive,
    stopCameraAnimation,
  ]);

  /**
   * The follow camera moves the world with one transform. Its centre comes
   * from the same visual-motion clock as the player marker; neither side owns
   * an independent interpolator anymore.
   */
  const syncWorldOffset = useCallback(() => {
    const world = worldRef.current;
    if (!world) return 0;
    const { width: viewportWidth, height: viewportHeight } = sizeRef.current;
    const camera = viewRef.current;
    const { left, top } = worldToScreen(
      { x: camera.centerX, y: camera.centerY },
      renderedViewRef.current,
      viewportWidth,
      viewportHeight,
      projectionRef.current,
    );
    const offsetX = viewportWidth / 2 - left;
    const offsetY = viewportHeight / 2 - top;
    world.style.transition = "none";
    world.style.transform = offsetX === 0 && offsetY === 0
      ? ""
      : `translate3d(${offsetX}px, ${offsetY}px, 0)`;
    worldOffsetAppliedRef.current = offsetX !== 0 || offsetY !== 0;
    return Math.hypot(offsetX, offsetY);
  }, []);

  useLayoutEffect(() => {
    renderedViewRef.current = view;
    sizeRef.current = size;
    projectionRef.current = activeProjection;
    const world = worldRef.current;
    if (!world) return;

    if (followCommitRef.current) {
      followCommitRef.current = false;
      worldOffsetAppliedRef.current = false;
      world.style.transition = "none";
      world.style.transform = "";
      if (wasFollowingLivePositionRef.current
        && (viewRef.current.centerX !== view.centerX
          || viewRef.current.centerY !== view.centerY)) {
        // The old surface was frozen before React started. The fresh surface
        // now depicts that exact visual centre, so zero transform is the same
        // frame. Resume towards any sample that arrived during the render.
        void world.offsetWidth;
        syncWorldOffset();
      }
      return;
    }

    // A pan or a zoom is the user placing the map: it lands exactly where they
    // put it, with any leftover follow offset discarded before the paint. Only
    // an ACTUAL leftover is worth touching the DOM for — this effect runs on
    // every pan and zoom frame, and the unconditional style-write-plus-forced-
    // reflow it used to do here taxed every frame of plain map browsing for the
    // benefit of none of them.
    if (!worldOffsetAppliedRef.current) return;
    worldOffsetAppliedRef.current = false;
    world.style.transition = "none";
    world.style.transform = "";
  }, [activeProjection, size, syncWorldOffset, view]);

  /** Camera follow driven by the exact visual point used by the marker. */
  useEffect(() => {
    // The minimap starts following (see OverlayMapWindow) but is no longer
    // forced to: its own follow button and a pan both turn the camera loose.
    const shouldFollow = followLivePosition;
    const clearRebaseTimer = () => {
      if (followRebaseTimerRef.current === null) return;
      window.clearTimeout(followRebaseTimerRef.current);
      followRebaseTimerRef.current = null;
    };

    const clearWorldTransform = () => {
      const world = worldRef.current;
      worldOffsetAppliedRef.current = false;
      if (!world) return;
      world.style.transition = "none";
      world.style.transform = "";
    };

    const commitView = (next: MapView) => {
      const rendered = renderedViewRef.current;
      if (next.centerX === rendered.centerX
        && next.centerY === rendered.centerY
        && next.zoom === rendered.zoom) {
        clearWorldTransform();
        return;
      }
      followCommitRef.current = true;
      setView(next);
      recordLiveViewCommit();
    };

    const commitLatestCamera = () => commitView(viewRef.current);

    const freezeAndRebase = (settle: boolean) => {
      followRebaseTimerRef.current = null;
      const world = worldRef.current;
      const rendered = renderedViewRef.current;
      const { width: viewportWidth, height: viewportHeight } = sizeRef.current;
      if (!world || viewportWidth <= 0 || viewportHeight <= 0) {
        commitLatestCamera();
        return;
      }

      // Read the visual transform BEFORE React starts. Locking that exact
      // matrix stops the compositor from advancing while the tile render is in
      // progress; the old implementation read it afterwards, so the reference
      // had already moved and the map briefly jumped backwards.
      const carried = getComputedStyle(world).transform;
      const matrix = carried && carried !== "none"
        ? new DOMMatrixReadOnly(carried)
        : new DOMMatrixReadOnly();
      world.style.transition = "none";
      world.style.transform = carried && carried !== "none" ? carried : "";
      void world.offsetWidth;

      const visualCenter = screenToWorld(
        viewportWidth / 2 - matrix.m41,
        viewportHeight / 2 - matrix.m42,
        rendered,
        viewportWidth,
        viewportHeight,
        projectionRef.current,
      );
      const rebasedView = {
        centerX: clamp(visualCenter.x, data.bounds.minX, data.bounds.maxX),
        centerY: clamp(visualCenter.y, data.bounds.minY, data.bounds.maxY),
        zoom: rendered.zoom,
      };
      if (settle) viewRef.current = rebasedView;
      commitView(rebasedView);
    };

    const resetFollow = () => {
      clearRebaseTimer();
      if (wasFollowingLivePositionRef.current) {
        stopCameraAnimation();
        wasFollowingLivePositionRef.current = false;
        freezeAndRebase(true);
      }
    };
    if (!shouldFollow) {
      resetFollow();
      return;
    }

    let wasDocumentHidden = document.visibilityState === "hidden";
    const follow = (position: { x: number; y: number } | null) => {
      if (!position) {
        resetFollow();
        return;
      }

      const startingFollow = !wasFollowingLivePositionRef.current;
      wasFollowingLivePositionRef.current = true;
      const current = viewRef.current;
      const nextView = {
        centerX: position.x,
        centerY: position.y,
        zoom: startingFollow
          ? minimapMode
            ? Math.max(0.28, current.zoom)
            : getJumpZoom(current.zoom, activeProjection, displayPreferencesRef.current)
          : current.zoom,
      };

      // The desktop map is hidden behind the game. Valheim's stage is cheap;
      // PZ's deep-zoom canvas is not, so a hidden surface only remembers the
      // newest camera and catches up once when it becomes visible.
      if (document.visibilityState === "hidden") {
        wasDocumentHidden = true;
        clearRebaseTimer();
        viewRef.current = nextView;
        return;
      }

      const jumped = Math.hypot(position.x - current.centerX, position.y - current.centerY)
        > FOLLOW_SNAP_WORLD_DISTANCE;
      if (startingFollow || wasDocumentHidden || jumped) {
        wasDocumentHidden = false;
        clearRebaseTimer();
        stopCameraAnimation();
        viewRef.current = nextView;
        commitLatestCamera();
        return;
      }

      viewRef.current = nextView;
      if (syncWorldOffset() < FOLLOW_REBASE_PX) return;
      followRebaseTimerRef.current ??= window.setTimeout(
        () => freezeAndRebase(false),
        0,
      );
    };

    follow(getLatestLiveMotionPosition());
    const unsubscribe = subscribeLiveMotion(follow);
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        wasDocumentHidden = true;
        return;
      }
      follow(getLatestLiveMotionPosition());
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearRebaseTimer();
    };
  }, [activeProjection, data.bounds, followLivePosition, minimapMode, stopCameraAnimation, syncWorldOffset]);

  useEffect(() => {
    displayPreferencesRef.current = displayPreferences;
  }, [displayPreferences]);

  useEffect(() => {
    if (!focusPoint || appliedFocusPointRef.current === focusPoint) return;
    appliedFocusPointRef.current = focusPoint;
    animateToView({
      centerX: focusPoint.x,
      centerY: focusPoint.y,
      zoom: getJumpZoom(viewRef.current.zoom, activeProjection, displayPreferencesRef.current),
    });
  }, [activeProjection, animateToView, focusPoint]);

  useEffect(() => {
    if (!focusRoute
      || focusRoute.points.length === 0
      || size.width === 0
      || size.height === 0
      || appliedFocusRouteRef.current === focusRoute) return;
    appliedFocusRouteRef.current = focusRoute;
    const projected = focusRoute.points.map((point) => worldToScreen(
      point,
      { centerX: 0, centerY: 0, zoom: 1 },
      0,
      0,
      activeProjection,
    ));
    const minimumLeft = Math.min(...projected.map(({ left }) => left));
    const maximumLeft = Math.max(...projected.map(({ left }) => left));
    const minimumTop = Math.min(...projected.map(({ top }) => top));
    const maximumTop = Math.max(...projected.map(({ top }) => top));
    const center = screenToWorld(
      (minimumLeft + maximumLeft) / 2,
      (minimumTop + maximumTop) / 2,
      { centerX: 0, centerY: 0, zoom: 1 },
      0,
      0,
      activeProjection,
    );
    const horizontalFit = Math.max(220, size.width - 160) / Math.max(1, maximumLeft - minimumLeft);
    const verticalFit = Math.max(180, size.height - 160) / Math.max(1, maximumTop - minimumTop);
    const zoomRange = getZoomRange(activeProjection);
    animateToView({
      centerX: center.x,
      centerY: center.y,
      zoom: clamp(Math.min(horizontalFit, verticalFit), zoomRange.minimum, zoomRange.maximum),
    });
  }, [activeProjection, animateToView, focusRoute, size.height, size.width]);

  useEffect(() => stopCameraAnimation, [stopCameraAnimation]);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  /** Reveal a cluster's real members and frame their actual projected bounds. */
  const openCluster = useCallback((cluster: MapPointCluster) => {
    const zoomRange = getZoomRange(activeProjection);
    const currentZoom = viewRef.current.zoom;
    const dispersalZoom = getMarkerZoomFromNormalized(
      getClusterDispersalZoom(cluster.items, displayPreferencesRef.current.clusterMarkers),
      activeProjection,
    );
    const leftValues = cluster.items.map(({ left }) => left);
    const topValues = cluster.items.map(({ top }) => top);
    const minimumLeft = Math.min(...leftValues);
    const maximumLeft = Math.max(...leftValues);
    const minimumTop = Math.min(...topValues);
    const maximumTop = Math.max(...topValues);
    const projectedCenter = {
      left: (minimumLeft + maximumLeft) / 2,
      top: (minimumTop + maximumTop) / 2,
    };
    const center = screenToWorld(
      projectedCenter.left,
      projectedCenter.top,
      { centerX: 0, centerY: 0, zoom: currentZoom },
      0,
      0,
      activeProjection,
    );
    const horizontalFit = (Math.max(220, size.width) - 120) /
      Math.max(1, maximumLeft - minimumLeft);
    const verticalFit = (Math.max(180, size.height) - 120) /
      Math.max(1, maximumTop - minimumTop);
    const fitZoom = currentZoom * Math.min(horizontalFit, verticalFit);
    const targetZoom = Math.max(
      currentZoom * 1.15,
      Math.min(dispersalZoom, fitZoom),
    );

    setExpandedClusterPointIds(cluster.items.map(({ point }) => point.id));
    animateToView({
      centerX: center.x,
      centerY: center.y,
      zoom: clamp(targetZoom, zoomRange.minimum, zoomRange.maximum),
    });
  }, [activeProjection, animateToView, size.height, size.width]);

  useEffect(() => {
    localStorage.setItem(FORAGING_VISIBILITY_KEY, String(foragingVisible));
  }, [foragingVisible]);

  useEffect(() => {
    localStorage.setItem(VEHICLE_SPAWN_VISIBILITY_KEY, String(vehicleSpawnsVisible));
  }, [vehicleSpawnsVisible]);

  useEffect(() => {
    localStorage.setItem(SPAWN_POINT_VISIBILITY_KEY, String(spawnPointsVisible));
  }, [spawnPointsVisible]);

  useEffect(() => {
    if (spawnProfessionId) localStorage.setItem(SPAWN_PROFESSION_KEY, spawnProfessionId);
    else localStorage.removeItem(SPAWN_PROFESSION_KEY);
  }, [spawnProfessionId]);

  const coordinateFromClient = useCallback((clientX: number, clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    // The camera, not the drawn view: between Valheim-style 100 ms commits the
    // stage transform is what puts the layers where the user sees them.
    return screenToWorld(
      clientX - bounds.left,
      clientY - bounds.top,
      viewRef.current,
      bounds.width,
      bounds.height,
      activeProjection,
    );
  }, [activeProjection]);

  const closeSpawnDetail = useCallback(() => setSpawnDetailPoint(null), []);

  // The marker layer is memoised, and a handler that changes identity on every
  // render of the workspace above would defeat that on its own. This keeps the
  // layer's props still while still calling whatever the current handler is.
  const selectPointRef = useRef(onSelectPoint);
  useEffect(() => {
    selectPointRef.current = onSelectPoint;
  }, [onSelectPoint]);
  const selectPoint = useCallback((point: MapPoint | null) => selectPointRef.current(point), []);

  const changeFloor = useCallback((floor: number) => {
    onFloorChange(floor);
    setExpandedClusterPointIds([]);
    if (selectedPoint && !isPointVisibleOnFloor(selectedPoint, floor)) selectPoint(null);
  }, [onFloorChange, selectPoint, selectedPoint]);

  useEffect(() => {
    if (activeFloor !== selectedFloor) onFloorChange(activeFloor);
  }, [activeFloor, onFloorChange, selectedFloor]);

  useEffect(() => {
    if (selectedPoint && !isPointVisibleOnFloor(selectedPoint, activeFloor)) selectPoint(null);
  }, [activeFloor, selectPoint, selectedPoint]);

  // The detail panel describes one pin on the map, so it closes with it: a
  // filter the point does not match would leave the panel talking about
  // something the user can no longer see.
  const selectSpawnProfession = useCallback((professionId: string | null) => {
    setSpawnProfessionId(professionId);
    setSpawnDetailPoint((current) => current && professionId && !current.professions.includes(professionId)
      ? null
      : current);
  }, []);

  const centerOnLivePosition = useCallback(() => {
    // The freshest sample, not the throttled state one: centring on a
    // coordinate up to a second old would visibly miss the player.
    const target = getLatestLivePosition() ?? livePosition.position;
    if (!target) return;
    animateToView({
      centerX: target.x,
      centerY: target.y,
      zoom: getJumpZoom(viewRef.current.zoom, activeProjection, displayPreferencesRef.current),
    });
  }, [activeProjection, animateToView, livePosition.position]);

  const changeZoom = useCallback((multiplier: number) => {
    stopCameraAnimation();
    const zoomRange = getZoomRange(activeProjection);
    const current = viewRef.current;
    const nextView = {
      ...current,
      zoom: clamp(current.zoom * multiplier, zoomRange.minimum, zoomRange.maximum),
    };
    viewRef.current = nextView;
    setView(nextView);
  }, [activeProjection, stopCameraAnimation]);

  const handleWheel = useCallback((event: WheelEvent) => {
    // A panel floating over the map scrolls its own lists. The wheel belongs to
    // whatever is under the cursor, so the camera only takes it over the map.
    if ((event.target as HTMLElement | null)?.closest?.("[data-map-ui]")) return;
    event.preventDefault();
    stopCameraAnimation();
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const zoomRange = getZoomRange(activeProjection);
    const multiplier = activeProjection === "isometric"
      ? (event.deltaY > 0 ? 0.72 : 1.38)
      : (event.deltaY > 0 ? 0.82 : 1.22);
    const currentView = viewRef.current;
    const nextZoom = clamp(currentView.zoom * multiplier, zoomRange.minimum, zoomRange.maximum);
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const worldAtPointer = screenToWorld(pointerX, pointerY, currentView, bounds.width, bounds.height, activeProjection);
    const offsetAtNextZoom = screenToWorld(
      pointerX,
      pointerY,
      { centerX: 0, centerY: 0, zoom: nextZoom },
      bounds.width,
      bounds.height,
      activeProjection,
    );
    const nextView = {
      centerX: clamp(worldAtPointer.x - offsetAtNextZoom.x, data.bounds.minX, data.bounds.maxX),
      centerY: clamp(worldAtPointer.y - offsetAtNextZoom.y, data.bounds.minY, data.bounds.maxY),
      zoom: nextZoom,
    };
    viewRef.current = nextView;
    setView(nextView);
  }, [activeProjection, data.bounds, stopCameraAnimation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // The base map is drawn past the viewport on every side so the follow
  // camera's transform can never slide an undrawn edge into view. Only while
  // the camera actually follows, though: for plain browsing the overscan is
  // pure tax — half as many pixels again for the tile layers to fill on every
  // pan and zoom, for an edge no transform is ever going to reveal.
  const cameraOverscan = followLivePosition ? FOLLOW_OVERSCAN_PX : 0;
  const overscanWidth = size.width > 0 ? size.width + cameraOverscan * 2 : 0;
  const overscanHeight = size.height > 0 ? size.height + cameraOverscan * 2 : 0;
  const vehicleSpawnData = vehicleSpawnsVisible ? data.vehicleSpawns ?? null : null;
  const spawnPointData = spawnPointsVisible ? data.spawnPoints ?? null : null;
  const hoverActive = Boolean(cursorScreen) && !panning;
  // A grab radius in world units that is worth a fixed number of screen pixels,
  // so hovering works the same at every zoom instead of only when close in.
  const hoverTolerance = HOVER_GRAB_PIXELS * getWorldUnitsPerPixel(view.zoom, activeProjection);
  // Hover is resolved once here, then shared by the overlay highlight, the
  // cursor tooltip and the click that opens a point, so they can never disagree.
  const hoveredVehicleSpawn = useMemo(
    () => vehicleSpawnData && hoverActive
      ? findVehicleSpawnAtCoordinate(vehicleSpawnData, cursorCoordinate, hoverTolerance)
      : null,
    [cursorCoordinate, hoverActive, hoverTolerance, vehicleSpawnData],
  );
  const hoveredSpawnPoint = useMemo(
    () => spawnPointData && hoverActive
      ? findSpawnPointAtCoordinate(spawnPointData, cursorCoordinate, spawnProfessionId, hoverTolerance)
      : null,
    [cursorCoordinate, hoverActive, hoverTolerance, spawnPointData, spawnProfessionId],
  );
  // Only one overlay answers a hover. A point wins over a zone: it is a single
  // spot, and a vehicle zone is an area that can easily contain one.
  const activeVehicleSpawn = hoveredSpawnPoint ? null : hoveredVehicleSpawn;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const markerControl = target.closest("[data-map-marker-control]");
    if (!markerControl && target.closest("button, input, textarea, [data-map-ui]")) return;
    stopCameraAnimation();
    if (!markerControl) event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      stoppedFollow: false,
    };
  };

  /**
   * Pointer events outrun painted frames — gaming mice report at 250-1000 Hz —
   * and every one of them used to commit React state, so a drag rendered the
   * entire map several times per frame the screen could actually show: renders
   * with no frame to land in, felt as drag jank. Moves now only ACCUMULATE
   * here; one animation frame flushes the total.
   */
  const flushPointerMove = useCallback(() => {
    pointerFrameRef.current = null;
    const pending = pendingPointerRef.current;
    if (!pending) return;
    pendingPointerRef.current = null;
    setCursorCoordinate(coordinateFromClient(pending.clientX, pending.clientY));
    const viewportBounds = containerRef.current?.getBoundingClientRect();
    if (viewportBounds) {
      setCursorScreen({
        left: pending.clientX - viewportBounds.left,
        top: pending.clientY - viewportBounds.top,
      });
    }
    if (pending.deltaX === 0 && pending.deltaY === 0) return;
    const current = viewRef.current;
    const worldDelta = screenToWorld(
      size.width / 2 + pending.deltaX,
      size.height / 2 + pending.deltaY,
      { centerX: 0, centerY: 0, zoom: current.zoom },
      size.width,
      size.height,
      activeProjection,
    );
    const nextView = {
      ...current,
      centerX: clamp(current.centerX - worldDelta.x, data.bounds.minX, data.bounds.maxX),
      centerY: clamp(current.centerY - worldDelta.y, data.bounds.minY, data.bounds.maxY),
    };
    viewRef.current = nextView;
    setView(nextView);
  }, [activeProjection, coordinateFromClient, data.bounds, size]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const dragging = Boolean(drag && drag.pointerId === event.pointerId);
    let deltaX = 0;
    let deltaY = 0;
    if (drag && dragging) {
      deltaX = event.clientX - drag.x;
      deltaY = event.clientY - drag.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 2) drag.moved = true;
      if (drag.moved && !panning) setPanning(true);
      // Panning the map is a deliberate look-away, so follow mode turns itself
      // off rather than snapping the camera back on the next bridge sample.
      // Once per drag: the prop only flips on the next render.
      if (drag.moved && !drag.stoppedFollow && followLivePosition) {
        drag.stoppedFollow = true;
        onToggleFollowLivePosition?.();
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.moved) {
        deltaX = 0;
        deltaY = 0;
      }
    }
    const pending = pendingPointerRef.current;
    pendingPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      deltaX: (pending?.deltaX ?? 0) + deltaX,
      deltaY: (pending?.deltaY ?? 0) + deltaY,
    };
    pointerFrameRef.current ??= window.requestAnimationFrame(flushPointerMove);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Whatever the frame has not flushed yet lands now, so the map cannot lose
    // the tail of a fast drag.
    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
      flushPointerMove();
    }
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    if (!drag) return;
    if (drag.moved) {
      if ((event.target as HTMLElement).closest("[data-map-marker-control]")) {
        suppressMarkerClickRef.current = true;
        window.setTimeout(() => { suppressMarkerClickRef.current = false; }, 0);
      }
      return;
    }
    if ((event.target as HTMLElement).closest("[data-map-marker-control]")) return;
    if (onPickLootStart) onPickLootStart(coordinateFromClient(event.clientX, event.clientY));
    else if (placementMode) onPlaceMarker(coordinateFromClient(event.clientX, event.clientY), activeFloor);
    else if (routeMode) onAddRoutePoint(coordinateFromClient(event.clientX, event.clientY));
    // A spawn point under the cursor opens its panel: the cursor card follows
    // the pointer, so the full profession list has nowhere else to live.
    else if (hoveredSpawnPoint) setSpawnDetailPoint(hoveredSpawnPoint);
    else onSelectPoint(null);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "map-viewport",
        controlsIntroVisible && "map-controls-intro-visible",
        (placementMode || routeMode || onPickLootStart) && "cursor-crosshair",
      )}
      role="application"
      aria-label={data.displayName}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClickCapture={(event) => {
        if (!suppressMarkerClickRef.current) return;
        if (!(event.target as HTMLElement).closest("[data-map-marker-control]")) return;
        event.preventDefault();
        event.stopPropagation();
        suppressMarkerClickRef.current = false;
      }}
      onPointerCancel={() => { dragRef.current = null; setPanning(false); }}
      onPointerLeave={() => setCursorScreen(null)}
      onKeyDown={(event) => {
        if (event.key === "+" || event.key === "=") changeZoom(1.25);
        if (event.key === "-") changeZoom(0.8);
      }}
    >
      {/* Everything with a world coordinate lives here. The live marker moves
          to the shared visual coordinate while this parent moves the camera to
          that same coordinate, so their transforms cancel exactly in follow. */}
      <div
        ref={worldRef}
        className="absolute inset-0"
      >
        <div className="absolute" style={{ inset: `${-cameraOverscan}px` }}>
          {activeProjection === "isometric" ? (
            activeIsometricSource ? (
              <MapDeepZoomLayer
                source={activeIsometricSource}
                overlays={activeIsometricOverlays}
                loadingLabel={isometricBaseSource || isometricOverlays.length > 0
                  ? t("map.data.loadingMods")
                  : t("map.data.loadingMap", { name: data.displayName })}
                floor={activeFloor}
                view={view}
                width={overscanWidth}
                height={overscanHeight}
                onSourceError={isometricBaseSource ? undefined : reportIsometricSourceFailure}
              />
            ) : (
              <div className="pointer-events-none absolute inset-0 bg-map-surface" aria-hidden="true" />
            )
          ) : (
            <MapTileLayer data={data} view={view} width={overscanWidth} height={overscanHeight} />
          )}
        </div>
        {!minimapMode && foragingVisible && data.foraging && (
          <MapForagingLayer
            data={data.foraging}
            view={view}
            width={size.width}
            height={size.height}
            projection={activeProjection}
          />
        )}
        {!minimapMode && vehicleSpawnData && (
          <MapVehicleSpawnLayer
            data={vehicleSpawnData}
            view={view}
            width={size.width}
            height={size.height}
            projection={activeProjection}
            highlightZone={activeVehicleSpawn?.zone ?? null}
          />
        )}
        {!minimapMode && spawnPointData && (
          <MapSpawnPointLayer
            data={spawnPointData}
            professionId={spawnProfessionId}
            view={view}
            width={size.width}
            height={size.height}
            projection={activeProjection}
            highlightId={hoveredSpawnPoint?.id ?? null}
          />
        )}
        <MapMarkerLayer
          data={data}
          points={floorPoints}
          view={view}
          width={size.width}
          height={size.height}
          projection={activeProjection}
          selectedId={selectedPoint?.id ?? null}
          clusterMarkers={displayPreferences.clusterMarkers}
          expandedClusterPointIds={expandedClusterPointIds}
          growMarkersWithZoom={activeFloor >= 0}
          markerSizePercent={displayPreferences.markerSizePercent}
          showTownLabels
          onMove={placementMode || routeMode || onPickLootStart ? undefined : (point, x, y) => onMoveMarker(point, coordinateFromClient(x, y))}
          onSelect={selectPoint}
          onCluster={openCluster}
        />
        <MapRoutesLayer
          data={data}
          routes={routes.filter((route) => visibleRouteIds.includes(route.id))}
          draftPoints={draftRoutePoints}
          view={view}
          width={size.width}
          height={size.height}
          projection={activeProjection}
          active={routeMode}
          hideCard={placementMode}
          onUndo={onUndoRoutePoint}
          onCancel={onCancelRoute}
          onSave={onSaveRoute}
        />
        {isPointVisibleOnFloor(
          { floors: [Math.round(livePosition.position?.z ?? 0)] },
          activeFloor,
        ) && (
          <LivePlayerMarker
            status={livePosition.status}
            view={view}
            width={size.width}
            height={size.height}
            projection={activeProjection}
          />
        )}
      </div>
      <div className="map-vignette" aria-hidden="true" />
      {/* The minimap has no toolbar, but the two live-position controls earn
          their pixels there: without them a pan is a one-way trip. */}
      {minimapMode && livePosition.position && (
        <MapLiveControls
          compact
          className="overlay-minimap-controls"
          followingLivePosition={followLivePosition}
          onCenterLivePosition={centerOnLivePosition}
          onToggleFollowLivePosition={onToggleFollowLivePosition}
        />
      )}
      {minimapMode && (
        <OverlayMinimapZoomControls
          zoom={view.zoom}
          minimum={getZoomRange(activeProjection).minimum}
          maximum={getZoomRange(activeProjection).maximum}
          projection={activeProjection}
          onZoomIn={() => changeZoom(1.25)}
          onZoomOut={() => changeZoom(0.8)}
        />
      )}
      {minimapMode && keyboardMovementEnabled && <OverlayKeyboardMoveHint />}
      {!minimapMode && <MapToolbar
        placementMode={placementMode}
        onTogglePlacement={onTogglePlacement}
        livePositionAvailable={Boolean(livePosition.position)}
        followingLivePosition={followLivePosition}
        onToggleFollowLivePosition={onToggleFollowLivePosition}
        onCenterLivePosition={centerOnLivePosition}
      />}
      {!minimapMode && spawnDetailPoint && spawnPointData && spawnDetailScreen && (
        <MapSpawnPointPanel
          point={spawnDetailPoint}
          data={spawnPointData}
          left={spawnDetailScreen.left}
          top={spawnDetailScreen.top}
          width={size.width}
          height={size.height}
          professionId={spawnProfessionId}
          onProfessionChange={selectSpawnProfession}
          onClose={closeSpawnDetail}
        />
      )}
      {!minimapMode && hoveredSpawnPoint && spawnPointData && cursorScreen && (
        <MapSpawnPointTooltip
          point={hoveredSpawnPoint}
          data={spawnPointData}
          left={cursorScreen.left}
          top={cursorScreen.top}
          width={size.width}
          height={size.height}
        />
      )}
      {!minimapMode && activeVehicleSpawn && cursorScreen && (
        <MapVehicleSpawnTooltip
          definition={activeVehicleSpawn.definition}
          left={cursorScreen.left}
          top={cursorScreen.top}
          width={size.width}
          height={size.height}
        />
      )}
      {!minimapMode && placementMode && <div className="map-placement-hint">{t("map.placementHint")}</div>}
      {!minimapMode && (
        <MapPerformanceWarning
          markerCount={floorPoints.length}
          zoom={view.zoom}
          projection={activeProjection}
        />
      )}
      {activeProjection === "isometric" && availableFloors.length > 1 && (
        <MapFloorControls
          activeFloor={activeFloor}
          floors={availableFloors}
          onFloorChange={changeFloor}
          compact={minimapMode}
        />
      )}
      {!minimapMode && (
        <MapBottomControls
          coordinate={cursorCoordinate}
          zoom={view.zoom}
          projection={activeProjection}
          onZoomIn={() => changeZoom(activeProjection === "isometric" ? 1.6 : 1.25)}
          onZoomOut={() => changeZoom(activeProjection === "isometric" ? 0.625 : 0.8)}
        />
      )}
    </div>
  );
};

export default InteractiveMap;
