import type { ProjectedMapPoint } from "./map-clustering";
import { isQuestPoint } from "./map-faction-filter";
import { getMapPointMarkerScale, type MarkerSizeSettings } from "./marker-size-settings";

const MARKER_RADIUS = 18;
const CELL_SIZE = MARKER_RADIUS * 2;

/** Screen-space picking, in reverse paint order so overlapping pins behave like DOM buttons. */
export const createMapMarkerHitIndex = (points: ProjectedMapPoint[], markerSizes: MarkerSizeSettings, zoomScale = 1) => {
  const cells = new Map<string, number[]>();
  const radii: number[] = [];
  let largestRadius = 0;
  points.forEach(({ point, left, top }, index) => {
    const radius = (point.category === "point-of-interest" || isQuestPoint(point) ? 13.5 : MARKER_RADIUS)
      * getMapPointMarkerScale(point, markerSizes) * zoomScale;
    radii[index] = radius;
    largestRadius = Math.max(largestRadius, radius);
    const key = `${Math.floor(left / CELL_SIZE)}:${Math.floor(top / CELL_SIZE)}`;
    const cell = cells.get(key) ?? [];
    cell.push(index);
    cells.set(key, cell);
  });
  const reach = Math.ceil(largestRadius / CELL_SIZE);
  return (left: number, top: number): ProjectedMapPoint | null => {
    const x = Math.floor(left / CELL_SIZE);
    const y = Math.floor(top / CELL_SIZE);
    let topmost = -1;
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        const cell = cells.get(`${x + dx}:${y + dy}`);
        if (!cell) continue;
        for (let offset = cell.length - 1; offset >= 0; offset -= 1) {
          const index = cell[offset]!;
          if (index <= topmost) break;
          const point = points[index]!;
          const radius = radii[index]!;
          if (Math.abs(point.left - left) <= radius && Math.abs(point.top - top) <= radius) {
            topmost = index;
            break;
          }
        }
      }
    }
    return points[topmost] ?? null;
  };
};
