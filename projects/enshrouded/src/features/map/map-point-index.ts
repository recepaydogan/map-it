import type { MapWorldBounds } from "./map-projection";
import type { MapCoordinate } from "./types";

const CELL_SIZE = 256;

/** Immutable map-space index, rebuilt only when the filtered points change. */
export const createMapPointIndex = <T extends MapCoordinate>(points: T[]) => {
  const cells = new Map<string, { point: T; order: number }[]>();
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  points.forEach((point, order) => {
    const key = `${Math.floor(point.x / CELL_SIZE)}:${Math.floor(point.y / CELL_SIZE)}`;
    const cell = cells.get(key) ?? [];
    cell.push({ point, order });
    cells.set(key, cell);
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  });

  return (visible: MapWorldBounds): T[] => {
    if (visible.minX <= bounds.minX && visible.minY <= bounds.minY
      && visible.maxX >= bounds.maxX && visible.maxY >= bounds.maxY) return points;
    const contains = (point: T) => point.x >= visible.minX && point.x <= visible.maxX
      && point.y >= visible.minY && point.y <= visible.maxY;
    const minX = Math.floor(visible.minX / CELL_SIZE);
    const minY = Math.floor(visible.minY / CELL_SIZE);
    const maxX = Math.floor(visible.maxX / CELL_SIZE);
    const maxY = Math.floor(visible.maxY / CELL_SIZE);
    // A sparse, zoomed-out map is cheaper to scan than thousands of empty cells.
    if ((maxX - minX + 1) * (maxY - minY + 1) > cells.size) return points.filter(contains);
    const matches: { point: T; order: number }[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (const entry of cells.get(`${x}:${y}`) ?? []) {
          if (contains(entry.point)) matches.push(entry);
        }
      }
    }
    // Preserve paint order and keyboard navigation when cells enter the view.
    return matches.sort((a, b) => a.order - b.order).map(({ point }) => point);
  };
};
