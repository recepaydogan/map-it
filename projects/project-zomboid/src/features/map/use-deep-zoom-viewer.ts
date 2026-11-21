import type OpenSeadragon from "openseadragon";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getIsometricCameraFloor,
  isometricImageToWorld,
  mapZoomToImageZoom,
  worldToIsometricImage,
} from "./map-isometric-coordinates";
import { isIsometricTileCovered } from "./map-isometric-tile-coverage";
import { getIsometricPyramidMaximumLevel } from "./map-isometric-tile-ranges";
import { getIsometricOverlayPlacement } from "./map-isometric-overlay";
import type { MapIsometricManifest } from "./map-isometric-types";
import type { MapView } from "./types";
import { areWantedDeepZoomLayersReady } from "./deep-zoom-loading-state";
import {
  installDeepZoomFrameScheduler,
  wakeDeepZoomFrames,
} from "./deep-zoom-frame-scheduler";
import { getWantedIsometricFloorLayers } from "./map-isometric-floor-layers";
import type { MapIsometricFloor } from "./map-isometric-types";

interface UseDeepZoomViewerOptions {
  source: MapIsometricManifest;
  overlays?: MapIsometricManifest[];
  floor: number;
  view: MapView;
  width: number;
  height: number;
  onSourceError?: () => void;
}

interface DeepZoomLayerSlot {
  source: MapIsometricManifest;
  floor: number;
  order: number;
  overlay: boolean;
  item: OpenSeadragon.TiledImage | null;
  status: "loading" | "ready";
}

const isBaseTileCoveredByOverlay = (
  source: MapIsometricManifest,
  floor: MapIsometricManifest["floors"][number],
  level: number,
  tileX: number,
  tileY: number,
  overlays: MapIsometricManifest[],
) => {
  if (overlays.length === 0) return false;
  const maximumLevel = getIsometricPyramidMaximumLevel(floor);
  const levelScale = 2 ** (maximumLevel - level);
  const left = tileX * floor.tileSize * levelScale;
  const top = tileY * floor.tileSize * levelScale;
  const right = Math.min(floor.width, (tileX + 1) * floor.tileSize * levelScale);
  const bottom = Math.min(floor.height, (tileY + 1) * floor.tileSize * levelScale);
  const worldCorners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ].map((point) => isometricImageToWorld(point, floor.floor, source.mapInfo));

  return overlays.some((overlay) => overlay.floors.some(({ floor: overlayFloor }) => overlayFloor === floor.floor)
    && overlay.mapInfo.cell_rects?.some(([cellX, cellY, cellWidth, cellHeight]) => {
    const cellSize = overlay.mapInfo.cell_size;
    const minimumX = cellX * cellSize;
    const minimumY = cellY * cellSize;
    const maximumX = (cellX + cellWidth) * cellSize;
    const maximumY = (cellY + cellHeight) * cellSize;
    return worldCorners.every(({ x, y }) =>
      x >= minimumX && x <= maximumX && y >= minimumY && y <= maximumY);
  })) ?? false;
};

const createTileSource = (
  source: MapIsometricManifest,
  floor: MapIsometricFloor,
  layerName: string,
  excludedOverlays: MapIsometricManifest[] = [],
) => {
  if (source.tileSourceKind !== "direct") return `${source.basePath}/${layerName}.dzi`;
  return {
    width: floor.width,
    height: floor.height,
    tileSize: floor.tileSize,
    tileOverlap: 0,
    minLevel: floor.levels[0] ?? 0,
    maxLevel: getIsometricPyramidMaximumLevel(floor),
    tileExists: (level: number, x: number, y: number) =>
      isIsometricTileCovered(source, floor, level, x, y)
      && !isBaseTileCoveredByOverlay(source, floor, level, x, y, excludedOverlays),
    getTileUrl: (level: number, x: number, y: number) =>
      `${source.basePath}/${layerName}_files/${level}/${x}_${y}.${floor.format}`,
  };
};

const getLayerKey = (source: MapIsometricManifest, layerName: string) => `${source.id}:${layerName}`;

const getPlacement = (base: MapIsometricManifest, candidate: MapIsometricManifest) => {
  if (candidate.id === base.id) return { x: 0, y: 0, width: 1 };
  return getIsometricOverlayPlacement(base, candidate);
};

export const useDeepZoomViewer = ({
  source,
  overlays = [],
  floor,
  view,
  width,
  height,
  onSourceError,
}: UseDeepZoomViewerOptions) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const layersRef = useRef(new Map<string, DeepZoomLayerSlot>());
  const wantedLayersRef = useRef(new Set<string>());
  const viewRef = useRef(view);
  const floorRef = useRef(floor);
  const sourceFailureReportedRef = useRef(false);
  const visibleTileLoadedRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [viewerGeneration, setViewerGeneration] = useState(0);

  const markReadyWhenVisibleLayersAreAttached = useCallback(() => {
    if (areWantedDeepZoomLayersReady(
      visibleTileLoadedRef.current,
      wantedLayersRef.current,
      layersRef.current,
    )) setStatus("ready");
  }, []);

  const applyCamera = useCallback(() => {
    const viewer = viewerRef.current;
    const visibleSlots = [...layersRef.current.values()].filter(({ item }) => item);
    const cameraFloor = getIsometricCameraFloor(floorRef.current);
    const cameraSlot = visibleSlots.find((slot) => slot.floor === cameraFloor && !slot.overlay)
      ?? visibleSlots.find((slot) => slot.floor === cameraFloor)
      ?? visibleSlots.find(({ overlay }) => !overlay)
      ?? visibleSlots[0];
    if (!viewer || !cameraSlot?.item || width <= 0 || height <= 0) return;
    wakeDeepZoomFrames();
    const currentView = viewRef.current;
    const imageCenter = worldToIsometricImage(
      { x: currentView.centerX, y: currentView.centerY },
      cameraSlot.floor,
      cameraSlot.source.mapInfo,
    );
    const viewportCenter = cameraSlot.item.imageToViewportCoordinates(imageCenter.x, imageCenter.y);
    const viewportZoom = cameraSlot.item.imageToViewportZoom(
      mapZoomToImageZoom(currentView.zoom, cameraSlot.source.mapInfo),
    );
    viewer.viewport.zoomTo(viewportZoom, undefined, true);
    viewer.viewport.panTo(viewportCenter, true);
    viewer.viewport.applyConstraints(true);
  }, [height, width]);

  const reorderLayers = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let index = 0;
    const orderedLayers = [...layersRef.current.values()]
      .sort((left, right) => left.floor - right.floor || left.order - right.order);
    for (const { item } of orderedLayers) {
      if (!item) continue;
      if (viewer.world.getIndexOfItem(item) !== index) viewer.world.setItemIndex(item, index);
      index += 1;
    }
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const layers = layersRef.current;
    const wantedLayers = wantedLayersRef.current;
    let loadedTiles = 0;
    let failedTiles = 0;
    let disposed = false;
    let sourceHealthTimer: ReturnType<typeof setTimeout> | undefined;
    sourceFailureReportedRef.current = false;
    visibleTileLoadedRef.current = false;
    const reportSourceFailure = () => {
      if (sourceFailureReportedRef.current) return;
      sourceFailureReportedRef.current = true;
      onSourceError?.();
    };
    setStatus("loading");
    void import("openseadragon")
      .then(({ default: createViewer }) => {
        if (disposed) return;
        installDeepZoomFrameScheduler(createViewer);
        wakeDeepZoomFrames();
        const viewer = createViewer({
          element,
          tileSources: [],
          // Overwolf renders this window through software OSR. A large canvas
          // is re-presented at the game frame rate even after OpenSeadragon is
          // idle, starving the live-position overlay that shares the renderer.
          // The HTML drawer keeps the same viewport/tile machinery but lets
          // Chromium composite the individual tile images, like the atlas map.
          drawer: "html",
          showNavigationControl: false,
          mouseNavEnabled: false,
          keyboardNavEnabled: false,
          homeFillsViewer: false,
          constrainDuringPan: false,
          visibilityRatio: 0,
          minZoomImageRatio: 0.01,
          maxZoomPixelRatio: 2 * (source.mapInfo.scale || 1),
          animationTime: 0.3,
          springStiffness: 10,
          // Match the 200ms per-tile reveal used by the Elden Ring map. This
          // blends only opacity and leaves camera transforms untouched.
          blendTime: 0.2,
          immediateRender: true,
          // Two, not four: tiles decode ON THE MAIN THREAD as they are first
          // drawn, tens of milliseconds each, and four in one frame is a
          // visible hitch every time a drag pulls fresh tiles into view.
          maxTilesPerFrame: 2,
          maxImageCacheCount: 320,
          imageLoaderLimit: 8,
          crossOriginPolicy: source.tileSourceKind === "direct" ? false : "Anonymous",
          tileRetryMax: 2,
          tileRetryDelay: 3_000,
          preserveViewport: true,
        });
        const isSourceHealthItem = (candidate: OpenSeadragon.TiledImage | undefined) => {
          const visibleSlots = [...layers.entries()]
            .filter(([key]) => wantedLayers.has(key));
          const hasBaseLayer = visibleSlots.some(([, slot]) => !slot.overlay);
          return visibleSlots.some(([, slot]) => slot.item === candidate && (!hasBaseLayer || !slot.overlay));
        };
        viewer.addHandler("tile-loaded", (event) => {
          wakeDeepZoomFrames();
          const tiledImage = (event as unknown as { tiledImage?: OpenSeadragon.TiledImage }).tiledImage;
          const loadedSlot = [...layers.values()].find(({ item }) => item === tiledImage);
          if (!loadedSlot) return;
          visibleTileLoadedRef.current = true;
          markReadyWhenVisibleLayersAreAttached();
          if (isSourceHealthItem(tiledImage)) {
            loadedTiles += 1;
            if (sourceHealthTimer) clearTimeout(sourceHealthTimer);
            element.dataset.loadedTiles = String(loadedTiles);
          }
        });
        viewer.addHandler("tile-load-failed", (event) => {
          if (!isSourceHealthItem((event as unknown as { tiledImage?: OpenSeadragon.TiledImage }).tiledImage)) return;
          failedTiles += 1;
          element.dataset.failedTiles = String(failedTiles);
          if (source.tileSourceKind === "direct" && loadedTiles === 0 && failedTiles >= 3) {
            reportSourceFailure();
          }
        });
        if (source.tileSourceKind === "direct") {
          sourceHealthTimer = setTimeout(() => {
            if (loadedTiles === 0) reportSourceFailure();
          }, 15_000);
        }
        viewerRef.current = viewer;
        setViewerGeneration((current) => current + 1);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        console.error("OpenSeadragon failed to initialize.", error);
        setStatus("error");
        reportSourceFailure();
      });
    return () => {
      disposed = true;
      if (sourceHealthTimer) clearTimeout(sourceHealthTimer);
      viewerRef.current?.destroy();
      viewerRef.current = null;
      layers.clear();
      wantedLayers.clear();
    };
  }, [markReadyWhenVisibleLayersAreAttached, onSourceError, source.basePath, source.id, source.mapInfo.scale, source.tileSourceKind]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const sources = [source, ...overlays];
    const overlayCoverageKey = overlays.map(({ id }) => id).join(",");
    const wantedDefinitions = sources.flatMap((candidate, sourceIndex) =>
      getWantedIsometricFloorLayers(candidate, floor).map(({ definition, floor: floorNumber, layerName }) => ({
        source: candidate,
        definition,
        floor: floorNumber,
        layerName,
        order: sourceIndex,
        overlay: sourceIndex > 0,
        // The array is low-to-high render priority. A lower layer must not
        // leak through cells owned by any map above it.
        excludedOverlays: sourceIndex === 0 ? overlays : overlays.slice(sourceIndex),
        key: `${getLayerKey(candidate, layerName)}:coverage:${overlayCoverageKey}:${sourceIndex}`,
      })));
    const wantedLayers = new Set(wantedDefinitions.map(({ key }) => key));
    wantedLayersRef.current = wantedLayers;
    const hasNewVisibleLayer = wantedDefinitions.some(({ key }) => !layersRef.current.has(key));
    if (hasNewVisibleLayer) {
      visibleTileLoadedRef.current = false;
      setStatus("loading");
    }

    for (const [key, slot] of layersRef.current) {
      if (wantedLayers.has(key)) continue;
      if (slot.item) viewer.world.removeItem(slot.item);
      layersRef.current.delete(key);
    }

    for (const definition of wantedDefinitions) {
      const {
        source: candidate,
        definition: floorDefinition,
        floor: floorNumber,
        layerName,
        key,
        order,
        overlay,
        excludedOverlays,
      } = definition;
      if (layersRef.current.has(key)) continue;
      layersRef.current.set(key, { source: candidate, floor: floorNumber, order, overlay, item: null, status: "loading" });
      const placement = getPlacement(source, candidate);
      viewer.addTiledImage({
        tileSource: createTileSource(
          candidate,
          floorDefinition,
          layerName,
          excludedOverlays,
        ),
        x: placement.x,
        y: placement.y,
        width: placement.width,
        opacity: 1,
        success: (event) => {
          const { item } = event as unknown as OpenSeadragon.AddItemWorldEvent;
          const slot = layersRef.current.get(key);
          if (!slot || !wantedLayersRef.current.has(key)) {
            viewer.world.removeItem(item);
            return;
          }
          slot.item = item;
          slot.status = "ready";
          reorderLayers();
          applyCamera();
          markReadyWhenVisibleLayersAreAttached();
        },
        error: () => {
          layersRef.current.delete(key);
          if (overlay) {
            console.error(`Prepared map overlay ${candidate.id} floor ${floorNumber} could not be loaded.`);
            wantedLayersRef.current.delete(key);
            markReadyWhenVisibleLayersAreAttached();
          } else {
            setStatus("error");
          }
          if (!overlay && !sourceFailureReportedRef.current) {
            sourceFailureReportedRef.current = true;
            onSourceError?.();
          }
        },
      });
    }
    reorderLayers();
    applyCamera();
  }, [applyCamera, floor, markReadyWhenVisibleLayersAreAttached, onSourceError, overlays, reorderLayers, source, viewerGeneration]);

  useEffect(() => {
    viewRef.current = view;
    floorRef.current = floor;
    applyCamera();
  }, [applyCamera, floor, view]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || width <= 0 || height <= 0) return;
    viewer.forceResize();
    applyCamera();
  }, [applyCamera, height, width]);

  return { elementRef, status };
};
