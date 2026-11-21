import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import LivePlayerMarker from "../live-position/live-player-marker";
import { getLatestLivePosition } from "../live-position/live-position-store";
import {
  getLatestLiveMotionPosition,
  subscribeLiveMotion,
} from "../live-position/live-motion";
import type { LivePositionState } from "../live-position/live-position-types";
import { useOnboardingActive } from "../onboarding/use-onboarding";
import MapBottomControls from "./map-bottom-controls";
import { getClusterDispersalZoom, type MapPointCluster } from "./map-clustering";
import type { MapDisplayPreferences } from "./map-display-preferences";
import MapLiveControls from "./map-live-controls";
import MapMarkerLayer from "./map-marker-layer";
import { getMarkerZoomFromNormalized } from "./map-marker-zoom";
import MapPerformanceWarning from "./map-performance-warning";
import { screenToWorld, worldToScreen, type MapProjectionMode } from "./map-projection";
import MapTileLayer from "./map-tile-layer";
import MapToolbar from "./map-toolbar";
import OverlayMinimapZoomControls from "./overlay-minimap-zoom-controls";
import type { MapWindowCommand } from "./map-window-command";
import type { MapCoordinate, MapMetadata, MapPoint, MapView } from "./types";
import { useMapDisplayPreferences } from "./use-map-display-preferences";

/**
 * Tuning knobs. Zoom is "screen pixels per world unit", so 1 draws level-0
 * tiles at native size; the marker tiers (overview / regional / detail) live
 * in map-marker-zoom.ts and are expressed in the same unit.
 */
const PROJECTION: MapProjectionMode = "top";
const ZOOM_RANGE = { minimum: 0.02, maximum: 1.6 };
/** The default close-up a jump-to (marker pick, centre-on-player) zooms to. */
const SELECTION_ZOOM_FLOOR = 0.48;
/** The zoom the guided tour frames the map at while it runs. */
const ONBOARDING_ZOOM = 0.18;
const MINIMAP_DEFAULT_ZOOM = 0.18;
const MAP_VIEW_KEY_PREFIX = "gm:map-view";
const MINIMAP_ZOOM_KEY_PREFIX = "gm:minimap-zoom";
/** The follow camera glides this far on a transform before the layers re-render. */
const FOLLOW_REBASE_PX = 96;
const FOLLOW_OVERSCAN_PX = 128;
/** Keep the drag on the compositor and only rebuild map layers near their guard-band edge. */
const PAN_REBASE_PX = 120;
/** A step no walk explains — the camera snaps instead of gliding. */
const FOLLOW_SNAP_WORLD_DISTANCE = 96;
/** Match ER's space between an open detail panel and its selected marker. */
const SELECTION_PANEL_GAP_PX = 72;
const CAMERA_ZOOM_DURATION_MS = 250;
const WHEEL_TARGET_IDLE_MS = 180;

interface InteractiveMapProps {
  data: MapMetadata;
  points: MapPoint[];
  selectedPoint: MapPoint | null;
  focusPoint: MapPoint | null;
  placementMode: boolean;
  livePosition: LivePositionState;
  followLivePosition?: boolean;
  onToggleFollowLivePosition?: () => void;
  controlsIntroVisible?: boolean;
  minimapMode?: boolean;
  zoomCommand?: MapWindowCommand | null;
  onSelectPoint: (point: MapPoint | null) => void;
  onPlaceMarker: (coordinate: MapCoordinate) => void;
  onTogglePlacement: () => void;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Zoom to use when the camera jumps to a point. Only ever a floor: a view
 * already closer than the target keeps its zoom, so a jump never zooms *out*.
 * Settings › Map can turn the zoom off entirely, or push the floor closer.
 */
const getJumpZoom = (currentZoom: number, preferences: MapDisplayPreferences) => {
  if (!preferences.selectionZoomEnabled) return currentZoom;
  const floor = SELECTION_ZOOM_FLOOR * (preferences.selectionZoomPercent / 100);
  return Math.max(currentZoom, Math.min(floor, ZOOM_RANGE.maximum));
};

/** The whole map, centred, at a zoom that fits it into roughly 900px. */
const getDefaultView = (data: MapMetadata): MapView => ({
  centerX: (data.bounds.minX + data.bounds.maxX) / 2,
  centerY: (data.bounds.minY + data.bounds.maxY) / 2,
  zoom: clamp(
    900 / Math.max(data.bounds.maxX - data.bounds.minX, data.bounds.maxY - data.bounds.minY),
    ZOOM_RANGE.minimum,
    0.25,
  ),
});

const readView = (data: MapMetadata): MapView => {
  const fallback = getDefaultView(data);
  try {
    const value = localStorage.getItem(`${MAP_VIEW_KEY_PREFIX}:${data.id}`);
    if (!value) return fallback;
    const parsed = JSON.parse(value) as Partial<MapView>;
    if (!Number.isFinite(parsed.centerX) || !Number.isFinite(parsed.centerY) || !Number.isFinite(parsed.zoom)) return fallback;
    return {
      centerX: clamp(parsed.centerX!, data.bounds.minX, data.bounds.maxX),
      centerY: clamp(parsed.centerY!, data.bounds.minY, data.bounds.maxY),
      zoom: clamp(parsed.zoom!, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum),
    };
  } catch {
    return fallback;
  }
};

const readMinimapZoom = (mapId: string) => {
  try {
    const storedZoom = Number(localStorage.getItem(`${MINIMAP_ZOOM_KEY_PREFIX}:${mapId}`));
    return Number.isFinite(storedZoom) && storedZoom > 0
      ? clamp(storedZoom, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum)
      : MINIMAP_DEFAULT_ZOOM;
  } catch {
    return MINIMAP_DEFAULT_ZOOM;
  }
};

/**
 * The map surface: tiles, markers and the player, with pan/zoom, a camera that
 * can follow the live position, and the floating controls. Owns the view;
 * everything about WHAT is drawn comes in through props from the workspace.
 */
const InteractiveMap = ({
  data,
  points,
  selectedPoint,
  focusPoint,
  placementMode,
  livePosition,
  followLivePosition = false,
  onToggleFollowLivePosition,
  controlsIntroVisible = false,
  minimapMode = false,
  zoomCommand,
  onSelectPoint,
  onPlaceMarker,
  onTogglePlacement,
}: InteractiveMapProps) => {
  const { t } = useTranslation();
  const onboardingActive = useOnboardingActive();
  const { preferences: displayPreferences } = useMapDisplayPreferences();
  // Read through a ref where the camera jumps: a preference change must never
  // re-run a focus effect and yank the map back to a stale focus point.
  const displayPreferencesRef = useRef(displayPreferences);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<
    {
      pointerId: number;
      startX: number;
      startY: number;
      x: number;
      y: number;
      moved: boolean;
      stoppedFollow: boolean;
      markerControl: HTMLButtonElement | null;
    } | null
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
  const dispatchingMarkerClickRef = useRef(false);
  const cameraFrameRef = useRef<number | null>(null);
  const wheelTargetRef = useRef<MapView | null>(null);
  const wheelTargetTimerRef = useRef<number | null>(null);
  const wasFollowingLivePositionRef = useRef(false);
  const appliedFocusPointRef = useRef<MapPoint | null>(null);
  const onboardingPreviousViewRef = useRef<MapView | null>(null);
  const wasOnboardingActiveRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Overwolf recreates the overlay window on each show. Restore only the scale
  // the player chose; the live-position camera owns the centre.
  const [view, setView] = useState<MapView>(() => minimapMode
    ? { ...getDefaultView(data), zoom: readMinimapZoom(data.id) }
    : readView(data));
  const viewRef = useRef(view);
  /** What the layers are currently drawn with. The imperative stage runs
   * ahead until it reaches the edge of the tile guard band. */
  const renderedViewRef = useRef(view);
  const worldRef = useRef<HTMLDivElement>(null);
  const worldOffsetAppliedRef = useRef(false);
  const worldCommitRef = useRef(false);
  const followRebaseTimerRef = useRef<number | null>(null);
  const sizeRef = useRef(size);
  const [cursorCoordinate, setCursorCoordinate] = useState<MapCoordinate>({ x: 0, y: 0 });
  const [expandedClusterPointIds, setExpandedClusterPointIds] = useState<string[]>([]);
  const [panning, setPanning] = useState(false);

  const stopCameraAnimation = useCallback(() => {
    if (cameraFrameRef.current === null) return;
    window.cancelAnimationFrame(cameraFrameRef.current);
    cameraFrameRef.current = null;
  }, []);

  const animateToView = useCallback((target: MapView, preferredDuration?: number) => {
    stopCameraAnimation();
    const boundedTarget = {
      centerX: clamp(target.centerX, data.bounds.minX, data.bounds.maxX),
      centerY: clamp(target.centerY, data.bounds.minY, data.bounds.maxY),
      zoom: clamp(target.zoom, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum),
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
    const duration = preferredDuration ?? clamp(360 + screenDistance * 0.12, 360, 620);
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
  }, [data.bounds, stopCameraAnimation]);

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

  // Persist the view (or just the minimap's zoom) after the camera settles.
  useEffect(() => {
    if (onboardingActive && !minimapMode) return;
    const timer = window.setTimeout(() => {
      if (minimapMode) {
        localStorage.setItem(`${MINIMAP_ZOOM_KEY_PREFIX}:${data.id}`, String(view.zoom));
        return;
      }
      localStorage.setItem(`${MAP_VIEW_KEY_PREFIX}:${data.id}`, JSON.stringify(view));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [data.id, minimapMode, onboardingActive, view]);

  // The guided tour frames something worth looking at (the player, else the
  // first region, else the middle), then hands the previous view back.
  useEffect(() => {
    if (minimapMode) return;

    if (onboardingActive && !wasOnboardingActiveRef.current) {
      wasOnboardingActiveRef.current = true;
      onboardingPreviousViewRef.current = viewRef.current;
      const liveTarget = getLatestLivePosition() ?? livePosition.position;
      const target = liveTarget ?? data.regions[0] ?? {
        x: (data.bounds.minX + data.bounds.maxX) / 2,
        y: (data.bounds.minY + data.bounds.maxY) / 2,
      };
      animateToView({
        centerX: target.x,
        centerY: target.y,
        zoom: getMarkerZoomFromNormalized(ONBOARDING_ZOOM, PROJECTION),
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
    animateToView,
    data.bounds,
    data.regions,
    livePosition.position,
    minimapMode,
    onboardingActive,
    stopCameraAnimation,
  ]);

  /**
   * The follow camera moves the world with one transform. Its centre comes
   * from the same visual-motion clock as the player marker; neither side owns
   * an independent interpolator.
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
      PROJECTION,
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
    const world = worldRef.current;
    if (!world) return;

    if (worldCommitRef.current) {
      worldCommitRef.current = false;
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
    // put it, with any leftover follow offset discarded before the paint.
    if (!worldOffsetAppliedRef.current) return;
    worldOffsetAppliedRef.current = false;
    world.style.transition = "none";
    world.style.transform = "";
  }, [size, syncWorldOffset, view]);

  /** Camera follow driven by the exact visual point used by the marker. */
  useEffect(() => {
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
      worldCommitRef.current = true;
      setView(next);
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
      // matrix stops the compositor from advancing while the render is in
      // progress, so the map can't briefly jump backwards.
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
        PROJECTION,
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
            : getJumpZoom(current.zoom, displayPreferencesRef.current)
          : current.zoom,
      };

      // A hidden surface only remembers the newest camera and catches up once
      // when it becomes visible.
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
  }, [data.bounds, followLivePosition, minimapMode, stopCameraAnimation, syncWorldOffset]);

  useEffect(() => {
    displayPreferencesRef.current = displayPreferences;
  }, [displayPreferences]);

  useEffect(() => {
    if (!focusPoint || appliedFocusPointRef.current === focusPoint || size.width <= 0 || size.height <= 0) return;
    appliedFocusPointRef.current = focusPoint;
    const zoom = getJumpZoom(viewRef.current.zoom, displayPreferencesRef.current);
    const mapRect = containerRef.current?.getBoundingClientRect();
    const panel = containerRef.current?.parentElement?.parentElement
      ?.querySelector<HTMLElement>("[data-map-selection-panel]");
    const desiredX = panel && mapRect && panel.getClientRects().length > 0
      ? clamp(panel.getBoundingClientRect().right - mapRect.left + SELECTION_PANEL_GAP_PX, 80, size.width - 80)
      : size.width / 2;
    const offset = screenToWorld(desiredX, size.height / 2,
      { centerX: 0, centerY: 0, zoom }, size.width, size.height, PROJECTION);
    animateToView({
      centerX: focusPoint.x - offset.x,
      centerY: focusPoint.y - offset.y,
      zoom,
    });
  }, [animateToView, focusPoint, size.width, size.height]);

  useEffect(() => stopCameraAnimation, [stopCameraAnimation]);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
    if (wheelTargetTimerRef.current !== null) window.clearTimeout(wheelTargetTimerRef.current);
  }, []);

  /** Reveal a cluster's real members and frame their actual projected bounds. */
  const openCluster = useCallback((cluster: MapPointCluster) => {
    const currentZoom = viewRef.current.zoom;
    const dispersalZoom = getMarkerZoomFromNormalized(
      getClusterDispersalZoom(cluster.items, displayPreferencesRef.current.clusterMarkers),
      PROJECTION,
    );
    const leftValues = cluster.items.map(({ left }) => left);
    const topValues = cluster.items.map(({ top }) => top);
    const minimumLeft = Math.min(...leftValues);
    const maximumLeft = Math.max(...leftValues);
    const minimumTop = Math.min(...topValues);
    const maximumTop = Math.max(...topValues);
    const center = screenToWorld(
      (minimumLeft + maximumLeft) / 2,
      (minimumTop + maximumTop) / 2,
      { centerX: 0, centerY: 0, zoom: currentZoom },
      0,
      0,
      PROJECTION,
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
      zoom: clamp(targetZoom, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum),
    });
  }, [animateToView, size.height, size.width]);

  const coordinateFromClient = useCallback((clientX: number, clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    // The camera, not the drawn view: between follow commits the stage
    // transform is what puts the layers where the user sees them.
    return screenToWorld(
      clientX - bounds.left,
      clientY - bounds.top,
      viewRef.current,
      bounds.width,
      bounds.height,
      PROJECTION,
    );
  }, []);

  // The marker layer is memoised, and a handler that changes identity on every
  // render of the workspace above would defeat that on its own.
  const selectPointRef = useRef(onSelectPoint);
  useEffect(() => {
    selectPointRef.current = onSelectPoint;
  }, [onSelectPoint]);
  const selectPoint = useCallback((point: MapPoint | null) => selectPointRef.current(point), []);

  const centerOnLivePosition = useCallback(() => {
    // The freshest sample, not the throttled state one: centring on a
    // coordinate up to a second old would visibly miss the player.
    const target = getLatestLivePosition() ?? livePosition.position;
    if (!target) return;
    animateToView({
      centerX: target.x,
      centerY: target.y,
      zoom: getJumpZoom(viewRef.current.zoom, displayPreferencesRef.current),
    });
  }, [animateToView, livePosition.position]);

  const changeZoom = useCallback((multiplier: number) => {
    const current = viewRef.current;
    const nextView = {
      ...current,
      zoom: clamp(current.zoom * multiplier, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum),
    };
    animateToView(nextView, CAMERA_ZOOM_DURATION_MS);
  }, [animateToView]);

  const handledZoomCommand = useRef(0);
  useEffect(() => {
    if (!minimapMode || !zoomCommand || handledZoomCommand.current === zoomCommand.revision) return;
    handledZoomCommand.current = zoomCommand.revision;
    if (zoomCommand.type === "zoom") changeZoom(zoomCommand.direction === "in" ? 1.25 : 0.8);
  }, [changeZoom, minimapMode, zoomCommand]);

  const handleWheel = useCallback((event: WheelEvent) => {
    // A panel floating over the map scrolls its own lists. The wheel belongs to
    // whatever is under the cursor, so the camera only takes it over the map.
    if ((event.target as HTMLElement | null)?.closest?.("[data-map-ui]")) return;
    event.preventDefault();
    stopCameraAnimation();
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const normalisedDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaY * bounds.height
        : event.deltaY;
    // Continuous exponential scaling makes mouse wheels and precision
    // trackpads share the same feel instead of turning every event into a jump.
    const multiplier = Math.exp(-clamp(normalisedDelta, -160, 160) * 0.002);
    const currentView = viewRef.current;
    const targetView = wheelTargetRef.current ?? currentView;
    const nextZoom = clamp(targetView.zoom * multiplier, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum);
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const worldAtPointer = screenToWorld(pointerX, pointerY, currentView, bounds.width, bounds.height, PROJECTION);
    const offsetAtNextZoom = screenToWorld(
      pointerX,
      pointerY,
      { centerX: 0, centerY: 0, zoom: nextZoom },
      bounds.width,
      bounds.height,
      PROJECTION,
    );
    const nextView: MapView = {
      centerX: clamp(worldAtPointer.x - offsetAtNextZoom.x, data.bounds.minX, data.bounds.maxX),
      centerY: clamp(worldAtPointer.y - offsetAtNextZoom.y, data.bounds.minY, data.bounds.maxY),
      zoom: nextZoom,
    };
    wheelTargetRef.current = nextView;
    if (wheelTargetTimerRef.current !== null) window.clearTimeout(wheelTargetTimerRef.current);
    wheelTargetTimerRef.current = window.setTimeout(() => {
      wheelTargetRef.current = null;
      wheelTargetTimerRef.current = null;
    }, WHEEL_TARGET_IDLE_MS);
    animateToView(nextView, CAMERA_ZOOM_DURATION_MS);
  }, [animateToView, data.bounds, stopCameraAnimation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // The base map is drawn past the viewport on every side so the follow
  // camera's transform can never slide an undrawn edge into view. Only while
  // the camera actually follows, though: for plain browsing the overscan is
  // pure tax.
  const cameraOverscan = followLivePosition ? FOLLOW_OVERSCAN_PX : 0;
  const overscanWidth = size.width > 0 ? size.width + cameraOverscan * 2 : 0;
  const overscanHeight = size.height > 0 ? size.height + cameraOverscan * 2 : 0;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const markerControl = target.closest<HTMLButtonElement>("[data-map-marker-control]");
    if (!markerControl && target.closest("button, input, textarea, [data-map-ui]")) return;
    stopCameraAnimation();
    wheelTargetRef.current = null;
    // Capture on the viewport immediately, including when the gesture starts
    // on a marker. Otherwise the marker button remains the pointer owner and
    // some Chromium/Overwolf builds stop delivering the drag to the map.
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressMarkerClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      stoppedFollow: false,
      markerControl,
    };
  };

  /**
   * Pointer events outrun painted frames — gaming mice report at 250-1000 Hz —
   * so moves only ACCUMULATE here; one animation frame flushes the total.
   */
  const flushPointerMove = useCallback(() => {
    pointerFrameRef.current = null;
    const pending = pendingPointerRef.current;
    if (!pending) return;
    pendingPointerRef.current = null;
    setCursorCoordinate(coordinateFromClient(pending.clientX, pending.clientY));
    if (pending.deltaX === 0 && pending.deltaY === 0) return;
    const current = viewRef.current;
    const worldDelta = screenToWorld(
      size.width / 2 + pending.deltaX,
      size.height / 2 + pending.deltaY,
      { centerX: 0, centerY: 0, zoom: current.zoom },
      size.width,
      size.height,
      PROJECTION,
    );
    const nextView = {
      ...current,
      centerX: clamp(current.centerX - worldDelta.x, data.bounds.minX, data.bounds.maxX),
      centerY: clamp(current.centerY - worldDelta.y, data.bounds.minY, data.bounds.maxY),
    };
    viewRef.current = nextView;
    // Moving the whole stage is constant work regardless of marker count. A
    // React render is only needed when the transform approaches the culling
    // guard band, rather than for every pointer frame.
    if (syncWorldOffset() >= PAN_REBASE_PX) {
      worldCommitRef.current = true;
      setView(nextView);
    }
  }, [coordinateFromClient, data.bounds, size, syncWorldOffset]);

  const commitPointerView = useCallback(() => {
    const current = viewRef.current;
    const rendered = renderedViewRef.current;
    if (current.centerX === rendered.centerX
      && current.centerY === rendered.centerY
      && current.zoom === rendered.zoom) return;
    worldCommitRef.current = true;
    setView(current);
  }, []);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const dragging = Boolean(drag && drag.pointerId === event.pointerId);
    let deltaX = 0;
    let deltaY = 0;
    if (drag && dragging) {
      deltaX = event.clientX - drag.x;
      deltaY = event.clientY - drag.y;
      if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 2) {
        drag.moved = true;
      }
      if (drag.moved && !panning) setPanning(true);
      // Panning the map is a deliberate look-away, so follow mode turns itself
      // off rather than snapping the camera back on the next sample.
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
    commitPointerView();
    if (!drag) return;
    if (drag.moved) {
      if (drag.markerControl) {
        suppressMarkerClickRef.current = true;
        window.setTimeout(() => { suppressMarkerClickRef.current = false; }, 0);
      }
      return;
    }
    if (drag.markerControl) {
      // Pointer capture makes the viewport the native click target. Replay the
      // marker activation for a stationary gesture so click and keyboard
      // behaviour stay unchanged, then reject Chromium's compatibility click.
      suppressMarkerClickRef.current = true;
      dispatchingMarkerClickRef.current = true;
      try {
        drag.markerControl.click();
      } finally {
        dispatchingMarkerClickRef.current = false;
      }
      window.setTimeout(() => { suppressMarkerClickRef.current = false; }, 0);
      return;
    }
    if (placementMode) onPlaceMarker(coordinateFromClient(event.clientX, event.clientY));
    else onSelectPoint(null);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "map-viewport",
        panning && "map-panning",
        controlsIntroVisible && "map-controls-intro-visible",
        placementMode && "cursor-crosshair",
      )}
      role="application"
      aria-label={data.displayName}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClickCapture={(event) => {
        if (dispatchingMarkerClickRef.current) return;
        if (!suppressMarkerClickRef.current) return;
        if (!(event.target as HTMLElement).closest("[data-map-marker-control]")) return;
        event.preventDefault();
        event.stopPropagation();
        suppressMarkerClickRef.current = false;
      }}
      onPointerCancel={() => {
        if (pointerFrameRef.current !== null) {
          window.cancelAnimationFrame(pointerFrameRef.current);
          pointerFrameRef.current = null;
        }
        pendingPointerRef.current = null;
        dragRef.current = null;
        setPanning(false);
        commitPointerView();
      }}
      onKeyDown={(event) => {
        if (event.key === "+" || event.key === "=") changeZoom(1.25);
        if (event.key === "-") changeZoom(0.8);
      }}
    >
      {/* Everything with a world coordinate lives here. The live marker moves
          to the shared visual coordinate while this parent moves the camera to
          that same coordinate, so their transforms cancel exactly in follow. */}
      <div ref={worldRef} className="absolute inset-0">
        <div className="absolute" style={{ inset: `${-cameraOverscan}px` }}>
          <MapTileLayer data={data} view={view} width={overscanWidth} height={overscanHeight} />
        </div>
        <MapMarkerLayer
          data={data}
          points={points}
          view={view}
          width={size.width}
          height={size.height}
          projection={PROJECTION}
          selectedId={selectedPoint?.id ?? null}
          clusterMarkers={displayPreferences.clusterMarkers}
          expandedClusterPointIds={expandedClusterPointIds}
          onSelect={selectPoint}
          onCluster={openCluster}
        />
        <LivePlayerMarker
          status={livePosition.status}
          view={view}
          width={size.width}
          height={size.height}
          projection={PROJECTION}
        />
      </div>
      <div className="map-vignette" aria-hidden="true" />
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
          minimum={ZOOM_RANGE.minimum}
          maximum={ZOOM_RANGE.maximum}
          projection={PROJECTION}
          onZoomIn={() => changeZoom(1.25)}
          onZoomOut={() => changeZoom(0.8)}
        />
      )}
      {!minimapMode && (
        <MapToolbar
          placementMode={placementMode}
          onTogglePlacement={onTogglePlacement}
          livePositionAvailable={Boolean(livePosition.position)}
          followingLivePosition={followLivePosition}
          onToggleFollowLivePosition={onToggleFollowLivePosition}
          onCenterLivePosition={centerOnLivePosition}
        />
      )}
      {!minimapMode && placementMode && <div className="map-placement-hint">{t("map.placementHint")}</div>}
      {!minimapMode && (
        <MapPerformanceWarning
          markerCount={points.length}
          zoom={view.zoom}
          projection={PROJECTION}
        />
      )}
      {!minimapMode && (
        <MapBottomControls
          coordinate={cursorCoordinate}
          zoom={view.zoom}
          projection={PROJECTION}
          onZoomIn={() => changeZoom(1.25)}
          onZoomOut={() => changeZoom(0.8)}
        />
      )}
    </div>
  );
};

export default InteractiveMap;
