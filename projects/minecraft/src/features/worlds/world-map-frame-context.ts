import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { BiomeCanvasCursor, BiomeCanvasState } from "../generation/biome-canvas";
import { worldMapCameraTransform, type WorldMapFrames } from "./world-map-frames";

export const WorldMapFrameContext = createContext<WorldMapFrames | null>(null);
const subscribeNone = () => () => {};
const noView = () => null;
const noCursor = () => null;

/** Only small moving overlays subscribe to the camera, never the map workspace. */
export const useWorldMapFrameView = (fallback: BiomeCanvasState | null) => {
  const frames = useContext(WorldMapFrameContext);
  return useSyncExternalStore(frames?.subscribeView ?? subscribeNone, frames?.getView ?? noView) ?? fallback;
};

export const useWorldMapFrameCursor = (fallback: Readonly<BiomeCanvasCursor> | null) => {
  const frames = useContext(WorldMapFrameContext);
  const cursor = useSyncExternalStore(frames?.subscribeCursor ?? subscribeNone, frames?.getCursor ?? noCursor);
  return frames ? cursor : fallback;
};

/** Move the existing marker artwork as one layer without changing its styles. */
export const useWorldMapCameraTransform = (anchor: BiomeCanvasState | null, active: boolean) => {
  const frames = useContext(WorldMapFrameContext);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer || !anchor || !active) return;
    const move = () => {
      const current = frames?.getView() ?? anchor;
      const { x, z, scale } = worldMapCameraTransform(anchor, current);
      layer.style.transform = `translate3d(${x}px, ${z}px, 0) scale(${scale})`;
      layer.style.setProperty("--world-map-marker-inverse-scale", String(1 / scale));
    };
    move();
    return frames?.subscribeView(move);
  }, [active, anchor, frames]);
  return ref;
};
