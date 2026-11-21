import type { MapPoint } from "./types";

const FULL_GATHERING_ZOOM = 0.45;
const TARGET_SPACING_PX = 32;

/** Keep a stable representative per gathering type and map cell until zoom reveals more pins. */
export const thinGatheringPoints = (points: MapPoint[], normalizedZoom: number,
  selectedId: string | null): MapPoint[] => {
  if (normalizedZoom >= FULL_GATHERING_ZOOM) return points;
  const cellSize = 2 ** Math.round(Math.log2(TARGET_SPACING_PX / Math.max(normalizedZoom, 0.001)));
  const representatives = new Map<string, { id: string; distance: number }>();
  for (const point of points) {
    if (!point.category.startsWith("gatherable")) continue;
    const cellX = Math.floor(point.x / cellSize);
    const cellY = Math.floor(point.y / cellSize);
    const centerX = (cellX + 0.5) * cellSize;
    const centerY = (cellY + 0.5) * cellSize;
    const distance = (point.x - centerX) ** 2 + (point.y - centerY) ** 2;
    const key = `${point.category}:${cellX}:${cellY}`;
    const current = representatives.get(key);
    if (!current || distance < current.distance
      || (distance === current.distance && point.id < current.id)) {
      representatives.set(key, { id: point.id, distance });
    }
  }
  // Maps without gathering nodes keep the same point index across zoom steps.
  if (!representatives.size) return points;
  const visibleIds = new Set([...representatives.values()].map(({ id }) => id));
  return points.filter((point) => point.category === "custom"
    || !point.category.startsWith("gatherable")
    || point.id === selectedId || visibleIds.has(point.id));
};
