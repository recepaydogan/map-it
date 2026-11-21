import assert from "node:assert/strict";
import { filterMapDataToGroundFloor, isGroundFloorLocation } from "../src/features/map/map-ground-floor.ts";
import { isPointOnFloor, isPointVisibleOnFloor } from "../src/features/map/map-floor-visibility.ts";

assert.equal(isGroundFloorLocation({}), true);
assert.equal(isGroundFloorLocation({ floors: [0] }), true);
assert.equal(isGroundFloorLocation({ floors: [-1, 0, 1] }), true);
assert.equal(isGroundFloorLocation({ floors: [-2, -1] }), false);
assert.equal(isGroundFloorLocation({ floors: [] }), false);
assert.equal(isPointOnFloor({ floors: [-1] }, -1), true);
assert.equal(isPointOnFloor({ floors: [0] }, -1), false);
assert.equal(isPointOnFloor({}, -1), false);
assert.equal(isPointOnFloor({}, 0), true);
assert.equal(isPointVisibleOnFloor({ floors: [0] }, 3), true);
assert.equal(isPointVisibleOnFloor({ floors: [1] }, 3), true);
assert.equal(isPointVisibleOnFloor({ floors: [3] }, 1), true);
assert.equal(isPointVisibleOnFloor({ floors: [-1] }, 3), false);
assert.equal(isPointVisibleOnFloor({ floors: [-1] }, -1), true);
assert.equal(isPointVisibleOnFloor({ floors: [-2] }, -1), false);

const data = {
  id: "test-map",
  locations: [
    { id: "legacy" },
    { id: "ground", floors: [0] },
    { id: "multi-floor", floors: [-1, 0, 1] },
    { id: "basement", floors: [-1] },
    { id: "upper-floor", floors: [1] },
  ],
  statistics: { towns: 1, searchableLocations: 5 },
};
const filtered = filterMapDataToGroundFloor(data);
assert.deepEqual(filtered.locations.map(({ id }) => id), ["legacy", "ground", "multi-floor"]);
assert.equal(filtered.statistics.searchableLocations, 3);
assert.equal(data.locations.length, 5);

const groundOnly = {
  locations: [{ id: "ground", floors: [0] }],
  statistics: { searchableLocations: 1 },
};
assert.equal(filterMapDataToGroundFloor(groundOnly), groundOnly);

console.log("Ground-floor map location tests passed.");
