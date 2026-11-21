import assert from "node:assert/strict";
import fs from "node:fs";
import { createFloorSelector } from "./lib/floor-volume.mjs";

const read = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const config = read("map-sources/config/placement-maps.json");
const floors = config.maps.filter((map) => map.floorVolumeSelection);
const catalog = read(config.floorVolumes ?? "map-sources/catalog/floor-volumes.json");
const recipes = read("map-sources/config/bc3-maps.json").maps;
const patches = read("public/maps/source-inventory-report.json").patches;
const owners = new Map();
let appearances = 0;
assert.ok(floors.length > 0, "Native floor routing must have published coverage");
for (const floor of floors) {
  const selection = floor.floorVolumeSelection;
  const recipe = recipes.find(({ id }) => id === floor.id);
  assert.ok(recipe, `${floor.id} has no reproducible raster recipe`);
  const sources = (recipe.layers ?? [recipe]).map(({ source }) => source);
  for (const patchId of selection.patchIds) {
    const patch = patches.find(({ id }) => id === patchId);
    assert.ok(patch?.texture && sources.some((source) => source.endsWith(`/${patch.texture}_0.dds`)),
      `${floor.id} declares floor ${patchId} but renders another source image`);
  }
  const parent = config.maps.find(({ id }) => id === selection.mapId);
  assert.ok(parent?.supersededBy?.includes(floor.id), `${floor.id} is not routed out of its parent`);
  const parentIds = new Set(Object.values(read(`public/maps/${parent.id}/content.json`).entities).map(({ id }) => id));
  const matchesFloor = createFloorSelector(selection, catalog);
  const metadata = read(`public/maps/${floor.id}/metadata.json`);
  assert.equal(metadata.rasterEncoding.nativeDimensionsVerified, true, `${floor.id} uses unverified source dimensions`);
  for (const entity of Object.values(read(`public/maps/${floor.id}/content.json`).entities)) {
    const expectedTitle = floor.candidateTitleOverrides?.[entity.id]?.en ?? parent.candidateTitleOverrides?.[entity.id]?.en;
    const expectedKind = floor.candidateKindOverrides?.[entity.id] ?? parent.candidateKindOverrides?.[entity.id];
    if (expectedTitle) assert.equal(entity.title, expectedTitle, `${entity.id} lost its reviewed title during floor routing`);
    if (expectedKind) assert.equal(entity.kind, expectedKind, `${entity.id} lost its reviewed kind during floor routing`);
    assert.ok(matchesFloor(entity.navigationPortal?.sourcePosition ?? entity.worldPosition), `${floor.id}/${entity.id} is on the wrong native floor`);
    assert.ok(!parentIds.has(entity.id), `${entity.id} is still displayed on the parent roof`);
    const key = `${parent.id}/${entity.id}`;
    assert.ok(!owners.has(key), `${entity.id} is duplicated on ${owners.get(key)} and ${floor.id}`);
    owners.set(key, floor.id);
    appearances += 1;
  }
}
console.log(`Native floor routing passed: ${floors.length} floors, ${appearances} appearances, no wrong-floor or parent duplicates.`);

// A source-backed action is insufficient if its enclosing rule is debug-only.
// Preserve the real lower-floor actor without publishing the debug teleport.
const characterId = "594ba359-ce55-4b54-9efc-94eca306c540";
const anchorId = "2da51c13-8e94-4da2-aef0-9a0802d7b335";
const sourceMap = "gauntlet-of-shar-statue-base";
const destinationMap = "gauntlet-of-shar-level-2";
const original = Object.values(read(`public/maps/${sourceMap}/content.json`).entities)
  .find(({ id }) => id === characterId);
const arrival = Object.values(read(`public/maps/${destinationMap}/content.json`).entities)
  .find(({ id }) => id === `${characterId}:destination:${anchorId}`);
const storyLocations = read("map-sources/catalog/story-location-relations.json");
const relation = storyLocations.scriptedDestinations
  .find(({ character, anchor }) => character.id === characterId && anchor.id === anchorId);
const excluded = storyLocations.excludedScriptedDestinations
  .find(({ character, anchor }) => character.id === characterId && anchor.id === anchorId);
assert.ok(original, "The actor's original lower-floor appearance must remain");
assert.equal(relation, undefined, "Debug-only arrival must not enter playable story destinations");
assert.equal(arrival, undefined, "Debug-only teleport must not become a playable floor marker");
assert.ok(excluded?.rule.debugOnly && excluded.evidence.length, "Keep the exclusion's exact source-rule evidence");
console.log("Debug-only floor destination excluded with evidence; original actor preserved.");
