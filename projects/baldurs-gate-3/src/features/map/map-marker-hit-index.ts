import type { ProjectedMapPoint } from "./map-clustering";

/** Screen-space picking in reverse paint order, matching overlapping DOM buttons. */
export const createMapMarkerHitIndex = (points: ProjectedMapPoint[], radius = 16) => {
  const cellSize = radius * 2;
  const cells = new Map<string, number[]>();
  points.forEach(({ left, top }, index) => {
    const key = `${Math.floor(left / cellSize)}:${Math.floor(top / cellSize)}`;
    const cell = cells.get(key) ?? [];
    cell.push(index);
    cells.set(key, cell);
  });
  return (left: number, top: number): ProjectedMapPoint | null => {
    const x = Math.floor(left / cellSize);
    const y = Math.floor(top / cellSize);
    let topmost = -1;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const cell = cells.get(`${x + dx}:${y + dy}`);
        if (!cell) continue;
        for (let offset = cell.length - 1; offset >= 0; offset -= 1) {
          const index = cell[offset]!;
          if (index <= topmost) break;
          const entry = points[index]!;
          if (Math.abs(entry.left - left) <= radius && Math.abs(entry.top - top) <= radius) {
            topmost = index;
            break;
          }
        }
      }
    }
    return points[topmost] ?? null;
  };
};
