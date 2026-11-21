import type { MapProjectionMode } from "./map-projection";

export type MapMarkerZoomTier = "overview" | "regional" | "detail";

/** Normalised zoom each tier starts at. Isometric zoom is scaled to match. */
export const MARKER_REGIONAL_ZOOM = 0.12;
export const MARKER_DETAIL_ZOOM = 0.45;
/** Matches the toolbar's rounded 3% readout; 3.5% is displayed as 4%. */
export const MARKER_CLUSTER_ZOOM = 0.035;

const ISOMETRIC_ZOOM_SCALE = 24;

export const getNormalizedMarkerZoom = (zoom: number, projection: MapProjectionMode) =>
  projection === "isometric" ? zoom / ISOMETRIC_ZOOM_SCALE : zoom;

/** Keep distant markers proportional to the map without making close-up pins smaller. */
export const getMapMarkerZoomScale = (zoom: number, projection: MapProjectionMode) =>
  Math.min(1, Math.max(0.4, Math.sqrt(getNormalizedMarkerZoom(zoom, projection) / MARKER_REGIONAL_ZOOM)));

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
