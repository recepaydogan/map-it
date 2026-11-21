import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildMapPetSources } from "./build-map-pet-sources.mjs";
import { attachMapPetSources, getMapPetSources, listMapPetSources, petFilterId } from "../src/features/map/map-pet-sources.ts";

const read = path => JSON.parse(readFileSync(path, "utf8"));
const catalog = read("public/data/reference/map-pet-sources.json");
const petEntries = {};
for (const file of readdirSync("public/data/reference/mounts").filter(file => file.endsWith(".json"))) {
  Object.assign(petEntries, read(`public/data/reference/mounts/${file}`).entries);
}
const search = read("public/data/map-search/index.json");
const shards = {};
for (const chunk of new Set(search.items.map(item => item.chunk))) {
  shards[chunk] = read(`public/data/map-search/${chunk}.json`).sources;
}
assert.deepEqual(catalog, buildMapPetSources(read("public/data/reference/index.json"), petEntries, search, shards),
  "Rebuild map pet sources after updating reference or acquisition data");

const mapped = new Set();
for (const mapId of Object.keys(catalog.sources)) {
  const original = read(`public/maps/${mapId}/metadata.json`).locations;
  const attached = attachMapPetSources(original, catalog, mapId);
  assert.equal(attached.length, original.length);
  for (const [index, point] of attached.entries()) {
    assert.equal(point.id, original[index].id);
    assert.equal(point.category, original[index].category);
    assert.deepEqual(point.reference, original[index].reference);
    for (const pet of getMapPetSources(point)) mapped.add(pet.id);
  }
  assert.deepEqual(listMapPetSources(attached).map(pet => pet.id).sort(),
    [...new Set(attached.flatMap(point => getMapPetSources(point).map(pet => pet.id)))].sort());
}
assert.deepEqual([...mapped].sort(), Object.keys(catalog.pets).sort(), "Every listed pet needs an existing map source");

const pet = { id: "VehicleList:1", name: "Fixture pet", icon: "pet.png", category: "mounts" };
const fixture = buildMapPetSources(
  { entries: [{ ...pet, category: "mounts" }] },
  { [pet.id]: { sections: [{ title: "reference.labels.unlock-items", links: [{ id: "item", category: "items" }] }] } },
  { items: [{ id: "item", chunk: "item" }], locations: [
    { mapId: "world", point: { id: "creature", reference: { id: "npc-creature" } } },
    { mapId: "world", point: { id: "merchant", reference: { id: "npc-merchant" } } },
    { mapId: "world", point: { id: "quest", reference: { id: "npc-quest" } } },
    { mapId: "world", point: { id: "unrelated" } },
  ] },
  { item: { item: [{ location: 0, kind: "loot" }, { location: 1, kind: "purchase" },
    { location: 2, kind: "quest" }, { location: 3, kind: "related" }] } },
);
assert.deepEqual(Object.keys(fixture.sources.world.references).sort(), ["npc-creature", "npc-merchant", "npc-quest"]);
assert.deepEqual(fixture.sources.world.markers, {});
const points = ["npc-creature", "npc-merchant", "npc-quest", "other"].map(id => ({
  id, name: id, category: id === "npc-merchant" ? "merchant" : "enemy", reference: { id }, x: 0, y: 0,
}));
const attached = attachMapPetSources(points, fixture, "world");
assert.deepEqual(attached.map(point => getMapPetSources(point).length), [1, 1, 1, 0]);
const companionFallback = attachMapPetSources([
  { ...points[0], companionSources: [{ companion: pet, soul: { id: "soul" }, required: 5 }] },
], { version: 1, pets: {}, sources: {} }, "world");
assert.deepEqual(getMapPetSources(companionFallback[0]).map(source => source.id), [pet.id],
  "A missing optional acquisition catalog must not hide existing companion sources");
assert.equal(petFilterId(pet.id), "pet:VehicleList:1");
console.log(`Map pet sources passed: ${mapped.size} selectable pets.`);
