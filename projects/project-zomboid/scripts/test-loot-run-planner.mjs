import assert from "node:assert/strict";
import { resolveLootRunStart, scopeLootRunTargets } from "../src/features/map/loot-run-planner/loot-run-start.ts";
import {
  createLootRunItemCatalog,
  createLootRunTargets,
  getLootRunMatchLevel,
  searchLootRunItems,
  selectLootRunRouteTargets,
} from "../src/features/map/loot-run-planner/loot-run-utils.ts";

const locations = [
  { id: "clinic-near", name: "Clinic", category: "medical", label: "Clinic", subtype: "Clinic", lootProfileId: "medical", townId: "a", town: "A", x: 10, y: 0 },
  { id: "clinic-far", name: "Hospital", category: "medical", label: "Hospital", subtype: "Hospital", lootProfileId: "medical", townId: "b", town: "B", x: 100, y: 0 },
  { id: "pharmacy", name: "Pharmacy", category: "medical", label: "Pharmacy", subtype: "Pharmacy", lootProfileId: "pharmacy", townId: "a", town: "A", x: 20, y: 0 },
];
const lootProfiles = {
  medical: { id: "medical", matchedDistributions: 2, items: [{ id: "Pills", name: "Painkillers", weight: 80 }] },
  pharmacy: { id: "pharmacy", matchedDistributions: 1, items: [{ id: "Pills", name: "Painkillers", weight: 100 }, { id: "Bandage", name: "Bandage", weight: 70 }] },
};
const data = {
  id: "test",
  displayName: "Test",
  schemaVersion: 1,
  gameBuild: "42",
  generatedAt: "2026-01-01T00:00:00.000Z",
  source: "test",
  bounds: { minX: 0, minY: 0, maxX: 200, maxY: 200 },
  tileSize: 256,
  detailLevels: [0],
  towns: [],
  locations,
  lootProfiles,
  statistics: { towns: 0, searchableLocations: locations.length },
  tileSource: { kind: "static", basePath: "/", tilePattern: "{level}/{x}/{y}.png" },
};

const catalog = createLootRunItemCatalog(lootProfiles, locations);
assert.equal(catalog.length, 2);
assert.equal(catalog.find(({ id }) => id === "Pills")?.locationCount, 3);
assert.equal(searchLootRunItems(catalog, "pain", 5)[0]?.id, "Pills");
assert.equal(searchLootRunItems(catalog, "band", 5)[0]?.id, "Bandage");

const targets = createLootRunTargets(data, "Pills", { x: 0, y: 0 });
assert.deepEqual(targets.map(({ location }) => location.id), ["pharmacy", "clinic-near", "clinic-far"]);
assert.deepEqual(selectLootRunRouteTargets(targets, { x: 0, y: 0 }, 2).map(({ location }) => location.id), ["clinic-near", "pharmacy"]);
assert.equal(getLootRunMatchLevel(90), "best");
assert.equal(getLootRunMatchLevel(50), "good");
assert.equal(getLootRunMatchLevel(10), "possible");

const multiItemTargets = createLootRunTargets(data, ["Pills", "Bandage"], { x: 0, y: 0 });
assert.deepEqual(multiItemTargets.map(({ location }) => location.id), ["pharmacy", "clinic-near", "clinic-far"]);
assert.deepEqual(multiItemTargets[0].itemWeights, { Pills: 100, Bandage: 70 });
assert.deepEqual(
  selectLootRunRouteTargets(multiItemTargets, { x: 0, y: 0 }, 2).map(({ location }) => location.id),
  ["clinic-near", "pharmacy"],
);

console.log("Loot run catalog, ranking and route selection tests passed.");

const startData = { ...data, towns: [{ id: "b", name: "B", x: 100, y: 0 }] };
assert.equal(resolveLootRunStart({ mode: "current" }, startData, null, []), null);
assert.deepEqual(resolveLootRunStart({ mode: "current" }, startData, { x: 7, y: 8 }, []), { x: 7, y: 8 });
assert.equal(resolveLootRunStart({ mode: "town", townId: "missing" }, startData, null, []), null);
assert.deepEqual(resolveLootRunStart({ mode: "town", townId: "b" }, startData, null, []), { x: 100, y: 0 });
assert.equal(resolveLootRunStart({ mode: "point", point: { x: -1, y: 0 } }, startData, null, []), null);
assert.deepEqual(resolveLootRunStart({ mode: "point", point: { x: 42, y: 12 } }, startData, null, []), { x: 42, y: 12 });
assert.equal(resolveLootRunStart({ mode: "base", markerId: "deleted" }, startData, null, []), null);
assert.deepEqual(resolveLootRunStart({ mode: "base", markerId: "home" }, startData, null, [{ id: "home", x: 25, y: 30 }]), { x: 25, y: 30 });
const townTargets = scopeLootRunTargets(targets, { mode: "town", townId: "b" }, null);
assert.deepEqual(selectLootRunRouteTargets(townTargets, null).map(({ location }) => location.id), ["clinic-far"]);
assert.deepEqual(scopeLootRunTargets(targets, { mode: "town", townId: "empty" }, null), []);
const distantTarget = { ...targets[0], location: { ...targets[0].location, id: "remote", x: 1601, y: 0 } };
assert.deepEqual(scopeLootRunTargets([distantTarget], { mode: "base", markerId: "home" }, { x: 0, y: 0 }), []);
assert.equal(scopeLootRunTargets([distantTarget], { mode: "base", markerId: "home" }, { x: 1, y: 0 }).length, 1);
console.log("Loot run start selection and town/base boundaries passed.");
