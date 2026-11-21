import type { ProjectedMapPoint } from "./map-clustering";
import { getMapPointMarkerScale, type MarkerSizeSettings } from "./marker-size-settings";

const MARKER_RADIUS = 18;
const CELL_SIZE = MARKER_RADIUS * 2;

/** Screen-space picking, in reverse paint order so overlapping pins behave like DOM buttons. */
export const createMapMarkerHitIndex = (points: ProjectedMapPoint[], markerSizes: MarkerSizeSettings, zoomScale = 1) => {
  const cells = new Map<string, number[]>();
  points.forEach(({ left, top }, index) => {
    const key = `${Math.floor(left / CELL_SIZE)}:${Math.floor(top / CELL_SIZE)}`;
    const cell = cells.get(key) ?? [];
    cell.push(index);
    cells.set(key, cell);
  });
  return (left: number, top: number): ProjectedMapPoint | null => {
    const x = Math.floor(left / CELL_SIZE);
    const y = Math.floor(top / CELL_SIZE);
    let topmost = -1;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const cell = cells.get(`${x + dx}:${y + dy}`);
        if (!cell) continue;
        for (let offset = cell.length - 1; offset >= 0; offset -= 1) {
          const index = cell[offset]!;
          if (index <= topmost) break;
          const point = points[index]!;
          const radius = (point.point.category === "point-of-interest" ? 13.5
            : point.point.category === "quest" || point.point.category === "repeatable-quest" ? 13.5
            : MARKER_RADIUS) * getMapPointMarkerScale(point.point, markerSizes) * zoomScale;
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
