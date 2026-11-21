import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isChestRecord } from "./lib/placement-containers.mjs";

const root = path.resolve(import.meta.dirname, "..");
const chest = { placementKind: "items", stats: "OBJ_Chest_Wood", internalName: "CONT_Chest_000", displayName: { en: "Gilded Chest" } };
assert.equal(isChestRecord(chest), true, "Inventory information is not required to identify a chest");
assert.equal(isChestRecord({ ...chest, stats: "PUZ_Key" }), false, "A chest key is not a chest");
assert.equal(isChestRecord({ ...chest, stats: "ARM_Chest_Plate", gameplay: { type: "Armor" } }), false);
assert.equal(isChestRecord({ ...chest, stats: "WPN_Chest_Hammer", gameplay: { type: "Weapon" } }), false);
assert.equal(isChestRecord({ ...chest, stats: "ARM_Plate", internalName: "ChestArmour" }), false);
assert.equal(isChestRecord({ ...chest, placementKind: "characters" }), false);
assert.equal(isChestRecord({ ...chest, stats: "OBJ_Barrel", internalName: "Barrel", displayName: { en: "Barrel" } }), false);
for (const title of ["Cupboard", "Bird's Nest", "Shabby Wardrobe", "Fish Barrel", "Lobster Cage", "Storage Box", "Big Pot", "Nautiloid Tank", "Opaque Vat", "Display Case"]) {
  assert.equal(isChestRecord({ ...chest, displayName: { en: title } }), false, `${title} is not a chest merely because it inherits chest stats`);
}

for (const [mapId, id] of [
  ["astral-plane-creche", "794e4f1f-ab19-42ed-be9c-fd5f475f8474"],
  ["astral-plane-intermezzo", "f3044ed4-01e3-4320-9e42-81e829b50629"],
]) {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  const source = read(`map-sources/catalog/${mapId}-placements.json`).records.find((record) => record.id === id);
  assert.ok(source && isChestRecord(source));
  const location = read(`public/maps/${mapId}/locations.json`).locations.find((entry) => entry.contentId === id);
  assert.ok(location, `${mapId}: native chest exists even without extracted inventory`);
  assert.ok([location.category, ...(location.categoryFacets ?? [])].includes("chest"));
  const entity = Object.values(read(`public/maps/${mapId}/content.json`).entities).find((entry) => entry.id === id);
  assert.deepEqual(entity.worldPosition, source.position, `${mapId}: the chest retains its scene-specific source coordinates`);
}
console.log("Chest classification passed: source-authored empty-inventory chests remain discoverable without inventing loot.");
