import assert from "node:assert/strict";
import { preserveCoordinateFrame } from "./lib/map-raster-frame.mjs";

const project = (point, reference) => ({
  x: reference.imageBounds.x + (point.x - reference.worldBounds.x) / reference.worldBounds.width * reference.imageBounds.width,
  y: reference.imageBounds.y + (reference.flipY ? 1 - (point.z - reference.worldBounds.y) / reference.worldBounds.height
    : (point.z - reference.worldBounds.y) / reference.worldBounds.height) * reference.imageBounds.height,
});
for (const flipY of [true, false]) {
  const previous = { worldBounds: { x: -125, y: 210, width: 300, height: 200 },
    imageBounds: { x: -40, y: 30, width: 1500, height: 1200 }, flipY };
  const current = { worldBounds: { x: -140, y: 190, width: 340, height: 235 }, flipY };
  const frame = preserveCoordinateFrame(current, previous, 6800, 4700);
  for (const point of [{ x: -120, z: 215 }, { x: 50, z: 300 }, { x: 170, z: 405 }]) {
    const before = project(point, previous);
    const after = project(point, frame.coordinateReference);
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1e-8,
      "Recovered edge pixels must not move existing world positions or saved map coordinates");
  }
  assert.equal(frame.bounds.minX, -115);
  assert.equal(frame.bounds.maxX - frame.bounds.minX, 1700);
  assert.deepEqual(frame.tileImageSize, { width: 6800, height: 4700 });
  assert.throws(() => preserveCoordinateFrame(current, { ...previous, flipY: !flipY }, 6800, 4700), /oriented/);
}
console.log("Raster coordinate frames passed: recovered edges preserve all existing world-to-map coordinates in both orientations.");
