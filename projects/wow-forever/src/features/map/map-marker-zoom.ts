import type { MapProjectionMode } from "./map-projection";

export type MapMarkerZoomTier = "overview" | "regional" | "detail";

/** Normalised zoom each tier starts at. Isometric zoom is scaled to match. */
export const MARKER_REGIONAL_ZOOM = 0.12;
export const MARKER_DETAIL_ZOOM = 0.45;
/** Matches the toolbar's rounded 3% readout; 3.5% is displayed as 4%. */
export const MARKER_CLUSTER_ZOOM = 0.035;
export const MARKER_MIN_ZOOM_SCALE = 0.4;
export const CANVAS_MARKER_THRESHOLD = 400;

export const MAP_MARKER_SIZES = { normal: 32, selected: 36, cluster: 35, quest: 27 } as const;

export const getMapMarkerIconSize = (category: string, quest: boolean, itemArt: boolean,
  variant: "normal" | "selected" | "cluster", overview = false) => {
  if (quest) return MAP_MARKER_SIZES.quest;
  if (category === "point-of-interest") return variant !== "cluster" && itemArt ? 16 : 14;
  if (variant === "cluster") return itemArt ? 24 : overview ? 20 : 19;
  if (variant === "selected") return itemArt ? 25 : 21;
  return itemArt ? 22 : 18;
};

const ISOMETRIC_ZOOM_SCALE = 24;

export const getNormalizedMarkerZoom = (zoom: number, projection: MapProjectionMode) =>
  projection === "isometric" ? zoom / ISOMETRIC_ZOOM_SCALE : zoom;

/** Keep distant markers proportional to the map without making close-up pins smaller. */
export const getMapMarkerZoomScale = (zoom: number, projection: MapProjectionMode) =>
  Math.min(1, Math.max(MARKER_MIN_ZOOM_SCALE, Math.sqrt(getNormalizedMarkerZoom(zoom, projection) / MARKER_REGIONAL_ZOOM)));

/** Inverse of {@link getNormalizedMarkerZoom}, for turning a tier back into a view zoom. */
export const getMarkerZoomFromNormalized = (
  normalizedZoom: number,
  projection: MapProjectionMode,
) => (projection === "isometric" ? normalizedZoom * ISOMETRIC_ZOOM_SCALE : normalizedZoom);

/** Overlapping markers get one fixed 450% inspection zoom before opening a fan. */
export const getMarkerOverlapZoom = (currentZoom: number, projection: MapProjectionMode) =>
  Math.max(currentZoom, getMarkerZoomFromNormalized(4.5, projection));

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
