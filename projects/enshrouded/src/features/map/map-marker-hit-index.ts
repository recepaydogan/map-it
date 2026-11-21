import type { ProjectedMapPoint } from "./map-clustering";
import { getPointAppearance } from "./map-config";
import { isQuestPoint } from "./map-faction-filter";
import { MARKER_SPRITE_SIZE } from "./map-marker-sprites";
import { getMapPointMarkerScale, type MarkerSizeSettings } from "./marker-size-settings";

const CELL_SIZE = MARKER_SPRITE_SIZE;
const HIT_PADDING = 3;

/** Pick the visible icon nearest the pointer; transparent sprite margins are not clickable. */
export const createMapMarkerHitIndex = (points: ProjectedMapPoint[], markerSizes: MarkerSizeSettings, zoomScale = 1) => {
  const cells = new Map<string, number[]>();
  const radii = new Float32Array(points.length);
  let maxRadius = 0;
  points.forEach(({ point, left, top }, index) => {
    const key = `${Math.floor(left / CELL_SIZE)}:${Math.floor(top / CELL_SIZE)}`;
    const cell = cells.get(key) ?? [];
    cell.push(index);
    cells.set(key, cell);
    const appearance = getPointAppearance(point);
    const questArtwork = appearance.markerClass.split(" ").includes("map-marker-quest");
    const iconSize = questArtwork ? MARKER_SPRITE_SIZE : appearance.itemArt ? 22 : 18;
    const spriteScale = (isQuestPoint(point) || point.category === "point-of-interest" ? 0.75 : 1)
      * getMapPointMarkerScale(point, markerSizes) * zoomScale;
    const radius = Math.min(MARKER_SPRITE_SIZE / 2, iconSize / 2 + HIT_PADDING) * spriteScale;
    radii[index] = radius;
    maxRadius = Math.max(maxRadius, radius);
  });
  const reach = Math.ceil(maxRadius / CELL_SIZE);
  return (left: number, top: number): ProjectedMapPoint | null => {
    const x = Math.floor(left / CELL_SIZE);
    const y = Math.floor(top / CELL_SIZE);
    let closestIndex = -1;
    let closestDistance = Infinity;
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        const cell = cells.get(`${x + dx}:${y + dy}`);
        if (!cell) continue;
        for (let offset = cell.length - 1; offset >= 0; offset -= 1) {
          const index = cell[offset]!;
          const point = points[index]!;
          const distance = (point.left - left) ** 2 + (point.top - top) ** 2;
          if (distance <= radii[index]! ** 2
            && (distance < closestDistance || (distance === closestDistance && index > closestIndex))) {
            closestIndex = index;
            closestDistance = distance;
          }
        }
      }
    }
    return points[closestIndex] ?? null;
  };
};
