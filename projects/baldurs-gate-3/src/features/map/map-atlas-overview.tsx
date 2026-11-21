import { Minus, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { getMapPointInstanceId } from "./map-atlas-projection";
import { animateMapCamera } from "./map-camera-animation";
import MapAtlasLabelLayer from "./map-atlas-label-layer";
import MapAtlasMapImage from "./map-atlas-map-image";
import type { MapPointCluster } from "./map-clustering";
import { getMapJumpZoom } from "./map-jump-zoom";
import MapMarkerLayer from "./map-marker-layer";
import { zoomMapAtPointer, type MapProjectionMode, type MapScreenPoint } from "./map-projection";
import type { MapAtlasDefinition, MapDefinition } from "./map-registry";
import type { MapMetadata, MapPoint } from "./types";
import { MAP_CAMERA_OVERSCAN_PX, useMapCameraPreview } from "./use-map-camera-preview";
import { useMapDisplayPreferences } from "./use-map-display-preferences";
import { useMapWheelZoom } from "./use-map-wheel-zoom";

interface AtlasConnection {
  endpoints: readonly [{ mapId: string }, { mapId: string }];
}

interface MapAtlasOverviewProps {
  atlas: MapAtlasDefinition;
  maps: MapDefinition[];
  connections: AtlasConnection[];
  points: MapPoint[];
  selectedMapId: string;
  selectedPoint: MapPoint | null;
  focusPoint: MapPoint | null;
  onSelectPoint: (point: MapPoint | null) => void;
}

interface AtlasView {
  centerX: number;
  centerY: number;
  zoom: number;
}

/** Returning to an atlas restores its camera rather than fitting it again. */
const rememberedAtlasViews = new Map<string, AtlasView>();

const PROJECTION: MapProjectionMode = "top";
const MINIMUM_ZOOM = 0.05;
const MAXIMUM_ZOOM = 3;
const FIT_PADDING = 96;
const SELECTION_ZOOM_FLOOR = 0.48;
const EMPTY_POINT_IDS: string[] = [];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const fitAtlas = (atlas: MapAtlasDefinition, width: number, height: number): AtlasView => ({
  centerX: atlas.width / 2,
  centerY: atlas.height / 2,
  zoom: width > 0 && height > 0
    ? clamp(
      Math.min(
        Math.max(1, width - FIT_PADDING * 2) / atlas.width,
        Math.max(1, height - FIT_PADDING * 2) / atlas.height,
      ),
      MINIMUM_ZOOM,
      MAXIMUM_ZOOM,
    )
    : MINIMUM_ZOOM,
});

/** One interactive world surface with native-resolution tiles. Markers retain
 * their original map identity so details, saves and connections keep working. */
const MapAtlasOverview = ({
  atlas,
  maps,
  connections,
  points,
  selectedMapId,
  selectedPoint,
  focusPoint,
  onSelectPoint,
}: MapAtlasOverviewProps) => {
  const { t } = useTranslation();
  const { preferences } = useMapDisplayPreferences();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initializedAtlasRef = useRef<MapAtlasDefinition | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const pendingPanRef = useRef({ x: 0, y: 0 });
  const panFrameRef = useRef<number | null>(null);
  const suppressMarkerClickRef = useRef(false);
  const appliedFocusPointRef = useRef<MapPoint | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<AtlasView>(() => fitAtlas(atlas, 0, 0));
  const viewRef = useRef(view);
  const cancelCameraRef = useRef<(() => void) | null>(null);
  const stopCameraAnimation = useCallback(() => {
    cancelCameraRef.current?.();
    cancelCameraRef.current = null;
  }, []);
  useEffect(() => stopCameraAnimation, [atlas.id, stopCameraAnimation]);
  const [markerFanAnchorId, setMarkerFanAnchorId] = useState<string | null>(null);
  const mapsById = useMemo(() => new Map(maps.map((map) => [map.id, map])), [maps]);
  const placementsByMapId = useMemo(
    () => new Map(atlas.placements.map((placement) => [placement.mapId, placement])),
    [atlas.placements],
  );
  const markerData = useMemo<MapMetadata>(() => ({
    id: `atlas:${atlas.id}`,
    displayName: atlas.name,
    schemaVersion: 1,
    bounds: { minX: 0, minY: 0, maxX: atlas.width, maxY: atlas.height },
    tileSize: 256,
    detailLevels: [0],
    regions: [],
    locations: [],
    content: { schemaVersion: 1, entities: {}, relationships: [] },
    tileSource: { basePath: "", tilePattern: "" },
  }), [atlas.height, atlas.id, atlas.name, atlas.width]);
  const atlasConnections = useMemo(() => {
    const pairs = new Map<string, { from: string; to: string; count: number }>();
    for (const connection of connections) {
      const [from, to] = connection.endpoints.map(({ mapId }) => mapId);
      if (from === to || !placementsByMapId.has(from) || !placementsByMapId.has(to)) continue;
      const [left, right] = [from, to].sort((a, b) => a.localeCompare(b, "en"));
      const key = `${left}:${right}`;
      const current = pairs.get(key);
      if (current) current.count += 1;
      else pairs.set(key, { from: left, to: right, count: 1 });
    }
    return [...pairs.values()];
  }, [connections, placementsByMapId]);

  const commitView = useCallback((next: AtlasView) => {
    viewRef.current = next;
    rememberedAtlasViews.set(atlas.id, next);
    setView(next);
  }, [atlas.id]);
  const { surfaceRef, showView, finishPreview } = useMapCameraPreview(view, size, PROJECTION, commitView);

  // Pointer events can arrive much faster than painted frames. Apply their
  // accumulated displacement once per frame, including the final pointer-up.
  const flushPan = useCallback(() => {
    panFrameRef.current = null;
    const delta = pendingPanRef.current;
    pendingPanRef.current = { x: 0, y: 0 };
    if (delta.x === 0 && delta.y === 0) return;
    const current = viewRef.current;
    commitView({ ...current,
      centerX: clamp(current.centerX - delta.x / current.zoom, 0, atlas.width),
      centerY: clamp(current.centerY - delta.y / current.zoom, 0, atlas.height) });
  }, [atlas.height, atlas.width, commitView]);

  useEffect(() => () => {
    if (panFrameRef.current !== null) window.cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    pendingPanRef.current = { x: 0, y: 0 };
    dragRef.current = null;
  }, [atlas.id]);

  const animateToView = useCallback((target: AtlasView) => {
    stopCameraAnimation();
    cancelCameraRef.current = animateMapCamera(viewRef.current, target, (next, settled) => {
      viewRef.current = next;
      showView(next, settled);
    });
  }, [showView, stopCameraAnimation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const nextSize = { width: entry.contentRect.width, height: entry.contentRect.height };
      // Hidden pages report zero size. Fit once per atlas, not whenever the
      // user opens a panel, resizes the window or returns from another page.
      if (nextSize.width <= 0 || nextSize.height <= 0) return;
      if (initializedAtlasRef.current !== atlas) {
        initializedAtlasRef.current = atlas;
        const nextView = rememberedAtlasViews.get(atlas.id) ?? fitAtlas(atlas, nextSize.width, nextSize.height);
        viewRef.current = nextView;
        setView(nextView);
      }
      setSize(nextSize);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [atlas]);

  useEffect(() => {
    if (!focusPoint || appliedFocusPointRef.current === focusPoint
      || initializedAtlasRef.current !== atlas || size.width <= 0 || size.height <= 0) return;
    const mapPlacement = focusPoint.id.startsWith("map-focus:") && focusPoint.mapId
      ? placementsByMapId.get(focusPoint.mapId)
      : undefined;
    const nextView = mapPlacement ? (() => {
      const horizontalRoom = Math.max(1, size.width - FIT_PADDING * 2);
      const verticalRoom = Math.max(1, size.height - FIT_PADDING * 2);
      return {
        centerX: mapPlacement.x + mapPlacement.width / 2,
        centerY: mapPlacement.y + mapPlacement.height / 2,
        zoom: clamp(
          Math.min(horizontalRoom / mapPlacement.width, verticalRoom / mapPlacement.height),
          SELECTION_ZOOM_FLOOR,
          MAXIMUM_ZOOM,
        ),
      };
    })() : {
      centerX: focusPoint.x,
      centerY: focusPoint.y,
      zoom: getMapJumpZoom(viewRef.current.zoom, preferences, MAXIMUM_ZOOM),
    };
    const frame = window.requestAnimationFrame(() => {
      appliedFocusPointRef.current = focusPoint;
      animateToView(nextView);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [atlas, animateToView, focusPoint, placementsByMapId, preferences, size]);

  const changeZoom = useCallback((multiplier: number) => {
    setMarkerFanAnchorId(null);
    const current = viewRef.current;
    animateToView({ ...current, zoom: clamp(current.zoom * multiplier, MINIMUM_ZOOM, MAXIMUM_ZOOM) });
  }, [animateToView]);

  const zoomAtPointer = useCallback((multiplier: number, pointer: MapScreenPoint, width: number, height: number) => {
    const current = viewRef.current;
    const nextZoom = clamp(current.zoom * multiplier, MINIMUM_ZOOM, MAXIMUM_ZOOM);
    if (nextZoom === current.zoom) return;
    stopCameraAnimation();
    setMarkerFanAnchorId(null);
    const next = zoomMapAtPointer(current, nextZoom, pointer, width, height, PROJECTION);
    viewRef.current = next;
    showView(next);
  }, [showView, stopCameraAnimation]);
  useMapWheelZoom(containerRef, zoomAtPointer, finishPreview);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-map-ui]")) return;
    stopCameraAnimation();
    finishPreview();
    if (!(event.target as HTMLElement).closest("[data-map-marker-control]")) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 2) drag.moved = true;
    if (!drag.moved) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    pendingPanRef.current.x += deltaX;
    pendingPanRef.current.y += deltaY;
    panFrameRef.current ??= window.requestAnimationFrame(flushPan);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panFrameRef.current !== null) {
      window.cancelAnimationFrame(panFrameRef.current);
      flushPan();
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if ((event.target as HTMLElement).closest("[data-map-marker-control]")) {
      if (drag?.moved) {
        suppressMarkerClickRef.current = true;
        window.setTimeout(() => { suppressMarkerClickRef.current = false; }, 0);
      }
      return;
    }
    if (drag && !drag.moved) {
      setMarkerFanAnchorId(null);
      onSelectPoint(null);
    }
  };

  const openCluster = useCallback((cluster: MapPointCluster) => {
    setMarkerFanAnchorId(null);
    animateToView({
      centerX: cluster.x,
      centerY: cluster.y,
      zoom: clamp(Math.max(viewRef.current.zoom * 1.8, 0.7), MINIMUM_ZOOM, MAXIMUM_ZOOM),
    });
  }, [animateToView]);

  const offsetX = size.width / 2 - view.centerX * view.zoom;
  const offsetY = size.height / 2 - view.centerY * view.zoom;
  const zoomPercentage = Math.round(view.zoom * 100);

  return (
    <div
      ref={containerRef}
      className="map-atlas-viewport"
      role="application"
      aria-label={atlas.name}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        if (panFrameRef.current !== null) window.cancelAnimationFrame(panFrameRef.current);
        panFrameRef.current = null;
        pendingPanRef.current = { x: 0, y: 0 };
      }}
      onClickCapture={(event) => {
        if (!suppressMarkerClickRef.current) return;
        event.preventDefault(); event.stopPropagation();
        suppressMarkerClickRef.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "+" || event.key === "=") changeZoom(1.2);
        if (event.key === "-") changeZoom(0.84);
      }}
    >
      <div ref={surfaceRef} className="map-camera-surface absolute inset-0">
        <div
          className="map-atlas-stage"
          style={{
            width: atlas.width,
            height: atlas.height,
            transform: `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${view.zoom})`,
          }}
        >
          <svg className="map-atlas-connections" viewBox={`0 0 ${atlas.width} ${atlas.height}`} aria-hidden="true">
            {atlasConnections.map(({ from, to, count }) => {
              const source = placementsByMapId.get(from)!;
              const target = placementsByMapId.get(to)!;
              return (
                <line
                  key={`${from}:${to}`}
                  x1={source.x + source.width / 2}
                  y1={source.y + source.height / 2}
                  x2={target.x + target.width / 2}
                  y2={target.y + target.height / 2}
                  className={count > 1 ? "map-atlas-connection-strong" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        </div>
        {atlas.placements.map((placement) => {
          const map = mapsById.get(placement.mapId);
          const rectangle = {
            left: offsetX + placement.x * view.zoom,
            top: offsetY + placement.y * view.zoom,
            width: placement.width * view.zoom,
            height: placement.height * view.zoom,
          };
          const margin = MAP_CAMERA_OVERSCAN_PX;
          if (!map || size.width <= 0 || size.height <= 0
            || rectangle.left >= size.width + margin || rectangle.top >= size.height + margin
            || rectangle.left + rectangle.width <= -margin || rectangle.top + rectangle.height <= -margin) return null;
          return <MapAtlasMapImage key={map.id} map={map} rectangle={rectangle} viewport={size}
            overscan={margin} selected={map.id === selectedMapId} />;
        })}
        <MapAtlasLabelLayer
          atlas={atlas}
          maps={maps}
          selectedMapId={selectedMapId}
          viewport={size}
          offsetX={offsetX}
          offsetY={offsetY}
          zoom={view.zoom}
        />
        <MapMarkerLayer
          data={markerData}
          points={points}
          view={view}
          width={size.width}
          height={size.height}
          projection={PROJECTION}
          selectedInstanceId={selectedPoint ? getMapPointInstanceId(selectedPoint) : null}
          clusterMarkers={preferences.clusterMarkers}
          aggregateClusterCategories={view.zoom < 0.9}
          compactMarkers
          forceClusters={preferences.clusterMarkers && view.zoom < 0.9}
          clusterZoomScale={0.35}
          expandedClusterPointIds={EMPTY_POINT_IDS}
          markerFanAnchorId={markerFanAnchorId}
          onSelect={onSelectPoint}
          onCluster={openCluster}
          onMarkerFanChange={setMarkerFanAnchorId}
        />
      </div>
      <div className="map-vignette" aria-hidden="true" />
      <div className="map-atlas-zoom" data-map-ui role="group" aria-label={t("map.controls.zoomControls")}>
        <button type="button" onClick={() => changeZoom(0.84)} aria-label={t("map.controls.zoomOut")} title={t("map.controls.zoomOut")}>
          <Minus size={15} aria-hidden="true" />
        </button>
        <output aria-label={t("map.controls.zoomLevel", { value: zoomPercentage })}>{zoomPercentage}%</output>
        <button type="button" onClick={() => changeZoom(1.2)} aria-label={t("map.controls.zoomIn")} title={t("map.controls.zoomIn")}>
          <Plus size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default MapAtlasOverview;
