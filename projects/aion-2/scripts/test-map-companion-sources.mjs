import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { buildMapCompanionSources } from "./build-map-companion-sources.mjs";
import { attachMapCompanions, getMapCompanionSources } from "../src/features/map/map-companion-sources.ts";
import { createMapSearchDocument, searchMapDocuments } from "../src/features/map/map-fuzzy-search.ts";
import { resolveMapFocusPoint } from "../src/features/map/map-focus-request.ts";

const read = async path => JSON.parse(await readFile(path, "utf8"));
const [index, companions, catalog] = await Promise.all([
  read("public/data/reference/index.json"),
  read("public/data/reference/intelligence/companions.json"),
  read("public/data/reference/map-companion-sources.json"),
]);
assert.deepEqual(catalog, buildMapCompanionSources(index, companions), "Rebuild the companion source catalog after updating reference data");
const mappedPets = new Set();
let markerCount = 0;
for (const mapId of await readdir("public/maps")) {
  const data = await read(`public/maps/${mapId}/metadata.json`);
  const locations = data.locations.filter(point => !point.hiddenFromMap);
  const attached = attachMapCompanions(locations, catalog);
  assert.equal(attached.length, locations.length, "A reward layer must not add duplicate spawns");
  const presented = attached;
  assert.equal(new Set(presented.map(point => point.id)).size, locations.length);
  for (const [i, point] of presented.entries()) {
    const original = locations[i];
    assert.equal(point.id, original.id);
    assert.equal(point.x, original.x);
    assert.equal(point.y, original.y);
    assert.deepEqual(point.reference, original.reference, "Creature detail navigation must survive");
    assert.equal(point.category, original.category, "Reward sources must keep their original marker category");
    assert.equal(point.name, original.name);
    assert.equal(point.iconPath, original.iconPath);
    const sources = getMapCompanionSources(point);
    if (!sources.length) { assert.equal(point, original); continue; }
    markerCount++;
    for (const source of sources) {
      mappedPets.add(source.companion.id);
      await access(`public/${source.companion.icon}`);
      assert.equal(source.required, companions.entries[source.companion.id].required);

    }
  }
}
assert.equal(mappedPets.size, 161, "All companions with world or interior map sources should be reachable");

const source = Object.values(catalog.sources)[0][0];
const first = { id: "first", name: "Source creature", category: "enemy", x: 10, y: 10,
  label: "", region: "", subtype: "enemy", regionId: "", companionSources: [source] };
const second = { ...first, id: "second", companionSources: [{ ...source, companion: { ...source.companion, id: "another", name: "Another pet", icon: "different.png" } }] };
const pins = [first, second];
const map = { id: "test", displayName: "Test map", bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } };
const focus = resolveMapFocusPoint({ mapId: "test", destination: { name: first.name, x: 10, y: 10, companionId: source.companion.id } }, map, [first, second]);
assert.equal(focus.id, first.id, "Pet details must navigate to the existing source marker");
assert.equal(focus, first, "Companion navigation must open the original creature marker");
const unmapped = resolveMapFocusPoint({ mapId: "test", destination: { name: first.name, x: 50, y: 50, companionId: source.companion.id } }, map, [first]);
assert.equal(unmapped.subtype, "coordinate", "Unmatched destinations must not guess another spawn");
const documents = pins.map(point => createMapSearchDocument(point, [point.name, point.label, ...getMapCompanionSources(point).map(({ companion }) => companion.name)], ""));
assert.equal(searchMapDocuments(documents, source.companion.name)[0].point.id, "first");
assert.equal(searchMapDocuments(documents, "Source creature").length, 2);

const standalone = { ...first, id: "standalone", category: "pet-souls", companionSources: undefined };
assert.equal(attachMapCompanions([standalone], catalog)[0], standalone,
  "Standalone soul markers without a drop source must remain on the map");

const fixtureIndex = { entries: [{ id: "pet", name: "Pet", category: "mounts", icon: "portrait.png" }] };
const fixtureRecord = { required: 5, soul: { id: "soul" }, available: true, sources: [{ npc: { id: "npc" }, points: [{ x: 1, y: 1 }] }] };
assert.deepEqual(buildMapCompanionSources(fixtureIndex, { entries: { pet: { ...fixtureRecord, available: false } } }).sources, {});
assert.deepEqual(buildMapCompanionSources(fixtureIndex, { entries: { pet: { ...fixtureRecord, sources: [{ npc: { id: "npc" }, points: [] }] } } }).sources,
  buildMapCompanionSources(fixtureIndex, { entries: { pet: fixtureRecord } }).sources,
  "Verified soul rewards must remain available in creature details without world coordinates");
assert.throws(() => buildMapCompanionSources({ entries: [] }, { entries: { pet: fixtureRecord } }), /portrait/);
console.log(`Companion map tests passed: ${mappedPets.size} pets across ${markerCount} existing markers.`);
