import type { MapView } from './types';

export const MAP_CAMERA_OVERSCAN_PX = 256;
export const MAP_CAMERA_SAFE_MARGIN_PX = MAP_CAMERA_OVERSCAN_PX - 32;

/** Top-down camera mapping, anchored at the surface's top-left corner. */
export function getCameraTransform(from: MapView, to: MapView, width: number, height: number) {
  const scale = to.zoom / from.zoom;
  return {
    scale,
    left: (from.centerX - to.centerX) * to.zoom + width * (1 - scale) / 2,
    top: (from.centerY - to.centerY) * to.zoom + height * (1 - scale) / 2,
  };
}

export function canPreviewCamera(transform: ReturnType<typeof getCameraTransform>, width: number, height: number) {
  const {left, top, scale} = transform;
  const margin = MAP_CAMERA_SAFE_MARGIN_PX;
  // Bound temporary raster enlargement; settled frames always redraw natively.
  return scale <= 1.35 && scale > 0
    && left - margin * scale <= 0 && top - margin * scale <= 0
    && left + (width + margin) * scale >= width
    && top + (height + margin) * scale >= height;
}
