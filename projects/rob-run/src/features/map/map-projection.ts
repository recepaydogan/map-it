import type { CSSProperties } from "react";
import type { MapCoordinate, MapView } from "./types";

export type MapProjectionMode = "top" | "isometric";

export interface MapScreenPoint {
  left: number;
  top: number;
}

export interface MapWorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const projectOffset = (x: number, y: number, mode: MapProjectionMode) => {
  if (mode === "top") return { x, y };
  return {
    x: (x - y) / 2,
    y: (x + y) / 4,
  };
};

/**
 * Screen-space angle of a world-space direction, in degrees clockwise from up
 * — what an arrow icon has to be rotated by to point that way. The isometric
 * map shears the world, so a direction has to go through the same projection as
 * a position or the arrow points somewhere the player is not walking.
 */
export const worldDirectionToScreenAngle = (
  dx: number,
  dy: number,
  mode: MapProjectionMode,
): number => {
  const offset = projectOffset(dx, dy, mode);
  return Math.atan2(offset.x, -offset.y) * (180 / Math.PI);
};

export const worldToScreen = (
  coordinate: MapCoordinate,
  view: MapView,
  width: number,
  height: number,
  mode: MapProjectionMode,
): MapScreenPoint => {
  const offset = projectOffset(coordinate.x - view.centerX, coordinate.y - view.centerY, mode);
  return {
    left: offset.x * view.zoom + width / 2,
    top: offset.y * view.zoom + height / 2,
  };
};

export const screenToWorld = (
  left: number,
  top: number,
  view: MapView,
  width: number,
  height: number,
  mode: MapProjectionMode,
): MapCoordinate => {
  const projectedX = (left - width / 2) / view.zoom;
  const projectedY = (top - height / 2) / view.zoom;
  if (mode === "top") {
    return {
      x: view.centerX + projectedX,
      y: view.centerY + projectedY,
    };
  }
  return {
    x: view.centerX + projectedX + projectedY * 2,
    y: view.centerY - projectedX + projectedY * 2,
  };
};

/**
 * Places an overlay element at a screen point.
 *
 * A projected point almost always lands on a fraction of a pixel, and a box
 * laid out at a fractional `left`/`top` is pixel-snapped independently of every
 * other box. While the view pans, each pin therefore rounds its own way from
 * one frame to the next and the overlay shimmers against the map underneath it.
 * A transform is not snapped — it renders at subpixel precision — so pins,
 * labels and tiles all slide together. Deliberately 2D: `translate3d` would
 * promote every one of several hundred markers to its own compositor layer.
 */
export const screenPointStyle = (
  left: number,
  top: number,
  { centered = true }: { centered?: boolean } = {},
): CSSProperties => ({
  left: 0,
  top: 0,
  transform: centered
    ? `translate(${left}px, ${top}px) translate(-50%, -50%)`
    : `translate(${left}px, ${top}px)`,
});

/**
 * World units covered by one screen pixel. Isometric squares are drawn on the
 * (x-y)/2, (x+y)/4 diagonal, so a square's on-screen edge is hypot(0.5, 0.25)
 * long before the zoom is applied. Hit tolerances are expressed in pixels and
 * converted through this, so a grab radius stays the same size on screen at
 * every zoom instead of collapsing when zoomed out.
 */
const ISOMETRIC_EDGE_SCALE = Math.hypot(0.5, 0.25);

export const getWorldUnitsPerPixel = (zoom: number, mode: MapProjectionMode) =>
  1 / Math.max(1e-6, zoom * (mode === "isometric" ? ISOMETRIC_EDGE_SCALE : 1));

export const getVisibleWorldBounds = (
  view: MapView,
  width: number,
  height: number,
  mode: MapProjectionMode,
): MapWorldBounds => {
  const corners = [
    screenToWorld(0, 0, view, width, height, mode),
    screenToWorld(width, 0, view, width, height, mode),
    screenToWorld(0, height, view, width, height, mode),
    screenToWorld(width, height, view, width, height, mode),
  ];
  return {
    minX: Math.min(...corners.map(({ x }) => x)),
    minY: Math.min(...corners.map(({ y }) => y)),
    maxX: Math.max(...corners.map(({ x }) => x)),
    maxY: Math.max(...corners.map(({ y }) => y)),
  };
};

export const getRectangleScreenPoints = (
  x: number,
  y: number,
  rectangleWidth: number,
  rectangleHeight: number,
  view: MapView,
  width: number,
  height: number,
  mode: MapProjectionMode,
) => [
  worldToScreen({ x, y }, view, width, height, mode),
  worldToScreen({ x: x + rectangleWidth, y }, view, width, height, mode),
  worldToScreen({ x: x + rectangleWidth, y: y + rectangleHeight }, view, width, height, mode),
  worldToScreen({ x, y: y + rectangleHeight }, view, width, height, mode),
];

/**
 * Point-in-polygon for the convex, wound quads this module produces: the point
 * is inside when it stays on the same side of every edge.
 */
export const containsScreenPoint = (points: MapScreenPoint[], left: number, top: number) => {
  let sign = 0;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    const cross = (to.left - from.left) * (top - from.top) - (to.top - from.top) * (left - from.left);
    if (cross === 0) continue;
    const side = cross > 0 ? 1 : -1;
    if (sign === 0) sign = side;
    else if (sign !== side) return false;
  }
  return true;
};

/** Lays down the path without painting, for callers that stroke it more than once. */
export const traceScreenPolygon = (context: CanvasRenderingContext2D, points: MapScreenPoint[]) => {
  const [first, ...rest] = points;
  if (!first) return false;
  context.beginPath();
  context.moveTo(first.left, first.top);
  for (const point of rest) context.lineTo(point.left, point.top);
  context.closePath();
  return true;
};

export const drawScreenPolygon = (context: CanvasRenderingContext2D, points: MapScreenPoint[]) => {
  if (!traceScreenPolygon(context, points)) return;
  context.fill();
  context.stroke();
};
