import assert from "node:assert/strict";
import { buildMapVehicleSpawnData } from "./map-vehicle-spawn-data.mjs";

const objectsSource = `objects = {
  { name = "Police", type = "ParkingStall", x = 10, y = 20, z = 0, width = 3, height = 4 },
  { name = "rtrafficjamw", type = "ParkingStall", x = 30, y = 40, z = 0, width = 8, height = 3 },
  { name = "", type = "ParkingStall", x = 50, y = 60, z = 0, width = 3, height = 4 },
  { name = "police", type = "ParkingStall", x = 70, y = 80, z = 1, width = 3, height = 4 },
}`;

const distributionsSource = `
local trafficjamVehicles = {};
trafficjamVehicles["Base.CarNormal"] = {index = -1, spawnChance = 20};
VehicleZoneDistribution.trafficjamw = {};
VehicleZoneDistribution.trafficjamw.vehicles = trafficjamVehicles;
VehicleZoneDistribution.trafficjamw.chanceToSpawnBurnt = 80;
VehicleZoneDistribution.police = {};
VehicleZoneDistribution.police.vehicles = {};
VehicleZoneDistribution.police.vehicles["Base.CarLightsPolice"] = {index = 0, spawnChance = 60};
VehicleZoneDistribution.police.baseVehicleQuality = 0.9;
`;

const result = buildMapVehicleSpawnData(objectsSource, distributionsSource, {
  IGUI_VehicleNameCarLightsPolice: "Police Chevalier Nyala",
  IGUI_VehicleNameCarNormal: "Chevalier Nyala",
});

assert.equal(result.totalZones, 2);
assert.equal(result.definitions.length, 2);
assert.equal(result.definitions.find(({ id }) => id === "police")?.category, "emergency");
assert.equal(result.definitions.find(({ id }) => id === "police")?.vehicles[0]?.name, "Police Chevalier Nyala");
assert.equal(result.definitions.find(({ id }) => id === "trafficjam")?.chanceToSpawnBurnt, 80);
assert.deepEqual(result.zones.map((zone) => zone.slice(1)), [[10, 20, 3, 4], [30, 40, 8, 3]]);

console.log("Map vehicle spawn data tests passed.");
