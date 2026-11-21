import type { WorldRoutePoint } from "./world-route-types.ts";

export interface WorldPolylineView {
  x: number;
  z: number;
  width: number;
  height: number;
  zoom: number;
}

export interface WorldPolylineDirectionArrow {
  x: number;
  y: number;
  /** Screen-space degrees clockwise from the positive horizontal axis. */
  angle: number;
}

const clipLine = (x0: number, y0: number, x1: number, y1: number, width: number, height: number) => {
  const dx = x1 - x0, dy = y1 - y0, p = [-dx, dx, -dy, dy], q = [x0, width - x0, y0, height - y0];
  let from = 0, to = 1;
  for (let index = 0; index < 4; index += 1) {
    if (p[index] === 0) { if (q[index]! < 0) return null; continue; }
    const ratio = q[index]! / p[index]!;
    if (p[index]! < 0) from = Math.max(from, ratio); else to = Math.min(to, ratio);
    if (from > to) return null;
  }
  return [[x0 + from * dx, y0 + from * dy], [x0 + to * dx, y0 + to * dy]] as const;
};

/** Projects and clips world-space line segments without exposing large coordinates to SVG. */
export const projectWorldPolyline = (
  points: readonly WorldRoutePoint[],
  view: WorldPolylineView | null,
  padding = 12,
): readonly (readonly [number, number][])[] => {
  if (!view || points.length < 2 || ![view.x, view.z, view.width, view.height, view.zoom, padding].every(Number.isFinite)
    || view.width <= 0 || view.height <= 0 || view.zoom <= 0 || padding < 0) return [];
  const left = -padding, top = -padding, width = view.width + padding * 2, height = view.height + padding * 2;
  const project = (point: WorldRoutePoint) => ({
    x: view.width / 2 + (point.x - view.x) * view.zoom,
    y: view.height / 2 + (point.z - view.z) * view.zoom,
  });
  const paths: [number, number][][] = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = project(points[index - 1]!), end = project(points[index]!);
    const clipped = clipLine(start.x - left, start.y - top, end.x - left, end.y - top, width, height);
    if (!clipped) continue;
    const from: [number, number] = [clipped[0][0] + left, clipped[0][1] + top];
    const to: [number, number] = [clipped[1][0] + left, clipped[1][1] + top];
    const priorPath = paths.at(-1), prior = priorPath?.at(-1);
    if (!prior || Math.abs(prior[0] - from[0]) > 0.01 || Math.abs(prior[1] - from[1]) > 0.01) paths.push([from, to]);
    else priorPath!.push(to);
  }
  return paths;
};

export const projectWorldPoint = (point: WorldRoutePoint, view: WorldPolylineView | null) => {
  if (!view) return null;
  const x = view.width / 2 + (point.x - view.x) * view.zoom;
  const y = view.height / 2 + (point.z - view.z) * view.zoom;
  return x >= 0 && y >= 0 && x <= view.width && y <= view.height ? { x, y } : null;
};

/** Projects arrows anchored to fixed distances along the world-space route. */
export const projectWorldDirectionArrows = (
  points: readonly WorldRoutePoint[], view: WorldPolylineView | null, spacing = 128,
): readonly WorldPolylineDirectionArrow[] => {
  if (!view || points.length < 2 || ![view.x, view.z, view.width, view.height, view.zoom, spacing].every(Number.isFinite)
    || view.width <= 0 || view.height <= 0 || view.zoom <= 0 || spacing <= 0) return [];
  const arrows: WorldPolylineDirectionArrow[] = [];
  let distanceBeforeLeg = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!, point = points[index]!;
    const dx = point.x - previous.x, dz = point.z - previous.z, length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length <= 0) continue;
    const x0 = view.width / 2 + (previous.x - view.x) * view.zoom;
    const y0 = view.height / 2 + (previous.z - view.z) * view.zoom;
    const x1 = x0 + dx * view.zoom, y1 = y0 + dz * view.zoom;
    const clipped = clipLine(x0, y0, x1, y1, view.width, view.height);
    if (clipped) {
      const screenLength = length * view.zoom;
      const visibleFrom = distanceBeforeLeg + Math.hypot(clipped[0][0] - x0, clipped[0][1] - y0) / screenLength * length;
      const visibleTo = distanceBeforeLeg + Math.hypot(clipped[1][0] - x0, clipped[1][1] - y0) / screenLength * length;
      const first = Math.max(0, Math.floor((distanceBeforeLeg - spacing / 2) / spacing) + 1,
        Math.ceil((visibleFrom - spacing / 2) / spacing));
      const last = Math.floor((visibleTo - spacing / 2) / spacing);
      // Thin only the displayed set at extreme zoom levels; every retained
      // arrow still has the same world position as at every other zoom.
      const stride = Math.max(1, Math.ceil((last - first + 1) / 256));
      for (let arrowIndex = first + (stride - first % stride) % stride; arrowIndex <= last; arrowIndex += stride) {
        const progress = (spacing / 2 + arrowIndex * spacing - distanceBeforeLeg) / length;
        arrows.push({ x: x0 + (x1 - x0) * progress, y: y0 + (y1 - y0) * progress,
          angle: Math.atan2(dz, dx) * 180 / Math.PI });
      }
    }
    distanceBeforeLeg += length;
  }
  return arrows;
};
