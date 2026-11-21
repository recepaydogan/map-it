import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readLocalization } from "./lib/localization.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const reportPath = `map-sources/catalog/inventory-item-profile-${process.argv.includes("--preview") ? "preview" : "migration"}.json`;
const reportText = fs.readFileSync(path.join(root, reportPath), "utf8"), report = JSON.parse(reportText);
const templates = read("map-sources/audits/root-templates-explicit-stats.json").templates;
const stats = read("map-sources/audits/native-item-variant-stats.json").entries;
const localization = readLocalization(path.join(root, "map-sources/converted/localization/english/english.xml"));
const files = new Map(), currentMaps = new Map(), oldMaps = new Map();
const objects = (file) => {
  assert(file?.startsWith("map-sources/"), `Invalid evidence path: ${file}`);
  if (!files.has(file)) files.set(file, new Map(read(file).save.regions.Templates.GameObjects.map((object) => [object.MapKey?.value, object])));
  return files.get(file);
};
const rowAt = (content, change) => {
  const entity = Object.values(content.entities).find(({ id }) => id === change.entityId);
  assert(entity, `Missing entity ${change.entityId}`);
  return change.field.split(".").reduce((object, key) => object[key], entity);
};
const identityFields = new Set(["itemName", "objectId", "templateId", "title", "statsId", "rarity", "slot", "unique"]);
const omitIdentity = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !identityFields.has(key)));
let templateOverrides = 0, statsOverrides = 0;
const covered = new Set();
for (const change of report.changes) {
  const key = [change.mapId, change.entityId, change.field, change.index].join("/");
  assert(!covered.has(key), `Duplicate row change: ${key}`); covered.add(key);
  const owner = objects(change.sourcePath).get(change.ownerId);
  assert(owner, `Missing native owner: ${change.ownerId}`);
  const nativeEntries = (owner.ItemList ?? []).flatMap(({ Item }) => Item ?? [])
    .filter((entry) => entry.ItemName?.value === change.before.itemName
      && (change.field !== "deathLoot.guaranteedDrops" || entry.IsDroppedOnDeath?.value === true));
  assert.equal(change.entries.length, nativeEntries.length, `Inventory entries differ: ${key}`);
  assert.deepEqual(omitIdentity(change.after), omitIdentity(change.before), `Quantity/conditions changed: ${key}`);
  for (const entry of change.entries) {
    assert(nativeEntries.some((native) => (native.UUID?.value ?? "") === (entry.objectId ?? "")
      && (native.TemplateID?.value ?? "").toLowerCase() === (entry.templateId ?? "")
      && (Number(native.Amount?.value) || 1) === entry.amount), `Unproven native entry: ${key}`);
    const object = entry.objectId ? objects(entry.objectSourcePath).get(entry.objectId) : undefined;
    if (entry.objectId) assert(object, `Missing native inventory object: ${entry.objectId}`);
    const templateId = object?.TemplateName?.value?.toLowerCase() || entry.templateId;
    const template = templates[templateId];
    const statsId = templateId ? Object.hasOwn(object ?? {}, "Stats") ? object.Stats.value : template?.stats
      : stats[entry.itemName]?.id;
    const gameplay = stats[statsId];
    const handle = object?.DisplayName?.handle || template?.displayNameHandle;
    const title = localization.get(handle) || template?.displayName.en
      || templates[stats[statsId || entry.itemName]?.rootTemplate?.toLowerCase()]?.displayName.en || statsId || entry.itemName;
    assert.equal(change.after.title, title, `Native name differs: ${key}`);
    assert.equal(change.after.templateId, templateId || undefined, `Native root differs: ${key}`);
    assert.equal(change.after.objectId, entry.objectId || undefined, `Native UUID differs: ${key}`);
    assert.equal(change.after.statsId, statsId || undefined, `Native Stats differ: ${key}`);
    for (const field of ["rarity", "slot", "unique"]) assert.deepEqual(change.after[field], gameplay?.[field], `${field} differs: ${key}`);
    if (object?.TemplateName?.value?.toLowerCase() && templateId !== entry.templateId) templateOverrides += 1;
    if (object?.Stats?.value && statsId !== template?.stats) statsOverrides += 1;
  }
  if (!currentMaps.has(change.mapId)) {
    currentMaps.set(change.mapId, read(`public/maps/${change.mapId}/content.json`));
    oldMaps.set(change.mapId, report.applied ? read(`${report.baseline}/public/maps/${change.mapId}/content.json`) : structuredClone(currentMaps.get(change.mapId)));
  }
  assert.deepEqual(rowAt(oldMaps.get(change.mapId), change)[change.index], change.before);
  assert.deepEqual(rowAt(currentMaps.get(change.mapId), change)[change.index], report.applied ? change.after : change.before);
  // Reverse only the exact audited rows, then compare the complete map content.
  if (report.applied) rowAt(currentMaps.get(change.mapId), change)[change.index] = change.before;
}
for (const [mapId, content] of currentMaps) assert.deepEqual(content, oldMaps.get(mapId), `Unrelated content changed: ${mapId}`);
assert.equal(report.stats.changes, covered.size);
const summary = { applied: report.applied, reportPath, reportSha256: createHash("sha256").update(reportText).digest("hex"),
  checkedRows: covered.size, checkedMaps: currentMaps.size, templateOverrides, statsOverrides,
  quantitiesAndConditionsUnchanged: true, unrelatedContentUnchanged: true, unresolved: report.unresolved.length };
writeGeneratedFile(path.join(root, `map-sources/catalog/inventory-item-profile-${report.applied ? "audit" : "preview-audit"}.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log("Native inventory profile/conservation audit:", summary);
if (report.unresolved.length) process.exitCode = 1;
