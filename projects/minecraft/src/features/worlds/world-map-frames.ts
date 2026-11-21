import type { BiomeCanvasCursor, BiomeCanvasState } from "../generation/biome-canvas.ts";

/** Camera frames have their own subscribers; moving the map never rebuilds its panels. */
export const createWorldMapFrames = () => {
  let view: BiomeCanvasState | null = null;
  let cursor: Readonly<BiomeCanvasCursor> | null = null;
  const viewListeners = new Set<() => void>();
  const cursorListeners = new Set<() => void>();
  return {
    getView: () => view,
    getCursor: () => cursor,
    subscribeView(listener: () => void) {
      viewListeners.add(listener);
      return () => { viewListeners.delete(listener); };
    },
    subscribeCursor(listener: () => void) {
      cursorListeners.add(listener);
      return () => { cursorListeners.delete(listener); };
    },
    publishView(next: BiomeCanvasState) {
      if (view && view.x === next.x && view.z === next.z && view.zoom === next.zoom &&
        view.width === next.width && view.height === next.height && view.panning === next.panning && view.zooming === next.zooming) return;
      view = next;
      for (const listener of viewListeners) listener();
    },
    publishCursor(next: Readonly<BiomeCanvasCursor> | null) {
      if (cursor === next) return;
      cursor = next;
      for (const listener of cursorListeners) listener();
    },
  };
};

export type WorldMapFrames = ReturnType<typeof createWorldMapFrames>;

export const worldMapCameraTransform = (anchor: BiomeCanvasState, current: BiomeCanvasState) => {
  const scale = current.zoom / anchor.zoom;
  return {
    scale,
    x: current.width / 2 - anchor.width / 2 * scale + (anchor.x - current.x) * current.zoom,
    z: current.height / 2 - anchor.height / 2 * scale + (anchor.z - current.z) * current.zoom,
  };
};

/** Publish interaction boundaries and settled changes, rather than every raster repaint. */
export const shouldPublishWorldMapState = (previous: BiomeCanvasState | null, next: BiomeCanvasState) => {
  if (!previous ||
    previous.width !== next.width || previous.height !== next.height) return true;
  if (next.zooming) return false;
  if (previous.zooming || previous.panning !== next.panning || previous.zoom !== next.zoom) return true;
  if (next.panning) return false;
  // Follow motion is published to lightweight frame subscribers on every paint.
  // Rebase the full marker tree only after a substantial camera displacement.
  const cameraDistancePx = Math.hypot(next.x - previous.x, next.z - previous.z) * next.zoom;
  return cameraDistancePx >= 256 || previous.ready !== next.ready ||
    previous.total !== next.total || previous.scale !== next.scale || previous.error !== next.error ||
    previous.biomeIds.length !== next.biomeIds.length || previous.biomeIds.some((id, index) => id !== next.biomeIds[index]);
};
