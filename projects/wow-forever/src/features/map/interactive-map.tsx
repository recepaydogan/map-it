import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import LivePlayerMarker from "../live-position/live-player-marker";
import { getLatestLivePosition } from "../live-position/live-position-store";
import {
  getLatestLiveMotionPosition,
  subscribeLiveMotion,
} from "../live-position/live-motion";
import type { LivePositionState } from "../live-position/live-position-types";
import MapBottomControls from "./map-bottom-controls";
import { getClusterDispersalZoom, type MapPointCluster } from "./map-clustering";
import type { MapDisplayPreferences } from "./map-display-preferences";
import MapLiveControls from "./map-live-controls";
import MapMarkerLayer from "./map-marker-layer";
import MapFishingLevelLayer from "./map-fishing-level-layer";
import { FISHING_LEVEL_MAP_ID } from "./map-fishing-levels";
import { useFishingLevels } from "./use-fishing-levels";
import type { MapQuestGroup } from "./map-marker-overlap";
import MapRouteLines from "./map-route-lines";
import MapPlannedRoute from "./map-planned-route";
import { getMarkerOverlapZoom, getMarkerZoomFromNormalized } from "./map-marker-zoom";
import { filterGatheringForZoom, isZoomLimitedGatheringPoint, shouldFilterGatheringForZoom } from "./map-gathering-zoom-filter";
import { screenToWorld, worldToScreen, type MapProjectionMode } from "./map-projection";
import MapTileLayer from "./map-tile-layer";
import MapInsetLayer from "./map-inset-layer";
import OverlayMinimapZoomControls from "./overlay-minimap-zoom-controls";
import type { MapCoordinate, MapMetadata, MapPoint, MapView } from "./types";
import { useMapDisplayPreferences } from "./use-map-display-preferences";
import { DEFAULT_MAP_ID, getMapDefinition } from "./map-registry";
import { WORLD_ATLAS_ARTWORK } from "./world-atlas-artwork";

/**
 * Tuning knobs. Zoom is "screen pixels per world unit", so 1 draws level-0
 * tiles at native size; the marker tiers (overview / regional / detail) live
 * in map-marker-zoom.ts and are expressed in the same unit.
 */
const PROJECTION: MapProjectionMode = "top";
const ZOOM_RANGE = { minimum: 0.02, maximum: 6.4 };
/** The default close-up a jump-to (marker pick, centre-on-player) zooms to. */
const SELECTION_ZOOM_FLOOR = 0.48;
const MINIMAP_DEFAULT_ZOOM = 0.18;
const MAP_VIEW_KEY_PREFIX = "gm:map-view";
const MINIMAP_ZOOM_KEY_PREFIX = "gm:minimap-zoom";
/** Cameras glide this far on a transform before the layers re-render. */
const FOLLOW_REBASE_PX = 96;
const FOLLOW_OVERSCAN_PX = 128;
/** A step no walk explains — the camera snaps instead of gliding. */
const FOLLOW_SNAP_WORLD_DISTANCE = 96;
/** Match ER's space between an open detail panel and its selected marker. */
const SELECTION_PANEL_GAP_PX = 72;
const SELECTION_TOOLTIP_GAP_PX = 16;

export interface MapCameraFocus {
  point: MapPoint;
  preserveZoom?: boolean;
  moveOnlyIfObscured?: boolean;
}

interface InteractiveMapProps {
  data: MapMetadata;
  points: MapPoint[];
  trackedQuestMarkerIds?: ReadonlySet<string>;
  poiLabelPoints: MapPoint[];
  completedIds: string[];
  selectedPoint: MapPoint | null;
  hiddenFlightRouteIds: string[];
  gatheringRoute?: MapPoint[];
  focusPoint: MapCameraFocus | null;
  trackedInsetId?: string;
  onTrackedInsetVisibilityChange?: (visible: boolean) => void;
  placementMode: boolean;
  onTogglePlacement?: () => void;
  livePosition: LivePositionState;
  followLivePosition?: boolean;
  onToggleFollowLivePosition?: () => void;
  controlsExpanded?: boolean;
  fullscreenControl?: ReactNode;
  controlsIntroVisible?: boolean;
  persistView?: boolean;
  minimapMode?: boolean;
  onSelectPoint: (point: MapPoint | null, options?: { preserveZoom?: boolean }) => void;
  onQuestGroup: (group: MapQuestGroup) => void;
  onPlaceMarker: (coordinate: MapCoordinate) => void;
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

const readView = (data: MapMetadata, fallback = getDefaultView(data)): MapView => {
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
 * The map surface: tiles, markers and the player, with pan/zoom, a camera that
 * can follow the live position, and the floating controls. Owns the view;
 * everything about WHAT is drawn comes in through props from the workspace.
 */
const InteractiveMap = ({
  data,
  points,
  poiLabelPoints,
  trackedQuestMarkerIds,
  completedIds,
  selectedPoint,
  hiddenFlightRouteIds,
  gatheringRoute = [],
  focusPoint,
  trackedInsetId,
  onTrackedInsetVisibilityChange,
  placementMode,
  onTogglePlacement,
  livePosition,
  followLivePosition = false,
  onToggleFollowLivePosition,
  controlsExpanded = true,
  fullscreenControl,
  controlsIntroVisible = false,
  persistView = true,
  minimapMode = false,
  onSelectPoint,
  onQuestGroup,
  onPlaceMarker,
}: InteractiveMapProps) => {
  const { t } = useTranslation();
  const fishingLevelsVisible = useFishingLevels();
  const navigationBounds = data.navigationBounds ?? data.bounds;
  const { preferences: displayPreferences } = useMapDisplayPreferences();
  // Read through a ref where the camera jumps: a preference change must never
  // re-run a focus effect and yank the map back to a stale focus point.
  const displayPreferencesRef = useRef(displayPreferences);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const insetVisibilityCallback = useRef(onTrackedInsetVisibilityChange);
  const dragRef = useRef<
    { pointerId: number; x: number; y: number; moved: boolean; stoppedFollow: boolean } | null
  >(null);
  /** Accumulated pointer motion awaiting the next animation frame. */
  const pendingPointerRef = useRef<{
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const suppressMarkerClickRef = useRef(false);
  const cameraFrameRef = useRef<number | null>(null);
  const wasFollowingLivePositionRef = useRef(false);
  const appliedFocusPointRef = useRef<MapCameraFocus | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Overwolf recreates the overlay window on each show. Restore only the scale
  // the player chose. Start on land until the live-position camera takes over.
  const [view, setView] = useState<MapView>(() => {
    if (!minimapMode) return persistView ? readView(data) : getDefaultView(data);
    const center = getMapDefinition(data.id).minimapInitialCenter;
    return {
      ...getDefaultView(data),
      ...(center ? {
        centerX: clamp(center.x, navigationBounds.minX, navigationBounds.maxX),
        centerY: clamp(center.y, navigationBounds.minY, navigationBounds.maxY),
      } : {}),
      zoom: readMinimapZoom(data.id),
    };
  });
  const viewRef = useRef(view);
  const [selectionPanelLayoutKey, setSelectionPanelLayoutKey] = useState(0);
  /** What the layers are currently drawn with. The imperative stage runs
   * ahead until it reaches the edge of the tile guard band. */
  const renderedViewRef = useRef(view);
  const worldRef = useRef<HTMLDivElement>(null);
  const worldOffsetAppliedRef = useRef(false);
  const followCommitRef = useRef(false);
  const followRebaseTimerRef = useRef<number | null>(null);
  const sizeRef = useRef(size);
  const [expandedClusterPointIds, setExpandedClusterPointIds] = useState<string[]>([]);
  const [dismissFanKey, setDismissFanKey] = useState(0);
  const [panning, setPanning] = useState(false);
  const [dungeonRouteVisible, setDungeonRouteVisible] = useState(true);
  const filterGathering = shouldFilterGatheringForZoom(points.length, view.zoom, PROJECTION);
  const markerPoints = useMemo(() => filterGatheringForZoom(points, filterGathering), [points, filterGathering]);
  // The marker layer can draw a selected pin even when it is absent from points.
  const visibleSelectedPoint = filterGathering && selectedPoint && isZoomLimitedGatheringPoint(selectedPoint)
    ? null : selectedPoint;

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
    let fitRaster = Boolean(data.imageLayer);
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
      if (fitRaster && width > 0 && height > 0) {
        fitRaster = false;
        const { minX, minY, maxX, maxY } = data.bounds;
        const initialView = {
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
          zoom: clamp(Math.min(width / (maxX - minX), height / (maxY - minY)) * 0.95,
            ZOOM_RANGE.minimum, ZOOM_RANGE.maximum),
        };
        viewRef.current = persistView ? readView(data, initialView) : initialView;
        setView(viewRef.current);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [data, persistView]);

  // Persist the view (or just the minimap's zoom) after the camera settles.
  const viewReady = !data.imageLayer || size.width > 0;
  useEffect(() => {
    if (!persistView || !viewReady) return;
    const timer = window.setTimeout(() => {
      if (minimapMode) {
        localStorage.setItem(`${MINIMAP_ZOOM_KEY_PREFIX}:${data.id}`, String(view.zoom));
        return;
      }
      localStorage.setItem(`${MAP_VIEW_KEY_PREFIX}:${data.id}`, JSON.stringify(view));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [data.id, minimapMode, persistView, view, viewReady]);

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
    // Resizing can redraw the old view mid-drag. Carry the uncommitted camera
    // offset into that resized surface instead of briefly snapping backwards.
    if (dragRef.current?.moved) syncWorldOffset();
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
        centerX: clamp(visualCenter.x, navigationBounds.minX, navigationBounds.maxX),
        centerY: clamp(visualCenter.y, navigationBounds.minY, navigationBounds.maxY),
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
        // A drag owns the camera before the follow preference catches up.
        if (dragRef.current?.moved) commitLatestCamera();
        else freezeAndRebase(true);
      }
    };
    if (!shouldFollow) {
      resetFollow();
      return;
    }

    let wasDocumentHidden = document.visibilityState === "hidden";
    const follow = (position: { x: number; y: number } | null) => {
      if (dragRef.current?.moved) return;
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
  }, [navigationBounds, followLivePosition, minimapMode, stopCameraAnimation, syncWorldOffset]);

  useEffect(() => {
    displayPreferencesRef.current = displayPreferences;
  }, [displayPreferences]);

  useEffect(() => {
    if (!focusPoint?.moveOnlyIfObscured || selectedPoint?.id !== focusPoint.point.id) return;
    const workspace = containerRef.current?.closest("[data-map-workspace]");
    const panels = workspace?.querySelectorAll<HTMLElement>("[data-map-selection-panel]");
    if (!panels?.length) return;
    const observer = new ResizeObserver(() => setSelectionPanelLayoutKey((current) => current + 1));
    panels.forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, [focusPoint, selectedPoint?.id]);

  useLayoutEffect(() => {
    if (!focusPoint || (!focusPoint.moveOnlyIfObscured && appliedFocusPointRef.current === focusPoint)
      || size.width <= 0 || size.height <= 0) return;
    const point = focusPoint.point;
    if (focusPoint.moveOnlyIfObscured && selectedPoint?.id !== point.id) return;
    const inset = point.subtype === "region" ? data.insets?.find((candidate) => candidate.id === point.regionId) : undefined;
    const region = point.subtype === "region" ? data.regions.find((candidate) => candidate.id === point.regionId) : undefined;
    const frame = point.subtype === "map-overview" ? data.bounds : inset?.bounds ?? region?.focusBounds;
    const zoom = focusPoint.preserveZoom ? viewRef.current.zoom : frame ? Math.min(ZOOM_RANGE.maximum,
      Math.max(1, size.width - 80) / Math.max(1, frame.maxX - frame.minX),
      Math.max(1, size.height - 120) / Math.max(1, frame.maxY - frame.minY),
    ) : getJumpZoom(viewRef.current.zoom, displayPreferencesRef.current);

    const mapRect = containerRef.current?.getBoundingClientRect();
    const selectionPanels = mapRect && point.subtype !== "region" && point.subtype !== "map-overview"
      ? [...(containerRef.current?.closest("[data-map-workspace]")?.querySelectorAll<HTMLElement>("[data-map-selection-panel]") ?? [])]
        .filter((panel) => panel.getClientRects().length > 0)
      : [];
    const panelRects = selectionPanels.map((panel) => panel.getBoundingClientRect());
    const panelRect = panelRects.reduce<DOMRect | null>((rightmost, rect) =>
      !rightmost || rect.right > rightmost.right ? rect : rightmost, null);
    const selectedMarkerRect = containerRef.current?.querySelector<HTMLElement>("[data-map-selected-marker]")?.getBoundingClientRect();
    const markerRadius = Math.max(21, (selectedMarkerRect?.width ?? 32) / 2 + 3);
    const tooltipRect = containerRef.current?.querySelector<HTMLElement>("[data-map-selected-tooltip]")?.getBoundingClientRect();
    const tooltipHalfWidth = (tooltipRect?.width ?? 0) / 2;
    if (focusPoint.moveOnlyIfObscured) {
      if (!mapRect || !panelRect) return;
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
      ? clamp(panelRect.right - mapRect.left + Math.max(SELECTION_PANEL_GAP_PX,
        tooltipHalfWidth + SELECTION_TOOLTIP_GAP_PX),
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
    selectionPanelLayoutKey, size.width, size.height]);

  useEffect(() => stopCameraAnimation, [stopCameraAnimation]);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
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
  const questGroupRef = useRef(onQuestGroup);
  useEffect(() => {
    selectPointRef.current = onSelectPoint;
    questGroupRef.current = onQuestGroup;
  }, [onSelectPoint, onQuestGroup]);
  const selectPoint = useCallback(
    (point: MapPoint | null, options?: { preserveZoom?: boolean }) => selectPointRef.current(point, options),
    [],
  );
  const selectQuestGroup = useCallback((group: MapQuestGroup) => questGroupRef.current(group), []);

  const zoomToOverlap = useCallback((point: MapPoint) => {
    const currentZoom = viewRef.current.zoom;
    const targetZoom = Math.min(ZOOM_RANGE.maximum, getMarkerOverlapZoom(currentZoom, PROJECTION));
    if (currentZoom >= targetZoom) return false;
    animateToView({
      centerX: point.x,
      centerY: point.y,
      zoom: targetZoom,
    });
    return true;
  }, [animateToView]);

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
    const worldAtPointer = screenToWorld(pointerX, pointerY, currentView, bounds.width, bounds.height, PROJECTION);
    const offsetAtNextZoom = screenToWorld(
      pointerX,
      pointerY,
      { centerX: 0, centerY: 0, zoom: nextZoom },
      bounds.width,
      bounds.height,
      PROJECTION,
    );
    const nextView = {
      centerX: clamp(worldAtPointer.x - offsetAtNextZoom.x, navigationBounds.minX, navigationBounds.maxX),
      centerY: clamp(worldAtPointer.y - offsetAtNextZoom.y, navigationBounds.minY, navigationBounds.maxY),
      zoom: nextZoom,
    };
    viewRef.current = nextView;
    setView(nextView);
  }, [navigationBounds, stopCameraAnimation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // The base map is drawn past the viewport on every side so the follow
  // camera's transform can never slide an undrawn edge into view. Manual
  // dragging uses the same guard band as the follow camera.
  const cameraOverscan = FOLLOW_OVERSCAN_PX;
  const overscanWidth = size.width > 0 ? size.width + cameraOverscan * 2 : 0;
  const overscanHeight = size.height > 0 ? size.height + cameraOverscan * 2 : 0;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const markerControl = target.closest("[data-map-marker-control]");
    if (!markerControl && target.closest("button, input, textarea, [data-map-ui]")) return;
    stopCameraAnimation();
    // Let marker controls keep the pointer for a click. Once the gesture moves
    // far enough, the viewport takes capture and turns it into a map pan.
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
    if (syncWorldOffset() >= FOLLOW_REBASE_PX) setView(nextView);
  }, [navigationBounds, size, syncWorldOffset]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const dragging = Boolean(drag && drag.pointerId === event.pointerId);
    let deltaX = 0;
    let deltaY = 0;
    if (drag && dragging) {
      deltaX = event.clientX - drag.x;
      deltaY = event.clientY - drag.y;
      if (Math.hypot(deltaX, deltaY) > 5) drag.moved = true;
      if (drag.moved && !panning) {
        setPanning(true);
        // A marker can disappear during culling. Capture on the stable viewport.
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      // Panning the map is a deliberate look-away, so follow mode turns itself
      // off rather than snapping the camera back on the next sample.
      if (drag.moved && !drag.stoppedFollow && followLivePosition) {
        drag.stoppedFollow = true;
        onToggleFollowLivePosition?.();
      }
      if (drag.moved) {
        drag.x = event.clientX;
        drag.y = event.clientY;
      } else {
        deltaX = 0;
        deltaY = 0;
      }
    }
    if (deltaX === 0 && deltaY === 0) return;
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

  const showAtlasBackdrop = !minimapMode && data.id === DEFAULT_MAP_ID;

  return (
    <div
      ref={containerRef}
      className={cn(
        "map-viewport",
        showAtlasBackdrop && "map-viewport-atlas",
        minimapMode && "map-viewport-minimap",
        controlsIntroVisible && "map-controls-intro-visible",
        placementMode && "cursor-crosshair",
      )}
      style={showAtlasBackdrop ? { "--game-page-image": `url("${WORLD_ATLAS_ARTWORK}")` } as CSSProperties
        : !minimapMode && data.backgroundColor ? { backgroundColor: data.backgroundColor } : undefined}
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
      <div
        className="map-scene absolute inset-0"
        style={minimapMode ? {
          backgroundColor: data.backgroundColor,
          opacity: displayPreferences.minimapOpacityPercent / 100,
        } : undefined}
      >
        {/* Everything with a world coordinate lives here. The live marker moves
            to the shared visual coordinate while this parent moves the camera to
            that same coordinate, so their transforms cancel exactly in follow. */}
        <div ref={worldRef} className="absolute inset-0 will-change-transform">
          <div className="absolute" style={{ inset: `${-cameraOverscan}px` }}>
            <MapTileLayer data={data} view={view} width={overscanWidth} height={overscanHeight}
              overscan={cameraOverscan} />
            <MapInsetLayer data={data} view={view} width={overscanWidth} height={overscanHeight} trackedInsetId={trackedInsetId} />
          </div>
          {!minimapMode && fishingLevelsVisible && data.id === FISHING_LEVEL_MAP_ID && (
            <MapFishingLevelLayer view={view} width={size.width} height={size.height} projection={PROJECTION} />
          )}
          <MapRouteLines mapId={data.id} points={data.locations}
            selectedPoint={selectedPoint} hiddenFlightRouteIds={hiddenFlightRouteIds}
            view={view} width={size.width} height={size.height}
            projection={PROJECTION} />
          <MapPlannedRoute points={gatheringRoute}
            dungeonRoutes={dungeonRouteVisible ? data.dungeonRoutes : undefined} view={view} width={size.width}
            height={size.height} projection={PROJECTION} />
          <MapMarkerLayer
            data={data}
            points={markerPoints}
            trackedQuestMarkerIds={trackedQuestMarkerIds}
            poiLabelPoints={poiLabelPoints}
            completedIds={completedIds}
            view={view}
            width={size.width}
            height={size.height}
            projection={PROJECTION}
            selectedPoint={visibleSelectedPoint}
            groupQuestMarkers={!minimapMode}
            clusterMarkers={displayPreferences.clusterMarkers}
            expandedClusterPointIds={expandedClusterPointIds}
            dismissFanKey={dismissFanKey}
            onSelect={selectPoint}
            onZoomToOverlap={zoomToOverlap}
            onCluster={openCluster}
            onQuestGroup={selectQuestGroup}
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
      </div>
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
      {!minimapMode && placementMode && <div className="map-placement-hint">{t("map.placementHint")}</div>}
      {!minimapMode && (
        <div id="map-lower-controls" hidden={!controlsExpanded}>
          {livePosition.position && (
            <MapLiveControls
              className="map-desktop-live-controls"
              followingLivePosition={followLivePosition}
              onToggleFollowLivePosition={onToggleFollowLivePosition}
              onCenterLivePosition={centerOnLivePosition}
            />
          )}
          <MapBottomControls
            zoom={view.zoom}
            projection={PROJECTION}
            onZoomIn={() => changeZoom(1.25)}
            onZoomOut={() => changeZoom(0.8)}
            placementMode={placementMode}
            onTogglePlacement={onTogglePlacement}
            dungeonRouteVisible={dungeonRouteVisible}
            onToggleDungeonRoute={data.dungeonRoutes?.length ? () => setDungeonRouteVisible((visible) => !visible) : undefined}
          />
        </div>
      )}
      {!minimapMode && fullscreenControl && (
        <div className="map-fullscreen-control" data-map-ui>
          {fullscreenControl}
        </div>
      )}
    </div>
  );
};

export default InteractiveMap;
