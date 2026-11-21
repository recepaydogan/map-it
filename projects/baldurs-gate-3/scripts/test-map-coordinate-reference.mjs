import assert from "node:assert/strict";
import {
  mapToWorldCoordinate,
  worldToMapCoordinate,
} from "../src/features/map/map-coordinate-reference.ts";

for (const flipY of [false, true]) {
  const reference = {
    worldBounds: { x: -300, y: 80, width: 640, height: 540 },
    imageBounds: { x: 0, y: 0, width: 8192, height: 6912 },
    flipY,
  };
  for (const coordinate of [
    { x: -300, y: 80 },
    { x: 20, y: 350 },
    { x: 340, y: 620 },
  ]) {
    const projected = worldToMapCoordinate(coordinate, reference);
    const restored = mapToWorldCoordinate(projected, reference);
    assert.ok(Math.abs(restored.x - coordinate.x) < 1e-9);
    assert.ok(Math.abs(restored.y - coordinate.y) < 1e-9);
  }
}

console.log("Map coordinate-reference tests passed.");
