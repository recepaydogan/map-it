import assert from "node:assert/strict";
import {
  containsScreenPoint,
  getRectangleScreenPoints,
  screenToWorld,
  worldToScreen,
} from "../src/features/map/map-projection.ts";

const view = { centerX: 10880, centerY: 9856, zoom: 32 };
const viewport = { width: 1200, height: 800 };

for (const mode of ["top", "isometric"]) {
  for (const coordinate of [
    { x: 10880, y: 9856 },
    { x: 10752, y: 9728 },
    { x: 11007, y: 9983 },
  ]) {
    const screen = worldToScreen(coordinate, view, viewport.width, viewport.height, mode);
    const restored = screenToWorld(screen.left, screen.top, view, viewport.width, viewport.height, mode);
    assert.ok(Math.abs(restored.x - coordinate.x) < 1e-9);
    assert.ok(Math.abs(restored.y - coordinate.y) < 1e-9);
  }
}

// The vehicle spawn overlay pulls a large zone's pin back into the viewport and
// then checks it still landed on the zone, so containment has to hold for the
// sheared isometric quad and not just the axis-aligned top-down one.
for (const mode of ["top", "isometric"]) {
  const points = getRectangleScreenPoints(10860, 9836, 40, 40, view, viewport.width, viewport.height, mode);
  const centre = points.reduce(
    (sum, point) => ({ left: sum.left + point.left / 4, top: sum.top + point.top / 4 }),
    { left: 0, top: 0 },
  );
  assert.ok(containsScreenPoint(points, centre.left, centre.top), `${mode}: centre is inside`);
  for (const corner of points) {
    assert.ok(containsScreenPoint(points, corner.left, corner.top), `${mode}: corners count as inside`);
  }
  assert.ok(!containsScreenPoint(points, centre.left + 5000, centre.top), `${mode}: far right is outside`);
  assert.ok(!containsScreenPoint(points, centre.left, centre.top - 5000), `${mode}: far above is outside`);
}

// An isometric quad's screen bounding box is not the quad: a point in the box
// but past a sheared edge has to read as outside.
const isometricPoints = getRectangleScreenPoints(10860, 9836, 40, 40, view, viewport.width, viewport.height, "isometric");
const left = Math.min(...isometricPoints.map((point) => point.left));
const top = Math.min(...isometricPoints.map((point) => point.top));
assert.ok(!containsScreenPoint(isometricPoints, left + 1, top + 1), "isometric: bounding-box corner is outside");

console.log("Map projection tests passed.");
