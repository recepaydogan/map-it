import type { MapIsometricManifest } from "./map-isometric-types";

export const getIsometricOverlayPlacement = (
  base: MapIsometricManifest,
  overlay: MapIsometricManifest,
) => ({
  x: (base.mapInfo.x0 - overlay.mapInfo.x0) / base.mapInfo.w,
  y: (base.mapInfo.y0 - overlay.mapInfo.y0) / base.mapInfo.w,
  width: overlay.mapInfo.w / base.mapInfo.w,
});
