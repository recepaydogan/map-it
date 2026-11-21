import { useCallback, useLayoutEffect, useRef } from 'react';
import { canPreviewCamera, getCameraTransform } from './map-camera-transform';
import { MARKER_CLUSTER_ZOOM } from './map-marker-zoom';
import type { MapView } from './types';

/** Reuse the rendered tiles and pins while a gesture is in flight. Commit at
 * the guard-band boundary or gesture end, then discard the temporary scale. */
export function useMapCameraPreview(view: MapView, size: {width:number; height:number},
  commit: (view: MapView) => void, enabled: boolean) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef({view, size, enabled});
  const pendingRef = useRef<MapView | null>(null);
  const committedRef = useRef(view);
  const apply = useCallback((next: MapView) => {
    const surface = surfaceRef.current;
    const rendered = renderedRef.current;
    if (!rendered.enabled || !surface) return false;
    const {width, height} = rendered.size;
    const transform = getCameraTransform(rendered.view, next, width, height);
    // Overview zoom keeps pins at a fixed size. Commit the camera directly
    // so the shared surface cannot briefly stretch them between wheel ticks.
    if (transform.scale !== 1 && Math.max(rendered.view.zoom, next.zoom) <= MARKER_CLUSTER_ZOOM) return false;
    if (!canPreviewCamera(transform, width, height)) return false;
    surface.style.transform = `translate3d(${transform.left}px, ${transform.top}px, 0) scale(${transform.scale})`;
    return true;
  }, []);
  const finishPreview = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || pending === committedRef.current) return;
    committedRef.current = pending;
    commit(pending);
  }, [commit]);
  const showView = useCallback((next: MapView, settled = false) => {
    pendingRef.current = next;
    if (!apply(next) || settled) finishPreview();
  }, [apply, finishPreview]);
  useLayoutEffect(() => {
    renderedRef.current = {view, size, enabled};
    if (!enabled || pendingRef.current === view) pendingRef.current = null;
    if (pendingRef.current && apply(pendingRef.current)) return;
    if (surfaceRef.current) surfaceRef.current.style.transform = '';
  }, [apply, enabled, finishPreview, size, view]);
  return {surfaceRef, showView, finishPreview};
}
