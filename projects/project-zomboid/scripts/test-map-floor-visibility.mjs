import assert from "node:assert/strict";
import {
  getSearchFloorGroupKey,
  getSearchResultBasementFloors,
  getSearchSelectionFloor,
  getSelectableMapFloors,
  isPointVisibleOnFloor,
  MAXIMUM_POSITIVE_MAP_FLOOR,
} from "../src/features/map/map-floor-visibility.ts";

assert.equal(MAXIMUM_POSITIVE_MAP_FLOOR, 9);
assert.deepEqual(
  getSelectableMapFloors([29, 9, 0, -1, 8, 9, -2, 10]),
  [-2, -1, 0, 8, 9],
);

const groundPoint = { floors: [0] };
const upperPoint = { floors: [4] };
const basementPoint = { floors: [-2] };
const mixedPoint = { floors: [-1, 0, 1] };

assert.equal(isPointVisibleOnFloor(groundPoint, 0), true);
assert.equal(isPointVisibleOnFloor(groundPoint, 9), true);
assert.equal(isPointVisibleOnFloor(upperPoint, 0), true);
assert.equal(isPointVisibleOnFloor(upperPoint, 9), true);
assert.equal(isPointVisibleOnFloor(basementPoint, 0), false);
assert.equal(isPointVisibleOnFloor(basementPoint, -2), true);
assert.equal(isPointVisibleOnFloor(basementPoint, -1), false);

assert.deepEqual(getSearchResultBasementFloors({ floors: [-2, -1, -2] }), [-1, -2]);
assert.deepEqual(getSearchResultBasementFloors(mixedPoint), []);
assert.equal(getSearchSelectionFloor(basementPoint, 7), -2);
assert.equal(getSearchSelectionFloor(groundPoint, -1), 0);
assert.equal(getSearchSelectionFloor(groundPoint, 7), 7);
assert.equal(getSearchFloorGroupKey(basementPoint), "-2");
assert.equal(getSearchFloorGroupKey(groundPoint), "surface");

console.log("Map floor visibility checks passed.");
