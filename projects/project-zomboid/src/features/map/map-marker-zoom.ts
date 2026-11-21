import type { MapProjectionMode } from "./map-projection";

export type MapMarkerZoomTier = "overview" | "regional" | "detail";

/** Normalised zoom each tier starts at. Isometric zoom is scaled to match. */
export const MARKER_REGIONAL_ZOOM = 0.12;
export const MARKER_DETAIL_ZOOM = 0.45;
/** Matches the toolbar's rounded 3% readout; 3.5% is displayed as 4%. */
export const MARKER_CLUSTER_ZOOM = 0.035;

const ISOMETRIC_ZOOM_SCALE = 24;
const MARKER_SCALE_END_ZOOM = 1;
const MARKER_MAX_SCALE = 1.25;

export const getNormalizedMarkerZoom = (zoom: number, projection: MapProjectionMode) =>
  projection === "isometric" ? zoom / ISOMETRIC_ZOOM_SCALE : zoom;

/** Ground and upper floors let pins grow gently as individual buildings fill
 * the viewport. Underground floors opt out so their tight rooms stay clear. */
export const getMapMarkerScale = (
  zoom: number,
  projection: MapProjectionMode,
  growWithZoom: boolean,
  markerSizePercent = 100,
) => {
  const userScale = markerSizePercent / 100;
  if (!growWithZoom) return userScale;
  const normalizedZoom = getNormalizedMarkerZoom(zoom, projection);
  const progress = Math.min(1, Math.max(
    0,
    (normalizedZoom - MARKER_REGIONAL_ZOOM) / (MARKER_SCALE_END_ZOOM - MARKER_REGIONAL_ZOOM),
  ));
  return userScale * (1 + progress * (MARKER_MAX_SCALE - 1));
};

/** Inverse of {@link getNormalizedMarkerZoom}, for turning a tier back into a view zoom. */
export const getMarkerZoomFromNormalized = (
  normalizedZoom: number,
  projection: MapProjectionMode,
) => (projection === "isometric" ? normalizedZoom * ISOMETRIC_ZOOM_SCALE : normalizedZoom);

export const getMapMarkerZoomTier = (
  zoom: number,
  projection: MapProjectionMode,
): MapMarkerZoomTier => {
  const normalizedZoom = getNormalizedMarkerZoom(zoom, projection);
  if (normalizedZoom < MARKER_REGIONAL_ZOOM) return "overview";
  if (normalizedZoom < MARKER_DETAIL_ZOOM) return "regional";
  return "detail";
};

export const shouldClusterMapMarkers = (
  clusterMarkers: boolean,
  normalizedZoom: number,
) => clusterMarkers && normalizedZoom < MARKER_CLUSTER_ZOOM;
