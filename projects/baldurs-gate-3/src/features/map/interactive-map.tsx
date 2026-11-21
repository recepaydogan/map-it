import { animateMapCamera } from "./map-camera-animation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import LivePartyMarkers from "../live-position/live-party-markers";
import LivePlayerMarker from "../live-position/live-player-marker";
import { getLatestLivePosition } from "../live-position/live-position-store";
import {
  getLatestLiveMotionPosition,
  subscribeLiveMotion,
} from "../live-position/live-motion";
import type { LivePositionState } from "../live-position/live-position-types";
import { useOnboardingActive } from "../onboarding/use-onboarding";
import MapBottomControls from "./map-bottom-controls";
import { getMapPointInstanceId } from "./map-atlas-projection";
import { getClusterDispersalZoom, type MapPointCluster } from "./map-clustering";
import { worldToMapCoordinate } from "./map-coordinate-reference";
import { getMapJumpZoom } from "./map-jump-zoom";
import MapLiveControls from "./map-live-controls";
import MapMarkerLayer from "./map-marker-layer";
import { getMarkerZoomFromNormalized } from "./map-marker-zoom";
import MapPerformanceWarning from "./map-performance-warning";
import { screenToWorld, worldToScreen, zoomMapAtPointer, type MapProjectionMode, type MapScreenPoint } from "./map-projection";
import MapTileLayer from "./map-tile-layer";
import MapToolbar from "./map-toolbar";
import OverlayMinimapZoomControls from "./overlay-minimap-zoom-controls";
import type { MapCoordinate, MapMetadata, MapPoint, MapView } from "./types";
import { MAP_CAMERA_OVERSCAN_PX, useMapCameraPreview } from "./use-map-camera-preview";
import { useMapDisplayPreferences } from "./use-map-display-preferences";
import { useMapWheelZoom } from "./use-map-wheel-zoom";

/**
 * Tuning knobs. Zoom is "screen pixels per world unit", so 1 draws level-0
 * tiles at native size; the marker tiers (overview / regional / detail) live
 * in map-marker-zoom.ts and are expressed in the same unit.
 */
const PROJECTION: MapProjectionMode = "top";
const ZOOM_RANGE = { minimum: 0.02, maximum: 1.6 };
/** The zoom the guided tour frames the map at while it runs. */
const ONBOARDING_ZOOM = 0.18;
const MINIMAP_DEFAULT_ZOOM = 0.18;
const MAP_VIEW_KEY_PREFIX = "gm:map-view";
const MINIMAP_ZOOM_KEY_PREFIX = "gm:minimap-zoom";
/** The follow camera glides this far on a transform before the layers re-render. */
const FOLLOW_REBASE_PX = 96;
/** A step no walk explains — the camera snaps instead of gliding. */
const FOLLOW_SNAP_WORLD_DISTANCE = 96;

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
  onSelectPoint: (point: MapPoint | null) => void;
  onPlaceMarker: (coordinate: MapCoordinate) => void;
  onTogglePlacement: () => void;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

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

const projectLivePoint = (position: { x: number; y: number }, data: MapMetadata) =>
  data.coordinateReference
    ? worldToMapCoordinate(position, data.coordinateReference)
    : position;

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
  const cancelCameraRef = useRef<(() => void) | null>(null);
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
  const followCommitRef = useRef(false);
  const followRebaseTimerRef = useRef<number | null>(null);
  const sizeRef = useRef(size);
  const [cursorCoordinate, setCursorCoordinate] = useState<MapCoordinate>({ x: 0, y: 0 });
  const [expandedClusterPointIds, setExpandedClusterPointIds] = useState<string[]>([]);
  const [markerFan, setMarkerFan] = useState<{ mapId: string; anchorId: string } | null>(null);
  const markerFanAnchorId = markerFan?.mapId === data.id ? markerFan.anchorId : null;
  const setMarkerFanAnchorId = useCallback((anchorId: string | null) => {
    setMarkerFan(anchorId ? { mapId: data.id, anchorId } : null);
  }, [data.id]);
  const [panning, setPanning] = useState(false);
  const { surfaceRef, showView, finishPreview } = useMapCameraPreview(view, size, PROJECTION, setView, !followLivePosition);

  const stopCameraAnimation = useCallback(() => {
    cancelCameraRef.current?.();
    cancelCameraRef.current = null;
  }, []);

  const animateToView = useCallback((target: MapView) => {
    stopCameraAnimation();
    const boundedTarget = {
      centerX: clamp(target.centerX, data.bounds.minX, data.bounds.maxX),
      centerY: clamp(target.centerY, data.bounds.minY, data.bounds.maxY),
      zoom: clamp(target.zoom, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum),
    };
    cancelCameraRef.current = animateMapCamera(viewRef.current, boundedTarget, (nextView, settled) => {
      viewRef.current = nextView;
      showView(nextView, settled);
    });
  }, [data.bounds, showView, stopCameraAnimation]);

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
  useEffect(() => () => {
    if (!minimapMode && !wasOnboardingActiveRef.current) {
      localStorage.setItem(`${MAP_VIEW_KEY_PREFIX}:${data.id}`, JSON.stringify(viewRef.current));
    }
  }, [data.id, minimapMode]);

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
      const latestLiveTarget = getLatestLivePosition() ?? livePosition.position;
      const liveTarget = latestLiveTarget ? projectLivePoint(latestLiveTarget, data) : null;
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
      showView(previousView, true);
    }
  }, [
    animateToView,
    data,
    data.bounds,
    data.regions,
    livePosition.position,
    minimapMode,
    onboardingActive,
    showView,
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
      followCommitRef.current = true;
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

      const target = projectLivePoint(position, data);
      const startingFollow = !wasFollowingLivePositionRef.current;
      wasFollowingLivePositionRef.current = true;
      const current = viewRef.current;
      const nextView = {
        centerX: target.x,
        centerY: target.y,
        zoom: startingFollow
          ? minimapMode
            ? Math.max(0.28, current.zoom)
            : getMapJumpZoom(current.zoom, displayPreferencesRef.current, ZOOM_RANGE.maximum)
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

      const jumped = Math.hypot(target.x - current.centerX, target.y - current.centerY)
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
  }, [data, data.bounds, followLivePosition, minimapMode, stopCameraAnimation, syncWorldOffset]);

  useEffect(() => {
    displayPreferencesRef.current = displayPreferences;
  }, [displayPreferences]);

  useEffect(() => {
    if (!focusPoint || appliedFocusPointRef.current === focusPoint) return;
    appliedFocusPointRef.current = focusPoint;
    animateToView({
      centerX: focusPoint.x,
      centerY: focusPoint.y,
      zoom: getMapJumpZoom(viewRef.current.zoom, displayPreferencesRef.current, ZOOM_RANGE.maximum),
    });
  }, [animateToView, focusPoint]);

  useEffect(() => stopCameraAnimation, [stopCameraAnimation]);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  /** Reveal a cluster's real members and frame their actual projected bounds. */
  const openCluster = useCallback((cluster: MapPointCluster) => {
    setMarkerFanAnchorId(null);
    const currentZoom = viewRef.current.zoom;
    const dispersalZoom = getMarkerZoomFromNormalized(
      getClusterDispersalZoom(cluster.items, displayPreferencesRef.current.clusterMarkers),
      PROJECTION,
    );
    const memberView = { centerX: 0, centerY: 0, zoom: currentZoom };
    const memberPositions = cluster.items.map(({ point }) => worldToScreen(point, memberView, 0, 0, PROJECTION));
    const leftValues = memberPositions.map(({ left }) => left);
    const topValues = memberPositions.map(({ top }) => top);
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

    setExpandedClusterPointIds(cluster.items.map(({ point }) => getMapPointInstanceId(point)));
    animateToView({
      centerX: center.x,
      centerY: center.y,
      zoom: clamp(targetZoom, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum),
    });
  }, [animateToView, setMarkerFanAnchorId, size.height, size.width]);

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
    const projected = projectLivePoint(target, data);
    animateToView({
      centerX: projected.x,
      centerY: projected.y,
      zoom: getMapJumpZoom(viewRef.current.zoom, displayPreferencesRef.current, ZOOM_RANGE.maximum),
    });
  }, [animateToView, data, livePosition.position]);

  const changeZoom = useCallback((multiplier: number) => {
    setMarkerFanAnchorId(null);
    stopCameraAnimation();
    const current = viewRef.current;
    const nextView = {
      ...current,
      zoom: clamp(current.zoom * multiplier, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum),
    };
    if (nextView.zoom === current.zoom) {
      finishPreview();
      return;
    }
    viewRef.current = nextView;
    showView(nextView, true);
  }, [finishPreview, setMarkerFanAnchorId, showView, stopCameraAnimation]);

  const zoomAtPointer = useCallback((multiplier: number, pointer: MapScreenPoint, width: number, height: number) => {
    const currentView = viewRef.current;
    const nextZoom = clamp(currentView.zoom * multiplier, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum);
    if (nextZoom === currentView.zoom) return;
    setMarkerFanAnchorId(null);
    stopCameraAnimation();
    const nextView = zoomMapAtPointer(currentView, nextZoom, pointer, width, height, PROJECTION);
    nextView.centerX = clamp(nextView.centerX, data.bounds.minX, data.bounds.maxX);
    nextView.centerY = clamp(nextView.centerY, data.bounds.minY, data.bounds.maxY);
    viewRef.current = nextView;
    showView(nextView);
  }, [data.bounds, setMarkerFanAnchorId, showView, stopCameraAnimation]);
  useMapWheelZoom(containerRef, zoomAtPointer, finishPreview);

  // The follow and zoom transforms both need tiles outside the visible area.
  const cameraOverscan = MAP_CAMERA_OVERSCAN_PX;
  const overscanWidth = size.width > 0 ? size.width + cameraOverscan * 2 : 0;
  const overscanHeight = size.height > 0 ? size.height + cameraOverscan * 2 : 0;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const markerControl = target.closest("[data-map-marker-control]");
    if (!markerControl && target.closest("button, input, textarea, [data-map-ui]")) return;
    stopCameraAnimation();
    finishPreview();
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
    setView(nextView);
  }, [coordinateFromClient, data.bounds, size]);

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
      // off rather than snapping the camera back on the next sample.
      if (drag.moved && !drag.stoppedFollow && followLivePosition) {
        drag.stoppedFollow = true;
        onToggleFollowLivePosition?.();
      }
      if (!drag.moved) {
        deltaX = 0;
        deltaY = 0;
      } else {
        drag.x = event.clientX;
        drag.y = event.clientY;
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
    if (placementMode) onPlaceMarker(coordinateFromClient(event.clientX, event.clientY));
    else {
      setMarkerFanAnchorId(null);
      onSelectPoint(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "map-viewport",
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
        if (!suppressMarkerClickRef.current) return;
        if (!(event.target as HTMLElement).closest("[data-map-marker-control]")) return;
        event.preventDefault();
        event.stopPropagation();
        suppressMarkerClickRef.current = false;
      }}
      onPointerCancel={() => { dragRef.current = null; setPanning(false); }}
      onKeyDown={(event) => {
        if (event.key === "+" || event.key === "=") changeZoom(1.25);
        if (event.key === "-") changeZoom(0.8);
      }}
    >
      {/* Everything with a world coordinate lives here. The live marker moves
          to the shared visual coordinate while this parent moves the camera to
          that same coordinate, so their transforms cancel exactly in follow. */}
      <div ref={surfaceRef} className="map-camera-surface absolute inset-0">
        <div
          ref={worldRef}
          className={cn("absolute inset-0", followLivePosition && "map-live-follow-world")}
        >
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
            selectedInstanceId={selectedPoint ? getMapPointInstanceId(selectedPoint) : null}
            clusterMarkers={displayPreferences.clusterMarkers}
            expandedClusterPointIds={expandedClusterPointIds}
            markerFanAnchorId={markerFanAnchorId}
            onSelect={selectPoint}
            onCluster={openCluster}
            onMarkerFanChange={setMarkerFanAnchorId}
          />
          <LivePlayerMarker
            status={livePosition.status}
            view={view}
            width={size.width}
            height={size.height}
            projection={PROJECTION}
            coordinateReference={data.coordinateReference}
          />
          <LivePartyMarkers
            view={view}
            width={size.width}
            height={size.height}
            projection={PROJECTION}
            coordinateReference={data.coordinateReference}
          />
        </div>
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
