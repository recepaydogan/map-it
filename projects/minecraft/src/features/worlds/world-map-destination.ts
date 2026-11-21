import type { TrackedDestination } from "./world-types.ts";

export interface DestinationViewport {
  width: number;
  height: number;
  x: number;
  z: number;
  zoom: number;
}

export interface DestinationSafeArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ProjectedDestination {
  destination: TrackedDestination;
  x: number;
  y: number;
  angle: number;
  kind: "visible" | "edge";
}

type EdgeSide = "left" | "right" | "top" | "bottom";

const finite = (value: number) => Number.isFinite(value);

/** Project X/Z into the north-up biome viewport and clamp off-screen targets to its usable edge. */
export const projectTrackedDestination = (
  destination: TrackedDestination,
  dimension: string,
  view: DestinationViewport | null,
  area: DestinationSafeArea,
): ProjectedDestination | null => {
  if (destination.dimension !== dimension || !view || ![view.width, view.height, view.x, view.z, view.zoom,
    area.left, area.top, area.right, area.bottom, destination.x, destination.z].every(finite)
    || view.width <= 0 || view.height <= 0 || view.zoom <= 0 || area.left > area.right || area.top > area.bottom) return null;
  const rawX = view.width / 2 + (destination.x - view.x) * view.zoom;
  const rawY = view.height / 2 + (destination.z - view.z) * view.zoom;
  const dx = rawX - view.width / 2, dy = rawY - view.height / 2;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  if (rawX >= area.left && rawX <= area.right && rawY >= area.top && rawY <= area.bottom) {
    return { destination, x: rawX, y: rawY, angle, kind: "visible" };
  }
  const centerX = Math.min(area.right, Math.max(area.left, view.width / 2));
  const centerY = Math.min(area.bottom, Math.max(area.top, view.height / 2));
  const targetDx = rawX - centerX, targetDy = rawY - centerY;
  const xScale = targetDx > 0 ? (area.right - centerX) / targetDx
    : targetDx < 0 ? (area.left - centerX) / targetDx : Infinity;
  const yScale = targetDy > 0 ? (area.bottom - centerY) / targetDy
    : targetDy < 0 ? (area.top - centerY) / targetDy : Infinity;
  const scale = Math.max(0, Math.min(xScale, yScale));
  return { destination, x: centerX + targetDx * scale, y: centerY + targetDy * scale,
    angle: Math.atan2(targetDy, targetDx) * 180 / Math.PI + 90, kind: "edge" };
};

export const horizontalDestinationDistance = (
  destination: Pick<TrackedDestination, "dimension" | "x" | "z">,
  player: { dimension: string; x: number; z: number } | null,
): number | null => player?.dimension === destination.dimension
    ? Math.hypot(destination.x - player.x, destination.z - player.z) : null;

const edgeSide = (item: ProjectedDestination, area: DestinationSafeArea): EdgeSide => {
  const candidates: Array<[EdgeSide, number]> = [
    ["left", Math.abs(item.x - area.left)], ["right", Math.abs(item.x - area.right)],
    ["top", Math.abs(item.y - area.top)], ["bottom", Math.abs(item.y - area.bottom)],
  ];
  return candidates.sort((a, b) => a[1] - b[1])[0]![0];
};

/** Deterministically spread coincident edge arrows while leaving exact in-view positions untouched. */
export const spreadDestinationEdges = (
  items: readonly ProjectedDestination[], area: DestinationSafeArea, gap = 38,
): ProjectedDestination[] => {
  const result = items.map(item => ({ ...item }));
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const vertical = side === "left" || side === "right";
    const minimum = vertical ? area.top : area.left, maximum = vertical ? area.bottom : area.right;
    const group = result.filter(item => item.kind === "edge" && edgeSide(item, area) === side)
      .sort((a, b) => (vertical ? a.y - b.y : a.x - b.x) || a.destination.id.localeCompare(b.destination.id));
    const spacing = group.length > 1 ? Math.min(gap, (maximum - minimum) / (group.length - 1)) : gap;
    let previous = minimum - spacing;
    for (const item of group) {
      const desired = vertical ? item.y : item.x;
      const next = Math.max(desired, previous + spacing);
      if (vertical) item.y = next; else item.x = next;
      previous = next;
    }
    let next = maximum + spacing;
    for (let index = group.length - 1; index >= 0; index--) {
      const item = group[index]!;
      const desired = vertical ? item.y : item.x;
      const position = Math.min(desired, next - spacing);
      if (vertical) item.y = Math.max(minimum, position); else item.x = Math.max(minimum, position);
      next = vertical ? item.y : item.x;
    }
  }
  return result;
};
