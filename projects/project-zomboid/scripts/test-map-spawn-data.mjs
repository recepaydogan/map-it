import assert from "node:assert/strict";
import { buildMapSpawnData, parseSpawnPointSource } from "./map-spawn-data.mjs";

const groupedSource = `function SpawnPoints()
  local poor_houses = {
    { posX = 100, posY = 200, posZ = 0 },
    { posX = 110, posY = 210, posZ = 0 },
  }
  local police_station = {
    { posX = 120, posY = 220, posZ = 1 },
  }
  return {
    unemployed = poor_houses,
    policeofficer = mergeTable(poor_houses, police_station),
  }
end`;

const directSource = `function SpawnPoints()
  return {
    unemployed = {
      { posX = 300, posY = 400, posZ = 0 },
    }
  }
end`;

const parsed = parseSpawnPointSource(groupedSource);
assert.equal(parsed.length, 3);
assert.deepEqual(parsed.find(({ x }) => x === 100)?.professions, ["policeofficer", "unemployed"]);
assert.deepEqual(parsed.find(({ x }) => x === 120)?.professions, ["policeofficer"]);

const result = buildMapSpawnData([
  { townId: "alpha", town: "Alpha", content: groupedSource },
  { townId: "beta", town: "Beta", content: directSource },
], {
  UI_prof_unemployed: "Custom Occupation",
  UI_prof_policeoff: "Police Officer",
});

assert.equal(result.totalPoints, 4);
assert.equal(result.totalTowns, 2);
assert.equal(result.professions.find(({ id }) => id === "policeofficer")?.label, "Police Officer");
assert.equal(result.professions.find(({ id }) => id === "unemployed")?.pointCount, 3);

console.log("Map spawn point data tests passed.");
