import assert from "node:assert/strict";
import {
  buildMapLootProfiles,
  getMapLootProfileId,
  parseProceduralDistributionBlocks,
} from "./map-loot-profiler.mjs";

const sample = `ProceduralDistributions.list = {
\tMedicalClinicDrugs = {
\t\trolls = 2,
\t\titems = {
\t\t\t"Bandage", 20,
\t\t\t"Pills", 40,
\t\t}
\t},
\tPoliceStorageGuns = {
\t\trolls = 2,
\t\titems = {
\t\t\t"Pistol", 10,
\t\t}
\t},
};`;

const blocks = parseProceduralDistributionBlocks(sample);
assert.equal(blocks.size, 2);
assert.ok(blocks.has("MedicalClinicDrugs"));
const profiles = buildMapLootProfiles(sample, {
  "Base.Bandage": "Bandage",
  "Base.Pills": "Painkillers",
  "Base.Pistol": "Pistol",
});
assert.deepEqual(profiles.medical.items.slice(0, 2), [
  { id: "Pills", name: "Painkillers", weight: 100 },
  { id: "Bandage", name: "Bandage", weight: 50 },
]);
assert.equal(profiles.police.items[0]?.name, "Pistol");
assert.equal(profiles.police.items[0]?.weight, 100);
assert.equal(getMapLootProfileId("Pharmacy", "medical"), "pharmacy");
assert.equal(getMapLootProfileId("Hospital", "medical"), "medical");

console.log("Map loot profile parsing and ranking tests passed.");
