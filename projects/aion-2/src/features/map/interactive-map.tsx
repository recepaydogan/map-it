import { getDesktopMapFollow, setDesktopMapFollow, subscribeDesktopMapFollow } from "../live-position/desktop-map-follow";
import { LivePlayerMarker } from "../live-position/live-player-marker";
import { getLivePosition, subscribeLivePosition } from "../live-position/live-position-store";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useOnboardingActive } from "../onboarding/use-onboarding";
import { PlayerMapControls } from "../live-position/player-map-controls";
import { getClusterDispersalZoom, type MapPointCluster } from "./map-clustering";
import { getPointAppearance } from "./map-config";
import type { MapDisplayPreferences } from "./map-display-preferences";
import MapMarkerLayer from "./map-marker-layer";
import { getMarkerZoomFromNormalized } from "./map-marker-zoom";
import MapPerformanceWarning from "./map-performance-warning";
import { screenToWorld, worldToScreen, type MapProjectionMode } from "./map-projection";
import MapTileLayer from "./map-tile-layer";
import MapInsetLayer from "./map-inset-layer";
import { subscribeToCurrentWindowState } from "../../overwolf-utils/window-manager";
import type { MapCoordinate, MapMetadata, MapPoint, MapView } from "./types";
import { useMapDisplayPreferences } from "./use-map-display-preferences";
import type { ScheduledEvent } from "../events/event-schedule";

/**
 * Tuning knobs. Zoom is "screen pixels per world unit", so 1 draws level-0
 * tiles at native size; the marker tiers (overview / regional / detail) live
 * in map-marker-zoom.ts and are expressed in the same unit.
 */
const PROJECTION: MapProjectionMode = "top";
const ZOOM_RANGE = { minimum: 0.02, maximum: 3 };
/** The default close-up a jump-to marker pick zooms to. */
const SELECTION_ZOOM_FLOOR = 0.48;
const MINIMAP_DEFAULT_ZOOM = 0.33;
const MAP_VIEW_KEY_PREFIX = "gm:map-view";
const MINIMAP_ZOOM_KEY_PREFIX = "gm:minimap-zoom";
/** Cameras glide this far on a transform before the layers re-render. */
const CAMERA_REBASE_PX = 96;
const CAMERA_OVERSCAN_PX = 128;
/** Leave room for a pin beside an open detail panel. */
const SELECTION_PANEL_GAP_PX = 40;
const SELECTION_TOOLTIP_GAP_PX = 16;

export interface MapCameraFocus {
  point: MapPoint;
  preserveZoom?: boolean;
  zoom?: number;
  centerOnPoint?: boolean;
  moveOnlyIfObscured?: boolean;
  bounds?: MapMetadata["bounds"];
}

interface InteractiveMapProps {
  data: MapMetadata;
  points: MapPoint[];
  activeEventMarkers: ReadonlyMap<string, ScheduledEvent[]>;
  completedIds: string[];
  selectedPoint: MapPoint | null;
  focusPoint: MapCameraFocus | null;
  showAllMarkers?: boolean;
  trackedInsetId?: string;
  onTrackedInsetVisibilityChange?: (visible: boolean) => void;
  placementMode: boolean;
  controlsIntroVisible?: boolean;
  minimapMode?: boolean;
  desktopFollow?: boolean;
  showRegionPins: boolean;
  onSelectPoint: (point: MapPoint | null, options?: { preserveZoom?: boolean }) => void;
  onSelectRegion: (regionId: string) => void;
  onToggleCompleted: (point: MapPoint) => void;
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

/** Frame the full image on first open, including in shorter desktop windows. */
const getDefaultView = (data: MapMetadata): MapView => {
  const bounds = data.hideBaseTiles && data.insets?.length ? data.insets[0]!.bounds : data.bounds;
  const fitPixels = Math.min(
    900,
    Math.max(320, window.innerWidth - 480),
    Math.max(320, window.innerHeight - 80),
  );
  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    zoom: clamp(
      fitPixels / Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY),
      ZOOM_RANGE.minimum,
      0.25,
    ),
  };
};

const readView = (data: MapMetadata): MapView => {
  const fallback = getDefaultView(data);
  const bounds = data.navigationBounds ?? data.bounds;
  try {
    const value = localStorage.getItem(`${MAP_VIEW_KEY_PREFIX}:${data.id}`);
    if (!value) return fallback;
    const parsed = JSON.parse(value) as Partial<MapView>;
    if (!Number.isFinite(parsed.centerX) || !Number.isFinite(parsed.centerY) || !Number.isFinite(parsed.zoom)) return fallback;
    return {
      centerX: clamp(parsed.centerX!, bounds.minX, bounds.maxX),
      centerY: clamp(parsed.centerY!, bounds.minY, bounds.maxY),
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
 * The map surface: tiles and markers with pan/zoom and floating controls.
 * Owns the view;
 * everything about WHAT is drawn comes in through props from the workspace.
 */
const InteractiveMap = ({
  data,
  points,
  activeEventMarkers,
  completedIds,
  selectedPoint,
  focusPoint,
  showAllMarkers = false,
  trackedInsetId,
  onTrackedInsetVisibilityChange,
  placementMode,
  controlsIntroVisible = false,
  minimapMode = false,
  desktopFollow = false,
  showRegionPins,
  onSelectPoint,
  onSelectRegion,
  onToggleCompleted,
  onPlaceMarker,
  onTogglePlacement,
}: InteractiveMapProps) => {
  const { t } = useTranslation();
  const navigationBounds = data.navigationBounds ?? data.bounds;
  const onboardingActive = useOnboardingActive();
  const { preferences: displayPreferences } = useMapDisplayPreferences();
  // Read through a ref where the camera jumps: a preference change must never
  // re-run a focus effect and yank the map back to a stale focus point.
  const displayPreferencesRef = useRef(displayPreferences);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const insetVisibilityCallback = useRef(onTrackedInsetVisibilityChange);
  const dragRef = useRef<
    { pointerId: number; x: number; y: number; moved: boolean } | null
  >(null);
  /** Accumulated pointer motion awaiting the next animation frame. */
  const pendingPointerRef = useRef<{
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const suppressMarkerClickRef = useRef(false);
  const cameraFrameRef = useRef<number | null>(null);
  const appliedFocusPointRef = useRef<MapCameraFocus | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Overwolf recreates the overlay window on each show. Restore its zoom.
  const [view, setView] = useState<MapView>(() => minimapMode
    ? { ...getDefaultView(data), zoom: readMinimapZoom(data.id) }
    : readView(data));
  const viewRef = useRef(view);
  const [selectionPanelLayoutKey, setSelectionPanelLayoutKey] = useState(0);
  /** What the layers are currently drawn with. The imperative stage runs
   * ahead until it reaches the edge of the tile guard band. */
  const renderedViewRef = useRef(view);
  const worldRef = useRef<HTMLDivElement>(null);
  const worldOffsetAppliedRef = useRef(false);
  const sizeRef = useRef(size);
  const [expandedClusterPointIds, setExpandedClusterPointIds] = useState<string[]>([]);
  const [dismissFanKey, setDismissFanKey] = useState(0);
  const [panning, setPanning] = useState(false);
  const [hasPlayer, setHasPlayer] = useState(false);
  const [localFollowPlayer, setLocalFollowPlayer] = useState(minimapMode);
  const desktopMapFollow = useSyncExternalStore(subscribeDesktopMapFollow, getDesktopMapFollow);
  const followPlayer = desktopFollow ? desktopMapFollow : localFollowPlayer;
  const followPlayerRef = useRef(followPlayer);
  const setFollowPlayer = useCallback((enabled: boolean) => {
    followPlayerRef.current = enabled;
    if (desktopFollow) setDesktopMapFollow(enabled);
    else setLocalFollowPlayer(enabled);
  }, [desktopFollow]);
  const followSessionRef = useRef("");
  const stopFollowing = useCallback(() => {
    followSessionRef.current = "";
    setFollowPlayer(false);
  }, [setFollowPlayer]);

  useEffect(() => {
    insetVisibilityCallback.current = onTrackedInsetVisibilityChange;
  }, [onTrackedInsetVisibilityChange]);
  useEffect(() => {
    const container = containerRef.current;
    if (!trackedInsetId || !container) return;
    const inset = [...container.querySelectorAll<HTMLElement>("[data-map-inset-id]")]
      .find((element) => element.dataset.mapInsetId === trackedInsetId);
    if (!inset) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) insetVisibilityCallback.current?.(entry.isIntersecting);
    }, { root: container });
    observer.observe(inset);
    return () => observer.disconnect();
  }, [data.id, trackedInsetId]);

  const stopCameraAnimation = useCallback(() => {
    if (cameraFrameRef.current === null) return;
    window.cancelAnimationFrame(cameraFrameRef.current);
    cameraFrameRef.current = null;
  }, []);

  const animateToView = useCallback((target: MapView) => {
    stopCameraAnimation();
    const boundedTarget = {
      centerX: clamp(target.centerX, navigationBounds.minX, navigationBounds.maxX),
      centerY: clamp(target.centerY, navigationBounds.minY, navigationBounds.maxY),
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
  }, [navigationBounds, stopCameraAnimation]);

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

  // Opening the tour leaves the current camera exactly where it is, including
  // its zoom. Cancel a navigation animation already in flight at that point.
  useEffect(() => {
    if (onboardingActive && !minimapMode) stopCameraAnimation();
  }, [minimapMode, onboardingActive, stopCameraAnimation]);

  /** Move the drawn map with one transform between render commits. */
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

    // A pan or a zoom is the user placing the map: it lands exactly where they
    // put it, with any leftover drag offset discarded before the paint.
    if (!worldOffsetAppliedRef.current) return;
    worldOffsetAppliedRef.current = false;
    world.style.transition = "none";
    world.style.transform = "";
    // Resizing can redraw the old view mid-drag. Carry the uncommitted camera
    // offset into that resized surface instead of briefly snapping backwards.
    if (dragRef.current?.moved) syncWorldOffset();
  }, [size, syncWorldOffset, view]);

  const jumpToPlayer = useCallback((zoom = viewRef.current.zoom) => {
    const position = getLivePosition();
    if (position.state !== "tracking" || position.mapId !== data.id || !position.point || Date.now() - position.timestamp >= 3000) return;
    stopCameraAnimation();
    const next = { centerX: position.point.x, centerY: position.point.y, zoom };
    viewRef.current = next;
    setView(next);
  }, [data.id, stopCameraAnimation]);

  useEffect(() => {
    const follow = () => {
      const position = getLivePosition();
      const valid = position.state === "tracking" && position.mapId === data.id && !!position.point && Date.now() - position.timestamp < 3000;
      setHasPlayer(valid);
      if (!valid) { followSessionRef.current = ""; return; }
      if (!followPlayerRef.current || !position.point) return;
      stopCameraAnimation();
      const session = `${position.processId}:${position.nativeMapId}`;
      const current = viewRef.current;
      const next = { ...current, centerX: position.point.x, centerY: position.point.y };
      viewRef.current = next;
      if (followSessionRef.current !== session) {
        followSessionRef.current = session;
        setView(next);
        return;
      }
      if (current.centerX === next.centerX && current.centerY === next.centerY) return;
      // Move the shared map stage between guard-band commits, just like panning.
      // Hundreds of POIs never re-render for every incoming player sample.
      const distance = syncWorldOffset();
      if (distance >= CAMERA_REBASE_PX) setView(next);
      else if (worldRef.current) worldRef.current.style.transition = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "transform 100ms linear";
    };
    followPlayerRef.current = followPlayer;
    follow();
    const unsubscribe = subscribeLivePosition(follow);
    const expiry = window.setInterval(() => {
      if (Date.now() - getLivePosition().timestamp >= 3000) { setHasPlayer(false); followSessionRef.current = ""; }
    }, 1000);
    return () => { unsubscribe(); window.clearInterval(expiry); };
  }, [data.id, followPlayer, stopCameraAnimation, syncWorldOffset]);

  useEffect(() => {
    if (!minimapMode) return;
    let visible = false;
    return subscribeToCurrentWindowState((state) => {
      const nextVisible = state === "normal" || state === "maximized";
      if (nextVisible && !visible) {
        followPlayerRef.current = true;
        followSessionRef.current = "";
        setFollowPlayer(true);
        jumpToPlayer(viewRef.current.zoom);
      }
      visible = nextVisible;
    });
  }, [jumpToPlayer, minimapMode, setFollowPlayer]);

  useEffect(() => {
    displayPreferencesRef.current = displayPreferences;
  }, [displayPreferences]);

  useEffect(() => {
    if (!focusPoint?.moveOnlyIfObscured || selectedPoint?.id !== focusPoint.point.id) return;
    const workspace = containerRef.current?.closest("[data-map-workspace]");
    if (!workspace) return;
    const panels = workspace.querySelectorAll<HTMLElement>("[data-map-selection-panel]");
    if (!panels.length) return;
    const observer = new ResizeObserver(() => setSelectionPanelLayoutKey((current) => current + 1));
    panels.forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, [focusPoint, selectedPoint?.id]);

  useLayoutEffect(() => {
    if (!focusPoint || (!focusPoint.moveOnlyIfObscured && appliedFocusPointRef.current === focusPoint)
      || size.width <= 0 || size.height <= 0) return;
    stopFollowing();
    const point = focusPoint.point;
    if (focusPoint.moveOnlyIfObscured && selectedPoint?.id !== point.id) return;
    const inset = point.subtype === "region" ? data.insets?.find((candidate) => candidate.id === point.regionId) : undefined;
    const region = point.subtype === "region" ? data.regions.find((candidate) => candidate.id === point.regionId) : undefined;
    const frame = focusPoint.bounds ?? (point.subtype === "map-overview" ? data.bounds : inset?.bounds ?? region?.focusBounds);
    const zoom = focusPoint.zoom !== undefined ? clamp(focusPoint.zoom, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum)
      : focusPoint.preserveZoom ? viewRef.current.zoom : frame ? Math.min(ZOOM_RANGE.maximum,
      Math.max(1, size.width - 80) / Math.max(1, frame.maxX - frame.minX),
      Math.max(1, size.height - 120) / Math.max(1, frame.maxY - frame.minY),
    ) : getJumpZoom(viewRef.current.zoom, displayPreferencesRef.current);
    if (focusPoint.centerOnPoint) {
      appliedFocusPointRef.current = focusPoint;
      animateToView({ centerX: point.x, centerY: point.y, zoom });
      return;
    }
    const mapRect = containerRef.current?.getBoundingClientRect();
    const selectionPanels = mapRect && point.subtype !== "region" && point.subtype !== "map-overview"
      ? [...(containerRef.current?.closest("[data-map-workspace]")?.querySelectorAll<HTMLElement>("[data-map-selection-panel]") ?? [])]
        .filter((panel) => panel.getClientRects().length > 0)
      : [];
    const panelRects = selectionPanels.map((panel) => panel.getBoundingClientRect());
    const panelRect = panelRects
      .reduce<DOMRect | null>((rightmost, rect) => !rightmost || rect.right > rightmost.right ? rect : rightmost, null);
    const markerRadius = Math.max(21, (getPointAppearance(point).markerSize ?? 32) / 2 + 3);
    const tooltipRect = containerRef.current?.querySelector<HTMLElement>("[data-map-selected-tooltip]")?.getBoundingClientRect();
    const tooltipHalfWidth = (tooltipRect?.width ?? 0) / 2;
    if (focusPoint.moveOnlyIfObscured) {
      if (!mapRect || !panelRect) return;
      const selectedMarkerRect = containerRef.current?.querySelector<HTMLElement>("[data-map-selected-marker]")?.getBoundingClientRect();
      const currentScreen = worldToScreen(point, viewRef.current, size.width, size.height, PROJECTION);
      const markerX = selectedMarkerRect ? selectedMarkerRect.left + selectedMarkerRect.width / 2 : mapRect.left + currentScreen.left;
      const markerY = selectedMarkerRect ? selectedMarkerRect.top + selectedMarkerRect.height / 2 : mapRect.top + currentScreen.top;
      const obscured = panelRects.some((rect) =>
        (markerX + markerRadius > rect.left && markerX - markerRadius < rect.right
          && markerY + markerRadius > rect.top && markerY - markerRadius < rect.bottom)
        || (tooltipRect && tooltipRect.right > rect.left && tooltipRect.left < rect.right
          && tooltipRect.bottom > rect.top && tooltipRect.top < rect.bottom));
      if (!obscured) {
        appliedFocusPointRef.current = focusPoint;
        return;
      }
    }
    const desiredX = panelRect && mapRect
      ? clamp(panelRect.right - mapRect.left + Math.max(SELECTION_PANEL_GAP_PX, tooltipHalfWidth + SELECTION_TOOLTIP_GAP_PX),
        0, Math.max(0, size.width - Math.max(markerRadius, tooltipHalfWidth) - SELECTION_TOOLTIP_GAP_PX))
      : size.width / 2;
    const desiredY = panelRect && mapRect
      ? clamp(panelRect.top - mapRect.top + panelRect.height / 2, 0, size.height)
      : size.height / 2;
    const offset = screenToWorld(desiredX, desiredY,
      { centerX: 0, centerY: 0, zoom }, size.width, size.height, PROJECTION);
    appliedFocusPointRef.current = focusPoint;
    animateToView({
      centerX: point.x - offset.x,
      centerY: point.y - offset.y,
      zoom,
    });
  }, [animateToView, data.bounds, data.insets, data.regions, focusPoint, selectedPoint?.id,
    selectionPanelLayoutKey, size.width, size.height, stopFollowing]);

  useEffect(() => stopCameraAnimation, [stopCameraAnimation]);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  /** Reveal a cluster's real members and frame their actual projected bounds. */
  const openCluster = useCallback((cluster: MapPointCluster) => {
    stopFollowing();
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
  }, [animateToView, size.height, size.width, stopFollowing]);

  const coordinateFromClient = useCallback((clientX: number, clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    // The current camera includes movement not yet committed to a render.
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
  const selectPoint = useCallback(
    (point: MapPoint | null, options?: { preserveZoom?: boolean }) => selectPointRef.current(point, options),
    [],
  );
  const toggleCompletedRef = useRef(onToggleCompleted);
  useEffect(() => {
    toggleCompletedRef.current = onToggleCompleted;
  }, [onToggleCompleted]);
  const toggleCompleted = useCallback((point: MapPoint) => toggleCompletedRef.current(point), []);

  const changeZoom = useCallback((multiplier: number) => {
    stopCameraAnimation();
    const current = viewRef.current;
    const nextView = {
      ...current,
      zoom: clamp(current.zoom * multiplier, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum),
    };
    viewRef.current = nextView;
    setView(nextView);
  }, [stopCameraAnimation]);

  const handleWheel = useCallback((event: WheelEvent) => {
    // A panel floating over the map scrolls its own lists. The wheel belongs to
    // whatever is under the cursor, so the camera only takes it over the map.
    if ((event.target as HTMLElement | null)?.closest?.("[data-map-ui]")) return;
    event.preventDefault();
    stopCameraAnimation();
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const multiplier = event.deltaY > 0 ? 0.82 : 1.22;
    const currentView = viewRef.current;
    const nextZoom = clamp(currentView.zoom * multiplier, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum);
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const nextView: MapView = { ...currentView, zoom: nextZoom };
    if (!followPlayerRef.current) {
      const worldAtPointer = screenToWorld(pointerX, pointerY, currentView, bounds.width, bounds.height, PROJECTION);
      const offsetAtNextZoom = screenToWorld(
        pointerX,
        pointerY,
        { centerX: 0, centerY: 0, zoom: nextZoom },
        bounds.width,
        bounds.height,
        PROJECTION,
      );
      nextView.centerX = clamp(worldAtPointer.x - offsetAtNextZoom.x, navigationBounds.minX, navigationBounds.maxX);
      nextView.centerY = clamp(worldAtPointer.y - offsetAtNextZoom.y, navigationBounds.minY, navigationBounds.maxY);
    }
    viewRef.current = nextView;
    setView(nextView);
  }, [navigationBounds, stopCameraAnimation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Draw past the viewport so a drag cannot expose an undrawn edge.
  const cameraOverscan = CAMERA_OVERSCAN_PX;
  const overscanWidth = size.width > 0 ? size.width + cameraOverscan * 2 : 0;
  const overscanHeight = size.height > 0 ? size.height + cameraOverscan * 2 : 0;

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
      centerX: clamp(current.centerX - worldDelta.x, navigationBounds.minX, navigationBounds.maxX),
      centerY: clamp(current.centerY - worldDelta.y, navigationBounds.minY, navigationBounds.maxY),
    };
    viewRef.current = nextView;
    // Reuse the drawn surface between guard-band boundaries. A frame now
    // changes one transform instead of thousands of marker coordinates.
    if (syncWorldOffset() >= CAMERA_REBASE_PX) setView(nextView);
  }, [navigationBounds, size, syncWorldOffset]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const dragging = Boolean(drag && drag.pointerId === event.pointerId);
    let deltaX = 0;
    let deltaY = 0;
    if (drag && dragging) {
      deltaX = event.clientX - drag.x;
      deltaY = event.clientY - drag.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 2) drag.moved = true;
      if (drag.moved && !panning) {
        stopFollowing();
        setPanning(true);
        // A marker can disappear during culling. Capture on the stable viewport.
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (drag.moved) {
        drag.x = event.clientX;
        drag.y = event.clientY;
      } else {
        deltaX = 0;
        deltaY = 0;
      }
    }
    const pending = pendingPointerRef.current;
    pendingPointerRef.current = {
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
      setView(viewRef.current);
      suppressMarkerClickRef.current = true;
      window.setTimeout(() => { suppressMarkerClickRef.current = false; }, 0);
      return;
    }
    if ((event.target as HTMLElement).closest("[data-map-marker-control]")) return;
    setDismissFanKey((current) => current + 1);
    if (placementMode) onPlaceMarker(coordinateFromClient(event.clientX, event.clientY));
    else onSelectPoint(null);
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
      onPointerCancel={() => {
        if (pointerFrameRef.current !== null) {
          window.cancelAnimationFrame(pointerFrameRef.current);
          flushPointerMove();
        }
        dragRef.current = null;
        setPanning(false);
        setView(viewRef.current);
      }}
      onKeyDown={(event) => {
        if (event.key === "+" || event.key === "=") changeZoom(1.25);
        if (event.key === "-") changeZoom(0.8);
      }}
    >
      {/* Everything with a world coordinate lives here. */}
      <div ref={worldRef} className="absolute inset-0 will-change-transform">
        <div className="absolute" style={{ inset: `${-cameraOverscan}px` }}>
          <MapTileLayer data={data} view={view} width={overscanWidth} height={overscanHeight} />
          <MapInsetLayer data={data} view={view} width={overscanWidth} height={overscanHeight} trackedInsetId={trackedInsetId} />
        </div>
        <LivePlayerMarker mapId={data.id} view={view} width={size.width} height={size.height} projection={PROJECTION} compact={minimapMode} />
        <MapMarkerLayer
          data={data}
          minimapMode={minimapMode}
          points={points}
          activeEventMarkers={activeEventMarkers}
          completedIds={completedIds}
          view={view}
          width={size.width}
          height={size.height}
          projection={PROJECTION}
          selectedId={selectedPoint?.id ?? null}
          activeRegionId={focusPoint?.point.subtype === "region" ? focusPoint.point.regionId : null}
          showRegionPins={showRegionPins}
          clusterMarkers={displayPreferences.clusterMarkers && !showAllMarkers}
          expandedClusterPointIds={expandedClusterPointIds}
          dismissFanKey={dismissFanKey}
          onSelect={selectPoint}
          onSelectRegion={onSelectRegion}
          onToggleCompleted={toggleCompleted}
          onCluster={openCluster}
        />
      </div>
      <div className="map-vignette" aria-hidden="true" />
      <PlayerMapControls compact={minimapMode} available={hasPlayer} following={followPlayer}
        placementMode={placementMode} onTogglePlacement={() => { stopFollowing(); onTogglePlacement(); }}
        zoom={view.zoom} minimum={ZOOM_RANGE.minimum} maximum={ZOOM_RANGE.maximum}
        onCenter={() => jumpToPlayer()}
        onFollow={() => {
          if (followPlayerRef.current) { stopFollowing(); return; }
          followPlayerRef.current = true;
          followSessionRef.current = "";
          setFollowPlayer(true);
          jumpToPlayer();
        }}
        onZoomIn={() => changeZoom(1.25)} onZoomOut={() => changeZoom(0.8)}
        onReset={() => { stopFollowing(); stopCameraAnimation(); const next = getDefaultView(data); viewRef.current = next; setView(next); }} />
      {!minimapMode && placementMode && <div className="map-placement-hint">{t("map.placementHint")}</div>}
      {!minimapMode && (
        <MapPerformanceWarning
          markerCount={points.length}
          zoom={view.zoom}
          projection={PROJECTION}
        />
      )}
    </div>
  );
};

export default InteractiveMap;
