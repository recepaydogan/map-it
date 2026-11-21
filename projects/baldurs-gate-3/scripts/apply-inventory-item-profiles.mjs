import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readLocalization } from "./lib/localization.mjs";
import { readNativeItemPlacements } from "./lib/native-item-placements.mjs";
import { createInventoryItemProfiler, createInventoryOwnerResolver } from "./lib/inventory-item-profile.mjs";
import { createStockTitleResolver } from "./lib/scene-vendor-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const config = read("map-sources/config/placement-maps.json");
const ownerForEntity = createInventoryOwnerResolver(read("map-sources/catalog/party-members.json").members);
const templates = read("map-sources/audits/root-templates-explicit-stats.json");
const stats = read("map-sources/audits/native-item-variant-stats.json");
const localization = Object.fromEntries(Object.entries(config.localization).map(([language, file]) => [language, readLocalization(path.resolve(root, file))]));
const { objects } = readNativeItemPlacements({
  roots: [...config.supplementaryPlacementRoots, ...Object.values(config.placementRoots)].map((file) => path.resolve(root, file)),
  projectRoot: root, localization,
  templateHandle: (id, attribute) => attribute === "DisplayName" ? templates.templates[id]?.displayNameHandle : undefined,
});
const statTitle = createStockTitleResolver(stats, templates);
const profile = createInventoryItemProfiler({ objectForId: (id) => objects.get(id), templateForId: (id) => templates.templates[id],
  statForId: (id) => stats.entries[id], fallbackTitle: (id) => statTitle(id) || id });
const identityFields = new Set(["itemName", "objectId", "templateId", "title", "statsId", "rarity", "slot", "unique"]);
const omitIdentity = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !identityFields.has(key)));
const pending = [], changes = [], unresolved = [];
let rowsInspected = 0;
for (const { id: mapId } of config.maps) {
  const filename = `public/maps/${mapId}/content.json`, content = read(filename);
  const updateRows = (entityId, ownerId, field, rows, deathOnly = false) => rows?.map((row, index) => {
    rowsInspected += 1;
    const owner = objects.get(ownerId);
    const entries = owner?.inventory.filter((entry) => entry.itemName === row.itemName && (!deathOnly || entry.droppedOnDeath)) ?? [];
    if (entries.some((entry) => entry.objectId && !objects.has(entry.objectId))) {
      unresolved.push({ mapId, entityId, ownerId, field, index, itemName: row.itemName,
        reason: "referenced-native-object-missing", objectIds: entries.map(({ objectId }) => objectId).filter(Boolean) });
      return row;
    }
    const profiles = [...new Map(entries.map((entry) => { const result = profile(entry); return [JSON.stringify(result), result]; })).values()];
    if (profiles.length !== 1) {
      unresolved.push({ mapId, entityId, ownerId, field, index, itemName: row.itemName,
        reason: profiles.length ? "multiple-native-identities" : "missing-native-inventory-entry" });
      return row;
    }
    const next = { ...omitIdentity(row), ...profiles[0] };
    if (JSON.stringify(row) !== JSON.stringify(next)) changes.push({ mapId, entityId, ownerId, field, index,
      sourcePath: owner.sourcePath, entries: entries.map((entry) => ({ ...entry,
        ...(entry.objectId && objects.has(entry.objectId) ? { objectSourcePath: objects.get(entry.objectId).sourcePath } : {}) })),
      before: row, after: next });
    return next;
  });
  const start = changes.length;
  for (const entity of Object.values(content.entities)) {
    const ownerId = ownerForEntity(entity);
    if (entity.deathLoot) entity.deathLoot.guaranteedDrops = updateRows(entity.id, ownerId, "deathLoot.guaranteedDrops", entity.deathLoot.guaranteedDrops, true);
    if (entity.containerLoot) entity.containerLoot.items = updateRows(entity.id, ownerId, "containerLoot.items", entity.containerLoot.items);
    const chest = entity.diggableSecret?.buriedChest;
    if (chest?.loot) chest.loot.items = updateRows(entity.id, chest.contentId, "diggableSecret.buriedChest.loot.items", chest.loot.items);
  }
  if (changes.length > start) pending.push({ filename, mapId, content });
}
const applied = process.argv.includes("--apply");
let baseline;
if (applied && pending.length) {
  const previewText = fs.readFileSync(path.join(root, "map-sources/catalog/inventory-item-profile-preview.json"), "utf8");
  const preview = JSON.parse(previewText), audit = read("map-sources/catalog/inventory-item-profile-preview-audit.json");
  assert.equal(audit.reportSha256, createHash("sha256").update(previewText).digest("hex"), "Preview audit is stale");
  assert.equal(audit.checkedRows, changes.length);
  const jsonHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.equal(jsonHash(changes), jsonHash(preview.changes), "Source or published rows changed since the audited preview");
  assert.equal(jsonHash(unresolved), jsonHash(preview.unresolved), "Unresolved source references changed since review");
  baseline = path.relative(root, fs.mkdtempSync(path.join(root, "map-sources/audits/pre-inventory-item-profiles-")));
  for (const filename of ["public/data/item-database.json", "public/maps/index.json", ...pending.flatMap(({ filename, mapId }) => [filename, `public/maps/${mapId}/locations.json`])]) {
    const target = path.join(root, baseline, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, filename), target, fs.constants.COPYFILE_EXCL);
  }
  for (const { filename, content } of pending) writeGeneratedFile(path.join(root, filename), `${JSON.stringify(content, null, 2)}\n`);
}
const report = { applied, baseline, stats: { maps: config.maps.length, changedMaps: pending.length, rowsInspected, changes: changes.length, unresolved: unresolved.length }, changes, unresolved };
writeGeneratedFile(path.join(root, `map-sources/catalog/inventory-item-profile-${applied ? "migration" : "preview"}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log("Inventory item profile source refresh:", report.stats, { applied, baseline });
