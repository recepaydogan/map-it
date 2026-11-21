import assert from "node:assert/strict";
import {
  getPreparedMapTownAnchor,
  getPreparedMapTownName,
} from "./prepared-map-mod-town.mjs";

assert.equal(getPreparedMapTownName("SZ_Bunker_3", "SecretZ Pandemic"), "SecretZ Bunker 3");
assert.equal(
  getPreparedMapTownName("SZ_Muldraugh_Traindepot_Refugee", "SecretZ Pandemic"),
  "SecretZ Muldraugh Train Depot Refugee",
);
assert.equal(
  getPreparedMapTownName("SZ_Westpoint_Bridge_Checkpoint", "SecretZ Pandemic"),
  "SecretZ West Point Bridge Checkpoint",
);
assert.equal(getPreparedMapTownName("ExampleMap", "Example Mod"), "Example Map");
assert.equal(getPreparedMapTownName("", "Example Mod"), "Example Mod");

const buildings = [
  {
    id: "small-building",
    x: 100,
    y: 200,
    roomCount: 8,
    bounds: { minX: 95, minY: 195, maxX: 105, maxY: 205 },
  },
  {
    id: "landmark-building",
    x: 420,
    y: 520,
    roomCount: 3,
    bounds: { minX: 400, minY: 500, maxX: 440, maxY: 540 },
  },
];
assert.deepEqual(
  getPreparedMapTownAnchor(buildings, ["1,2"], 256),
  { x: 420, y: 520, buildingId: "landmark-building" },
);
assert.deepEqual(
  getPreparedMapTownAnchor([], ["1,2", "2,2"], 256),
  { x: 512, y: 640, buildingId: null },
);

console.log("Prepared map mod town label tests passed.");
