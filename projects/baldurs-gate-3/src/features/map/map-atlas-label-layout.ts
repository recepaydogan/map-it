import type { MapScreenRectangle } from "./map-tile-utils";

export interface AtlasLabelCandidate {
  mapId: string;
  rectangle: MapScreenRectangle;
  width: number;
  height: number;
  selected: boolean;
  featured: boolean;
}

export interface AtlasLabelPlacement extends MapScreenRectangle {
  mapId: string;
}

const EDGE_PADDING = 8;
const MAP_LABEL_GAP = 10;
const LABEL_CLEARANCE = 6;

/** Labels use measured CSS pixels, independently of the atlas zoom transform.
 * Keep the selected map first, then major areas, then larger visible maps.
 * Dense detail names reappear as zooming/panning creates room; pins are not
 * inputs to this selector and cannot be removed by label decluttering. */
export const layoutAtlasLabels = (
  candidates: readonly AtlasLabelCandidate[],
  viewport: { width: number; height: number },
): AtlasLabelPlacement[] => {
  if (viewport.width <= EDGE_PADDING * 2 || viewport.height <= EDGE_PADDING * 2) return [];
  const ordered = [...candidates].sort((a, b) =>
    Number(b.selected) - Number(a.selected)
    || Number(b.featured) - Number(a.featured)
    || b.rectangle.width * b.rectangle.height - a.rectangle.width * a.rectangle.height
    || a.mapId.localeCompare(b.mapId, "en"));
  const placed: AtlasLabelPlacement[] = [];
  for (const candidate of ordered) {
    const { rectangle, width, height, mapId } = candidate;
    if (width <= 0 || height <= 0 || width > viewport.width - EDGE_PADDING * 2
      || height > viewport.height - EDGE_PADDING * 2
      || rectangle.width <= 0 || rectangle.height <= 0
      || rectangle.left >= viewport.width || rectangle.top >= viewport.height
      || rectangle.left + rectangle.width <= 0 || rectangle.top + rectangle.height <= 0) continue;

    // Keep the horizontal anchor in the same coordinate space as the map
    // rectangle. Viewport clamping makes a label slide across its map while
    // panning near an edge, and integer rounding adds a one-pixel wobble over
    // fractional map positions.
    const left = rectangle.left + rectangle.width / 2 - width / 2;
    // When the map extends above the viewport, retain its context at the top
    // edge. Never pull an entirely off-screen map's name into the viewport.
    const top = Math.round(Math.max(EDGE_PADDING, rectangle.top - height - MAP_LABEL_GAP));
    const label = { mapId, left, top, width, height };
    const overlaps = placed.some((other) =>
      Math.min(left + width, other.left + other.width) - Math.max(left, other.left) > -LABEL_CLEARANCE
      && Math.min(top + height, other.top + other.height) - Math.max(top, other.top) > -LABEL_CLEARANCE);
    if (!overlaps) placed.push(label);
  }
  return placed;
};
