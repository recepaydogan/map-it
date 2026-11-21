import assert from "node:assert/strict";
import { buildMapForagingData, FORAGING_ZONE_TYPES } from "./map-foraging-data.mjs";

const objectsSource = `objects = {
  { name = "", type = "Forest", x = 10, y = 20, z = 0, width = 30, height = 40 },
  { name = "", type = "Forest", x = 15, y = 25, z = 1, width = 5, height = 5 },
  { name = "", type = "ParkingStall", x = 50, y = 60, z = 0, width = 3, height = 4 },
}`;

const definitionsSource = `forageSystem.zoneDefinitions = {
\t${FORAGING_ZONE_TYPES.map((type, index) => `${type} = {
\t\tdensityMin = ${index + 1},
\t\tdensityMax = ${index + 2.5},
\t\trefillPercent = ${index + 3},
\t},`).join("\n\t")}
}`;

const result = buildMapForagingData(objectsSource, definitionsSource);

assert.equal(result.totalZones, 1);
assert.deepEqual(result.zones.Forest, [[10, 20, 30, 40]]);
assert.deepEqual(result.zones.DeepForest, []);
assert.deepEqual(result.definitions.Nav, { densityMin: 1, densityMax: 2.5, refillPercent: 3 });
assert.deepEqual(result.definitions.DeepForest, { densityMin: 8, densityMax: 9.5, refillPercent: 10 });

console.log("Map foraging data tests passed.");
