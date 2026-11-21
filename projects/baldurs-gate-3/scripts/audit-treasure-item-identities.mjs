import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import { readItemProgression, hasMatchingFixedProgression } from "./lib/item-progression.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const items = read("public/data/item-database.json").items;
const resolution = read("map-sources/catalog/treasure-item-resolution.json");
const nativeStats = read("map-sources/catalog/gameplay-stats.json").entries;
const nativeTemplates = read("map-sources/catalog/root-templates.json").templates;
const byStats = new Map(resolution.entries.map((entry) => [entry.statsId, entry]));
let checkedAcquisitions = 0;
for (const entry of resolution.entries.filter(({ mode }) => ["explicit-root", "matching-progression-root"].includes(mode))) {
  if (entry.mode === "explicit-root") assert(!entry.itemGroup, "Progression must not be mistaken for a fixed generating root");
  else {
    const native = readItemProgression([path.resolve(root, entry.progression.sourcePath)], root).get(entry.itemGroup);
    assert.deepEqual(entry.progression, native, "Progression evidence must match original source rows");
    assert(hasMatchingFixedProgression(native, entry.rootTemplateId), "Progression and stat must agree at all levels and rarities");
  }
  assert.equal(entry.rootTemplateId, nativeStats[entry.statsId]?.rootTemplate?.toLowerCase());
  const siblings = items.filter(({ statsId }) => statsId === entry.statsId);
  const actual = siblings.filter(({ templateIds }) => templateIds.includes(entry.rootTemplateId)).map(({ id }) => id);
  assert(actual.length > 0);
  assert.deepEqual([...entry.acceptedItemIds].sort(), actual.sort());
  for (const item of siblings) for (const acquisition of item.acquisitions) {
    if (!["vendor", "random-loot"].includes(acquisition.kind)) continue;
    checkedAcquisitions += 1;
    assert(item.templateIds.includes(entry.rootTemplateId), `Invalid generated-item acquisition: ${item.name}/${acquisition.source}`);
  }
}

let removedFalseAcquisitions = 0, preservedAppearances = 0, changedSearchMaps = 0;
const affectedItems = new Set();
if (process.argv[2]) {
  const baseline = path.resolve(process.argv[2]);
  const previous = read(path.join(baseline, "item-database.json")).items;
  const omit = (value, fields) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
  assert.deepEqual(items.map((item) => omit(item, ["acquisitions"])), previous.map((item) => omit(item, ["acquisitions"])));
  const oldById = new Map(previous.map((item) => [item.id, item]));
  const key = (acquisition) => JSON.stringify(omit(acquisition, ["id"]));
  for (const item of items) {
    const before = oldById.get(item.id);
    const oldKeys = new Set(before.acquisitions.map(key)), newKeys = new Set(item.acquisitions.map(key));
    assert([...newKeys].every((value) => oldKeys.has(value)), "Identity repair must not invent a new acquisition");
    for (const acquisition of before.acquisitions) {
      if (newKeys.has(key(acquisition))) continue;
      assert(["vendor", "random-loot"].includes(acquisition.kind));
      assert(byStats.get(item.statsId)?.rejectedSiblingItemIds.includes(item.id));
      affectedItems.add(item.id);
      removedFalseAcquisitions += 1;
    }
  }
  for (const entry of fs.readdirSync(baseline, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const before = read(path.join(baseline, entry.name, "locations.json"));
    const after = read(`public/maps/${entry.name}/locations.json`);
    assert.deepEqual(after.locations.map((location) => omit(location, ["searchTerms", "categoryFacets"])),
      before.locations.map((location) => omit(location, ["searchTerms", "categoryFacets"])));
    preservedAppearances += after.locations.length;
    if (JSON.stringify(before) !== JSON.stringify(after)) changedSearchMaps += 1;
  }
}
const review = resolution.entries.filter(({ mode }) => mode.startsWith("requires-") || mode === "unresolved-source-reference")
  .map((entry) => {
    const rootItems = items.filter(({ templateIds }) => templateIds.includes(entry.rootTemplateId));
    const rootStatus = !entry.rootTemplateId ? "no-resolved-stat-root"
      : rootItems.length ? rootItems.some(({ statsId }) => statsId === entry.statsId) ? "matching-item-stats" : "root-exists-with-other-stats"
      : nativeTemplates[entry.rootTemplateId] ? "root-excluded-from-item-database" : "root-missing-from-template-catalog";
    return { statsId: entry.statsId, mode: entry.mode, rootTemplateId: entry.rootTemplateId, rootStatus,
      rootItems: rootItems.map(({ id, name, statsId }) => ({ id, name, statsId })) };
  });
const stats = { items: items.length, checkedAcquisitions, removedFalseAcquisitions, affectedSiblingItems: affectedItems.size,
  preservedAppearances, changedSearchMaps, ...resolution.stats };
writeGeneratedFile(path.join(root, "map-sources/catalog/treasure-item-identity-audit.json"), `${JSON.stringify({
  scope: "Fixed generating roots, including universal progression that selects the same root. Conflicting progression, missing-root and unresolved references remain outside proven completion.", stats, review,
}, null, 2)}\n`);
console.log("Treasure item identity/conservation audit:", stats);
