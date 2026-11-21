import { useCallback, useLayoutEffect, useRef } from "react";
import { coversMapViewport, getMapCameraTransform, type MapProjectionMode } from "./map-projection";
import type { MapView } from "./types";

/** Shared guard band for tiles and markers while the drawn surface is scaled. */
export const MAP_CAMERA_OVERSCAN_PX = 128;

interface ViewportSize {
  width: number;
  height: number;
}

export const useMapCameraPreview = (
  view: MapView,
  size: ViewportSize,
  projection: MapProjectionMode,
  commit: (view: MapView) => void,
  enabled = true,
) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef({ view, size, enabled });
  const pendingRef = useRef<MapView | null>(null);
  const committedRef = useRef(view);

  const applyPreview = useCallback((next: MapView) => {
    const surface = surfaceRef.current;
    const rendered = renderedRef.current;
    if (!rendered.enabled || !surface) return false;
    const { width, height } = rendered.size;
    const transform = getMapCameraTransform(rendered.view, next, width, height, projection);
    // Rebase before the guard band runs out or pins are noticeably enlarged.
    if (transform.scale > 1.5 || !coversMapViewport(transform, width, height, MAP_CAMERA_OVERSCAN_PX)) return false;
    const { left, top, scale } = transform;
    surface.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${scale})`;
    return true;
  }, [projection]);

  const finishPreview = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || pending === committedRef.current) return;
    committedRef.current = pending;
    commit(pending);
  }, [commit]);

  const showView = useCallback((next: MapView, settled = false) => {
    pendingRef.current = next;
    if (!applyPreview(next) || settled) finishPreview();
  }, [applyPreview, finishPreview]);

  useLayoutEffect(() => {
    const didCommit = renderedRef.current.view !== view;
    renderedRef.current = { view, size, enabled };
    const pending = pendingRef.current;
    if (!enabled) finishPreview();
    if (!enabled || pending === view || (didCommit && pending === committedRef.current)) pendingRef.current = null;
    // A wheel event may arrive while React is committing an earlier view.
    // Keep its transform relative to the newly drawn pixels before paint.
    if (pendingRef.current && applyPreview(pendingRef.current)) return;
    if (surfaceRef.current) surfaceRef.current.style.transform = "";
  }, [applyPreview, enabled, finishPreview, size, view]);

  return { surfaceRef, showView, finishPreview };
};
