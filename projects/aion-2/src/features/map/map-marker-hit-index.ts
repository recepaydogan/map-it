import type { ProjectedMapPoint } from "./map-clustering";

const MARKER_RADIUS = 16;
const CELL_SIZE = MARKER_RADIUS * 2;

/** Screen-space picking, in reverse paint order so overlapping pins behave like DOM buttons. */
export const createMapMarkerHitIndex = (
  points: ProjectedMapPoint[],
  getRadius: (point: ProjectedMapPoint) => number = () => MARKER_RADIUS,
) => {
  const cells = new Map<string, number[]>();
  const radii = points.map(getRadius);
  const cellReach = Math.max(1, Math.ceil(radii.reduce((maximum, radius) => Math.max(maximum, radius), 0) / CELL_SIZE));
  points.forEach(({ left, top }, index) => {
    const key = `${Math.floor(left / CELL_SIZE)}:${Math.floor(top / CELL_SIZE)}`;
    const cell = cells.get(key) ?? [];
    cell.push(index);
    cells.set(key, cell);
  });
  return (left: number, top: number,
    isOpaque: (point: ProjectedMapPoint, dx: number, dy: number) => boolean = () => true): ProjectedMapPoint | null => {
    const x = Math.floor(left / CELL_SIZE);
    const y = Math.floor(top / CELL_SIZE);
    let topmost = -1;
    for (let dx = -cellReach; dx <= cellReach; dx += 1) {
      for (let dy = -cellReach; dy <= cellReach; dy += 1) {
        const cell = cells.get(`${x + dx}:${y + dy}`);
        if (!cell) continue;
        for (let offset = cell.length - 1; offset >= 0; offset -= 1) {
          const index = cell[offset]!;
          if (index <= topmost) break;
          const point = points[index]!;
          const radius = radii[index]!;
          if (Math.abs(point.left - left) <= radius && Math.abs(point.top - top) <= radius
            && isOpaque(point, left - point.left, top - point.top)) {
            topmost = index;
            break;
          }
        }
      }
    }
    return points[topmost] ?? null;
  };
};
