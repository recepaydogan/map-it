import assert from "node:assert/strict";
import { getWantedIsometricFloorLayers } from "../src/features/map/map-isometric-floor-layers.ts";

const createFloor = (floor) => ({ floor, tileSize: 1024, format: "webp", width: 1, height: 1, levels: [0] });
const source = {
  floors: [createFloor(2), createFloor(1), createFloor(0), createFloor(-1), createFloor(-2)],
  cumulativeFloors: [{ ...createFloor(2), layerName: "cumulative/layer2", sourceFloors: [1, 2] }],
};
assert.deepEqual(
  getWantedIsometricFloorLayers(source, 0).map(({ floor, layerName }) => [floor, layerName]),
  [[0, "layer0"]],
);
assert.deepEqual(
  getWantedIsometricFloorLayers(source, 1).map(({ floor, layerName }) => [floor, layerName]),
  [[0, "layer0"], [1, "layer1"]],
);
assert.deepEqual(
  getWantedIsometricFloorLayers(source, 2).map(({ floor, layerName }) => [floor, layerName]),
  [[0, "layer0"], [2, "cumulative/layer2"]],
);
assert.deepEqual(
  getWantedIsometricFloorLayers(source, -1).map(({ floor, layerName }) => [floor, layerName]),
  [[-1, "layer-1"]],
);
console.log("Isometric floor-layer selection tests passed.");
