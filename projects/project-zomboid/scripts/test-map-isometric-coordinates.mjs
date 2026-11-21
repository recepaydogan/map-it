import assert from "node:assert/strict";
import {
  getIsometricCameraFloor,
  isometricImageToWorld,
  mapZoomToImageZoom,
  worldToIsometricImage,
} from "../src/features/map/map-isometric-coordinates.ts";

const mapInfo = {
  w: 2_314_368,
  h: 1_019_040,
  x0: 1_036_288,
  y0: -139_296,
  sqr: 128,
  scale: 1,
  minlayer: -17,
  maxlayer: 31,
  cell_size: 256,
};

for (const floor of [-4, 0, 7]) {
  const coordinate = { x: 9_800, y: 6_610 };
  const imagePoint = worldToIsometricImage(coordinate, floor, mapInfo);
  const roundTrip = isometricImageToWorld(imagePoint, floor, mapInfo);
  assert.ok(Math.abs(roundTrip.x - coordinate.x) < 1e-9);
  assert.ok(Math.abs(roundTrip.y - coordinate.y) < 1e-9);
}

assert.equal(mapZoomToImageZoom(128, mapInfo), 1);
assert.equal(getIsometricCameraFloor(0), 0);
assert.equal(getIsometricCameraFloor(29), 0);
assert.equal(getIsometricCameraFloor(-1), -1);
console.log("Isometric image coordinate and zoom conversion tests passed.");
