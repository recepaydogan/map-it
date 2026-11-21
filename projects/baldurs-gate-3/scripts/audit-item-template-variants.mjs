import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readNativeItemPlacements } from "./lib/native-item-placements.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const baseline = path.resolve(process.argv[2] ?? "map-sources/audits/pre-stat-template-identity");
const before = read(path.join(baseline, "item-database.json")).items;
const after = read("public/data/item-database.json").items;
// This independent catalog must use the complete item-stat source tree,
// including difficulty/module overrides absent from older placement catalogs.
const nativeStats = read("map-sources/audits/native-item-variant-stats.json").entries;
const templates = read("map-sources/catalog/root-templates.json").templates;
const byId = new Map(after.map((item) => [item.id, item]));
const previousIds = new Set(before.map((item) => item.id));
const omit = (value, fields) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
const acquisitionKey = (value) => JSON.stringify(omit(value, ["id"]));
const migrationPath = "map-sources/catalog/inventory-item-profile-migration.json";
const migration = fs.existsSync(path.join(root, migrationPath)) ? read(migrationPath) : undefined;
if (migration) {
  const proof = read("map-sources/catalog/inventory-item-profile-audit.json");
  assert(proof.applied && proof.unrelatedContentUnchanged && proof.quantitiesAndConditionsUnchanged);
  assert.equal(proof.reportSha256, createHash("sha256").update(fs.readFileSync(path.join(root, migrationPath))).digest("hex"));
  assert.equal(proof.checkedRows, migration.changes.length);
}
const acquisitionItems = new Map();
for (const item of after) for (const acquisition of item.acquisitions) {
  const key = acquisitionKey(acquisition);
  if (!acquisitionItems.has(key)) acquisitionItems.set(key, new Set());
  acquisitionItems.get(key).add(item.id);
}
const sourceDocuments = new Map();
let nativePlacements;
const rawInventoryCorrections = (item, acquisition) => {
  if (acquisition.certainty !== "guaranteed") return [];
  if (!nativePlacements) {
    const config = read("map-sources/config/placement-maps.json");
    nativePlacements = readNativeItemPlacements({
      roots: [...config.supplementaryPlacementRoots, ...Object.values(config.placementRoots)].map((file) => path.join(root, file)),
      projectRoot: root, localization: { en: new Map(), tr: new Map() }, templateHandle: () => undefined,
    }).objects;
  }
  const owner = nativePlacements.get(acquisition.sourceId);
  const corrections = [];
  for (const entry of owner?.inventory ?? []) {
    if (!item.templateIds.includes(entry.templateId) || !entry.objectId) continue;
    const object = nativePlacements.get(entry.objectId);
    if (!object?.templateId || !templates[object.templateId]) continue;
    const expectedKind = owner.ownerKind === "container" ? "container"
      : !entry.droppedOnDeath && !entry.pickpocketable ? "carried" : undefined;
    if (expectedKind !== acquisition.kind || (acquisition.amount ?? 1) !== entry.amount) continue;
    const statsId = object.statsId ?? templateStats(object.templateId);
    for (const next of after.filter((candidate) => candidate.id !== item.id && candidate.templateIds.includes(object.templateId)
      && candidate.statsId === statsId && acquisitionItems.get(acquisitionKey(acquisition))?.has(candidate.id))) {
      corrections.push({ itemId: next.id, kind: "native-carried-inventory", ownerId: owner.id, sourcePath: owner.sourcePath,
        objectId: object.id, objectSourcePath: object.sourcePath, declaredTemplateId: entry.templateId, templateId: object.templateId, statsId });
    }
  }
  return corrections;
};
// Used only to explain a removed legacy name-based link. Replacement identities
// still require native UUID/template/Stats evidence, never this search key.
const legacyNameKey = (value) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const templateStats = (id, visited = new Set()) => {
  assert(!visited.has(id), `Native template inheritance cycle: ${id}`);
  visited.add(id);
  const metadata = templates[id];
  assert(metadata, `Missing native template ${id}`);
  const sourcePath = `map-sources/extracted/root-templates/${metadata.provenance}`;
  if (!sourceDocuments.has(sourcePath)) sourceDocuments.set(sourcePath, read(sourcePath));
  const source = sourceDocuments.get(sourcePath).save.regions.Templates.GameObjects.find((object) => object.MapKey?.value === id);
  assert(source, `Missing native template record: ${id}`);
  if (Object.hasOwn(source, "Stats")) return source.Stats.value;
  return source.ParentTemplateId?.value ? templateStats(source.ParentTemplateId.value, visited) : undefined;
};
const newItems = after.filter(({ id }) => !previousIds.has(id));
const variantsByOrigin = {};
assert.equal(byId.size, after.length, "Item IDs must be unique");
for (const item of before) {
  assert(byId.has(item.id), `Lost existing item ${item.id}`);
  assert.deepEqual(omit(byId.get(item.id), ["acquisitions", "crafting"]), omit(item, ["acquisitions", "crafting"]));
}
for (const item of newItems) {
  const variant = item.generation, stat = nativeStats[item.statsId];
  assert(variant && stat, `Missing native identity: ${item.id}`);
  assert.equal(item.id, `${variant.rootTemplateId}:stats:${item.statsId}`);
  assert.deepEqual(item.templateIds, [variant.rootTemplateId]);
  assert.equal(templateStats(variant.rootTemplateId), variant.templateStatsId, `Template defaults differ: ${item.id}`);
  assert.equal(item.type, stat.type);
  assert.equal(item.rarity, stat.rarity || "Common");
  assert.equal(item.unique, stat.unique);
  assert.deepEqual(item.gameplay.passives, stat.passives, `Equip passives differ: ${item.id}`);
  if (variant.origin === "stat-root") {
    assert.equal(stat.rootTemplate?.toLowerCase(), variant.rootTemplateId);
  } else {
    assert.equal(variant.origin, "placed-override");
    if (!sourceDocuments.has(variant.sourcePath)) sourceDocuments.set(variant.sourcePath, read(variant.sourcePath));
    const objects = sourceDocuments.get(variant.sourcePath).save.regions.Templates.GameObjects;
    assert(objects.some((object) => object.MapKey?.value === variant.sourceObjectId
      && object.TemplateName?.value.toLowerCase() === variant.rootTemplateId
      && object.Stats?.value === item.statsId), `Unproven placed override: ${item.id}`);
  }
  variantsByOrigin[variant.origin] = (variantsByOrigin[variant.origin] ?? 0) + 1;
}

let preservedAppearances = 0, changedSearchMaps = 0;
for (const entry of fs.readdirSync(baseline, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
  const oldLocations = read(path.join(baseline, entry.name, "locations.json"));
  const newLocations = read(`public/maps/${entry.name}/locations.json`);
  assert.deepEqual(newLocations.locations.map((location) => omit(location, ["searchTerms", "categoryFacets"])),
    oldLocations.locations.map((location) => omit(location, ["searchTerms", "categoryFacets"])));
  const expectedContent = read(path.join(baseline, entry.name, "content.json"));
  for (const change of migration?.changes.filter(({ mapId }) => mapId === entry.name) ?? []) {
    const entity = Object.values(expectedContent.entities).find(({ id }) => id === change.entityId);
    const rows = change.field.split(".").reduce((object, key) => object[key], entity);
    assert.deepEqual(rows[change.index], change.before);
    rows[change.index] = change.after;
  }
  assert.deepEqual(read(`public/maps/${entry.name}/content.json`), expectedContent);
  preservedAppearances += newLocations.locations.length;
  if (JSON.stringify(oldLocations) !== JSON.stringify(newLocations)) changedSearchMaps += 1;
}
const relocationReview = [];
let removedGeneratedLinks = 0, relocatedActualLinks = 0, sourceCorrectedLinks = 0;
const sourceCorrections = [];
for (const item of before) {
  const currentKeys = new Set(byId.get(item.id).acquisitions.map(acquisitionKey));
  for (const acquisition of item.acquisitions) {
    if (currentKeys.has(acquisitionKey(acquisition))) continue;
    if (["vendor", "random-loot"].includes(acquisition.kind)) { removedGeneratedLinks += 1; continue; }
    const replacements = newItems.filter((next) => next.templateIds.some((id) => item.templateIds.includes(id))
      && next.acquisitions.some((nextAcquisition) => acquisitionKey(nextAcquisition) === acquisitionKey(acquisition)));
    if (replacements.length) { relocatedActualLinks += 1; continue; }
    const correctedRows = (migration?.changes ?? []).filter((change) => change.ownerId === acquisition.sourceId
      && (change.before.statsId === item.statsId || legacyNameKey(change.before.title) === legacyNameKey(item.name)
        || change.entries.some(({ templateId }) => item.templateIds.includes(templateId))));
    const corrections = correctedRows.flatMap((change) => {
      const row = change.after, stat = nativeStats[row.statsId];
      const templateId = row.templateId || (!stat?.itemGroup ? stat?.rootTemplate?.toLowerCase() : undefined);
      if (!templateId || !row.statsId) return [];
      return after.filter((next) => next.id !== item.id && next.templateIds.includes(templateId) && next.statsId === row.statsId
        && acquisitionItems.get(acquisitionKey(acquisition))?.has(next.id))
        .map((next) => ({ itemId: next.id, mapId: change.mapId, entityId: change.entityId, field: change.field, index: change.index }));
    });
    if (!corrections.length) corrections.push(...rawInventoryCorrections(item, acquisition));
    if (corrections.length) {
      sourceCorrectedLinks += 1;
      sourceCorrections.push({ previousItemId: item.id, acquisition, corrections });
    } else relocationReview.push({ previousItemId: item.id, previousName: item.name, previousStatsId: item.statsId, acquisition });
  }
}
const stats = { preservedItems: before.length, items: after.length, newVariants: newItems.length, variantsByOrigin,
  preservedAppearances, changedSearchMaps, removedGeneratedLinks, relocatedActualLinks, sourceCorrectedLinks, relocationReview: relocationReview.length };
writeGeneratedFile(path.join(root, "map-sources/catalog/item-template-variant-audit.json"), `${JSON.stringify({
  scope: "Native stat/root and placed-override identities, unchanged existing item definitions and map geometry/content. Remaining acquisition relocations require individual source review.",
  stats, sourceCorrections, relocationReview,
}, null, 2)}\n`);
console.log("Item template variant source/conservation audit:", stats);
if (relocationReview.length) process.exitCode = 1;
