import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { build } from "esbuild";
import { readResolvedItemStats, isItemStatFile, listItemSourceFiles } from "./lib/native-item-stats.mjs";
import { readLocalization } from "./lib/localization.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Read physical LSJ objects and inheritance independently of the modified
// placement reader, variant collector and acquisition producer.
assert.equal(process.argv.length, 5, "Usage: audit-placed-item-identities.mjs <snapshot> <item-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, ".."), [snapshotPath, itemStage, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const digest = (data) => createHash("sha256").update(data).digest("hex"), hashes = {};
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash, `Changed during audit: ${file}`); hashes[key] = hash; return data;
};
bytes(import.meta.filename);
const read = (file) => JSON.parse(bytes(file));
const omit = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const snapshot = read(snapshotPath), proof = read(snapshot.proofPath);
assert.equal(digest(bytes(snapshot.proofPath)), snapshot.proofHash); assert.deepEqual(proof.errors, []);
for (const [file, expected] of Object.entries(proof.hashes)) {
  const capture = snapshot.snapshots[file]; if (capture) assert.equal(capture.hash, expected);
  assert.equal(digest(bytes(capture?.path ?? file)), expected, `Changed baseline input: ${file}`);
}
for (const capture of Object.values(snapshot.snapshots)) assert.equal(digest(bytes(capture.path)), capture.hash);
for (const file of Object.keys(snapshot.snapshots)) bytes(file);
const duplicates = read("map-sources/audits/placed-item-source-duplicates.json"); assert.deepEqual(duplicates.errors, []);
assert.equal(path.resolve(duplicates.itemStage), itemStage);
for (const [file, expected] of Object.entries(duplicates.hashes)) assert.equal(digest(bytes(file)), expected);
const manifest = read(path.join(snapshot.stage, "stage-manifest.json"));
const before = read(snapshot.itemsPath), itemsPath = path.join(itemStage, "item-database.json"), after = read(itemsPath);
const resolution = read(path.join(itemStage, "placed-item-identity-resolution.json"));
const oldById = new Map(before.items.map((item) => [item.id, item])), newById = new Map(after.items.map((item) => [item.id, item]));
assert.equal(newById.size, after.items.length); assert.deepEqual(after.recipes, before.recipes);
for (const old of before.items) assert.deepEqual(omit(newById.get(old.id), ["acquisitions"]), omit(old, ["acquisitions"]), `Changed item facts: ${old.id}`);
const oldByRoot = new Map();
for (const item of before.items) for (const id of item.templateIds) {
  const key = `${id}/${item.statsId}`; assert(!oldByRoot.has(key)); oldByRoot.set(key, item);
}
const walk = (dir, extension) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
  ? walk(path.join(dir, entry.name), extension) : entry.name.endsWith(extension) ? [path.join(dir, entry.name)] : []);
const moduleOrder = ["Shared", "SharedDev", "Gustav", "GustavDev", "Honour", "GustavX"];
const rank = (file) => { const index = moduleOrder.findIndex((name) => file.split(path.sep).includes(name)); return index < 0 ? 99 : index; };
const templates = new Map();
for (const file of walk(path.join(root, "map-sources/extracted/root-templates"), ".lsj").sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "en"))) {
  for (const object of read(file).save?.regions?.Templates?.GameObjects ?? []) if (object.MapKey?.value) templates.set(object.MapKey.value.toLowerCase(), object);
}
const inherited = (id, key) => {
  const seen = new Set();
  while (id && templates.has(id)) {
    assert(!seen.has(id)); seen.add(id); const value = templates.get(id);
    if (Object.hasOwn(value, key)) return value[key];
    id = value.ParentTemplateId?.value?.toLowerCase();
  }
};
const statsFiles = listItemSourceFiles(path.join(root, "map-sources/extracted/item-stats"), isItemStatFile);
for (const file of statsFiles) bytes(file);
const stats = readResolvedItemStats(statsFiles, root), localization = {};
for (const [language, name] of [["en", "english"], ["tr", "turkish"]]) {
  const file = `map-sources/converted/localization/${name}/${name}.xml`; bytes(file); localization[language] = readLocalization(path.join(root, file));
}
const objects = new Map(); let nativeFiles = 0;
for (const dir of manifest.placementRoots) for (const file of walk(dir, ".lsj")) {
  nativeFiles++;
  for (const object of read(file).save?.regions?.Templates?.GameObjects ?? []) if (object.MapKey?.value && !objects.has(object.MapKey.value)) {
    objects.set(object.MapKey.value, { object, file: relative(file) });
  }
}
const expectedIdentities = new Map();
for (const [id, { object, file }] of objects) {
  const templateId = object.TemplateName?.value?.toLowerCase(), handle = object.DisplayName?.handle;
  const statsId = object.Stats?.value || inherited(templateId, "Stats")?.value;
  if (!handle || handle === inherited(templateId, "DisplayName")?.handle || inherited(templateId, "Type")?.value !== "item"
    || !["Armor", "Weapon", "Object"].includes(stats.get(statsId)?.type) || !localization.en.has(handle)) continue;
  expectedIdentities.set(id, { object, file, templateId, statsId, handle });
}
assert.equal(resolution.entries.length, expectedIdentities.size);
const resolutionIds = new Set(), baseIdFor = new Map(), namedByObject = new Map(), recoveredItems = [];
let linked = 0, unlinked = 0;
for (const { item, status } of resolution.entries) {
  const id = item.generation.sourceObjectId, source = expectedIdentities.get(id); assert(source && !resolutionIds.has(id)); resolutionIds.add(id);
  assert.equal(item.id, `${source.templateId}:object:${id}`); assert.equal(item.generation.origin, "placed-identity");
  assert.equal(item.generation.sourcePath, source.file); assert.deepEqual(item.templateIds, [source.templateId]); assert.equal(item.statsId, source.statsId);
  const localized = (handle) => Object.fromEntries(Object.entries(localization).map(([language, values]) => [language, values.get(handle)]).filter(([, value]) => value));
  assert.deepEqual(item.localizedNames, localized(source.handle)); assert.equal(item.name, localization.en.get(source.handle));
  const descriptionHandle = (Object.hasOwn(source.object, "Description") ? source.object.Description : inherited(source.templateId, "Description"))?.handle;
  assert.deepEqual(item.localizedDescriptions, localized(descriptionHandle)); assert.equal(item.description, localization.en.get(descriptionHandle));
  const iconId = (Object.hasOwn(source.object, "Icon") ? source.object.Icon : inherited(source.templateId, "Icon"))?.value;
  assert.equal(item.icon?.id, iconId || undefined);
  const base = oldByRoot.get(`${source.templateId}/${source.statsId}`);
  if (base) {
    for (const field of ["category", "subtype", "type", "rarity", "unique", "gameplay", "properties"]) assert.deepEqual(item[field], base[field], `${id}/${field}`);
    baseIdFor.set(item.id, base.id);
  }
  if (status === "linked-item") {
    linked++; assert(item.acquisitions.length > 0); assert.deepEqual(newById.get(item.id), item); namedByObject.set(id, item);
    if (!base) {
      // A localized placed object can exist behind an unnamed root which the
      // old template-only catalog could not represent at all.
      assert(!localization.en.has(inherited(source.templateId, "DisplayName")?.handle));
      const sameStats = before.items.find((entry) => entry.statsId === item.statsId); assert(sameStats);
      for (const field of ["category", "subtype", "type", "rarity", "unique", "gameplay", "properties"]) assert.deepEqual(item[field], sameStats[field]);
      for (const row of item.acquisitions) {
        const owner = objects.get(row.sourceId); assert(owner && !owner.file.split("/").includes("Characters"));
        const entries = (owner.object.ItemList ?? []).flatMap((group) => group.Item ?? []).filter((entry) => entry.UUID?.value === id);
        assert(entries.length > 0); assert.equal(row.kind, "container"); assert.equal(row.certainty, "guaranteed");
        assert.equal(row.amount ?? 1, entries.reduce((sum, entry) => sum + (entry.Amount?.value ?? 1), 0));
      }
      recoveredItems.push({ id: item.id, objectId: id, name: item.name, sourcePath: source.file, acquisitions: item.acquisitions.length });
    }
    assert(item.acquisitions.every((row) => !["random-loot", "vendor", "crafted"].includes(row.kind)), `Generic generator leaked into physical identity: ${id}`);
  } else {
    unlinked++; assert.equal(status, "unlinked-source-object"); assert.deepEqual(item.acquisitions, []); assert(!newById.has(item.id));
  }
}
assert.equal(after.items.length, before.items.length + linked);
const recordKey = (itemId, row) => JSON.stringify([itemId, row.kind, row.sourceId ?? "", row.source, row.mapId ?? "", row.locationId ?? "", row.detail ?? ""]);
const oldRecords = new Map();
for (const item of before.items) for (const row of item.acquisitions) { const key = recordKey(item.id, row); assert(!oldRecords.has(key)); oldRecords.set(key, row); }
const scripted = read("map-sources/audits/scripted-item-transfers-source-rules.json"), statCorrections = [];
const grouped = new Map(); let acquisitions = 0, moved = 0;
for (const item of after.items) for (const row of item.acquisitions) {
  acquisitions++; let baseId = baseIdFor.get(item.id) ?? item.id, key = recordKey(baseId, row);
  if (recoveredItems.some((entry) => entry.id === item.id)) continue;
  if (!oldRecords.has(key)) {
    // The old scripted path ignored placed Stats overrides as well as names.
    // Accept a remap only from an exact physical transfer and its native row.
    const transfers = scripted.transfers.filter((transfer) => transfer.owner.id === row.sourceId
      && (!item.generation?.sourceObjectId || transfer.item.id === item.generation.sourceObjectId)
      && item.templateIds.includes(objects.get(transfer.item.id)?.object.TemplateName?.value)
      && objects.get(transfer.item.id)?.object.Stats?.value === item.statsId);
    const alternatives = [];
    for (const transfer of transfers) {
      const defaultStats = inherited(transfer.item.templateId, "Stats")?.value;
      const old = oldByRoot.get(`${transfer.item.templateId}/${defaultStats}`);
      if (!old || !oldRecords.has(recordKey(old.id, row))) continue;
      for (const evidence of transfer.evidence) {
        const line = bytes(evidence.sourcePath).toString().split(/\r?\n/)[evidence.sourceLine - 1];
        assert(line.includes(transfer.item.id) && line.includes(transfer.owner.id));
      }
      alternatives.push({ old, transfer });
    }
    assert.equal(alternatives.length, 1, `Unproven added acquisition: ${item.id}/${row.id}`);
    const { old, transfer } = alternatives[0]; baseId = old.id; key = recordKey(baseId, row);
    statCorrections.push({ itemId: item.id, previousItemId: baseId, objectId: transfer.item.id, sourceId: row.sourceId, evidence: transfer.evidence });
  }
  assert(oldRecords.has(key), `Unproven added acquisition: ${item.id}/${row.id}`);
  const entries = grouped.get(key) ?? []; entries.push({ item, row }); grouped.set(key, entries);
  if (baseId !== item.id) moved++;
}
assert.equal(grouped.size, oldRecords.size, "Lost original acquisition contexts");
const quantityChanges = [], payloadChanges = []; let splitContexts = 0;
const inventoryItem = (entry) => {
  const objectId = entry.UUID?.value, placed = objects.get(objectId)?.object;
  const templateId = placed?.TemplateName?.value || entry.TemplateID?.value;
  const statsId = placed?.Stats?.value || inherited(templateId, "Stats")?.value;
  return { objectId, templateId, statsId, placed };
};
const verifySourceAmount = (item, row) => {
  const owner = objects.get(row.sourceId); assert(owner, `Missing quantity owner: ${row.sourceId}`);
  if (row.certainty === "story") {
    const transfers = scripted.transfers.filter((transfer) => transfer.owner.id === row.sourceId && transfer.item.id === item.generation?.sourceObjectId);
    assert.equal(transfers.length, 1); const transfer = transfers[0];
    assert.equal(row.kind, transfer.owner.type === "character" ? "carried" : "container");
    assert.equal(row.amount ?? 1, transfer.amount ?? 1);
    for (const evidence of transfer.evidence) {
      const line = bytes(evidence.sourcePath).toString().split(/\r?\n/)[evidence.sourceLine - 1];
      assert(line.includes(transfer.item.id) && line.includes(transfer.owner.id));
    }
    return { kind: "conditional-existing-object-transfer", objectId: transfer.item.id, evidence: transfer.evidence };
  }
  assert.equal(row.certainty, "guaranteed");
  const matching = (owner.object.ItemList ?? []).flatMap((group) => group.Item ?? []).filter((entry) => {
    if (row.kind === "drop" && entry.IsDroppedOnDeath?.value !== true || row.kind === "pickpocket" && entry.CanBePickpocketed?.value !== true) return false;
    const native = inventoryItem(entry), named = namedByObject.get(native.objectId);
    return named ? named.id === item.id : oldByRoot.get(`${native.templateId}/${native.statsId}`)?.id === item.id;
  });
  assert(matching.length > 0, `Missing source quantity: ${item.id}/${row.sourceId}`);
  assert(matching.every((entry) => !entry.OnlyInNPCLoadout?.value && !entry.ExcludeInNPCLoadout?.value));
  assert.equal(row.amount ?? 1, matching.reduce((sum, entry) => sum + (entry.Amount?.value ?? 1), 0));
  return { kind: "native-inventory", sourcePath: owner.file, objectIds: matching.map((entry) => entry.UUID?.value), amount: row.amount ?? 1 };
};
for (const [key, entries] of grouped) {
  const previous = oldRecords.get(key); if (entries.length > 1) splitContexts++;
  for (const { row } of entries) if (!equal(omit(row, ["id", "amount"]), omit(previous, ["id", "amount"]))) payloadChanges.push({ key, previous, row });
  const amount = entries.reduce((sum, { row }) => sum + (row.amount ?? 1), 0);
  if (amount !== (previous.amount ?? 1)) quantityChanges.push({ key, before: previous.amount ?? 1, after: amount,
    entries: entries.map(({ item, row }) => ({ itemId: item.id, objectId: item.generation?.sourceObjectId, amount: row.amount ?? 1,
      source: verifySourceAmount(item, row) })) });
}
for (const change of payloadChanges) {
  assert.equal(change.previous.certainty, "guaranteed"); assert.equal(change.row.certainty, "story");
  assert.deepEqual(omit(change.previous, ["id", "amount", "certainty"]), omit(change.row, ["id", "amount", "certainty"]));
  const entry = grouped.get(change.key).find(({ row }) => row === change.row); assert(entry);
  change.source = verifySourceAmount(entry.item, entry.row);
}
const loadConsumers = async (captured) => {
  const bundle = await build({ absWorkingDir: root, stdin: { resolveDir: root, loader: "ts", contents:
    `export { createItemDatabaseIndex, resolveItemDatabaseEntry } from './src/features/items/item-database-match.ts';
     export { getMapLootRows } from './src/features/map/map-loot-utils.ts';
     export * from './src/features/map/map-loot-display-rows.ts';
     export { presentItemAcquisitions } from './src/features/items/item-acquisition-presentation.ts';` },
  bundle: true, platform: "node", format: "esm", write: false, metafile: true,
  plugins: captured ? [{ name: "captured-source", setup(build) { build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
    const capture = snapshot.snapshots[relative(args.path)];
    return capture ? { contents: bytes(capture.path).toString(), loader: path.extname(args.path) === ".tsx" ? "tsx" : "ts", resolveDir: path.dirname(args.path) } : null;
  }); } }] : [] });
  for (const file of Object.keys(bundle.metafile.inputs)) if (file !== "<stdin>") bytes(captured && snapshot.snapshots[file] ? snapshot.snapshots[file].path : file);
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
};
const current = await loadConsumers(false), previous = await loadConsumers(true);
const currentIndex = current.createItemDatabaseIndex(after.items), previousIndex = previous.createItemDatabaseIndex(before.items);
const currentLootIndex = current.createMapLootDisplayIndex(after.items), genericLootIndex = current.createMapLootDisplayIndex(before.items);
let templateComparisons = 0;
for (const item of before.items) for (const templateId of item.templateIds) {
  const reference = { templateId, statsId: item.statsId, title: item.name };
  assert.equal(current.resolveItemDatabaseEntry(currentIndex, reference)?.id, previous.resolveItemDatabaseEntry(previousIndex, reference)?.id);
  templateComparisons++;
}
for (const [objectId, item] of namedByObject) {
  assert.equal(current.resolveItemDatabaseEntry(currentIndex, { objectId, templateId: item.templateIds[0], statsId: item.statsId, title: item.name })?.id, item.id);
}
let appearances = 0, markerIdentities = 0, lootIdentities = 0, categoryComparisons = 0, presentationRecords = 0;
const lootChanges = [];
for (const mapId of manifest.maps) {
  for (const suffix of [`public/maps/${mapId}/content.json`, `public/maps/${mapId}/locations.json`, `public/maps/${mapId}/metadata.json`,
    `map-sources/catalog/${mapId}-placements.json`, `map-sources/catalog/${mapId}-placement-rejections.json`]) {
    assert.equal(digest(bytes(path.join(snapshot.stage, suffix))), manifest.outputHashes[suffix]);
  }
  for (const entity of read(path.join(snapshot.stage, `public/maps/${mapId}/content.json`)).entities) {
    appearances++;
    if (namedByObject.has(entity.id)) {
      assert.equal(current.resolveItemDatabaseEntry(currentIndex, { objectId: entity.id, templateId: entity.templateId, statsId: entity.statsId, title: entity.title })?.id, namedByObject.get(entity.id).id);
      markerIdentities++;
    }
    const rows = current.getMapLootRows(entity.deathLoot, entity.containerLoot), oldRows = previous.getMapLootRows(entity.deathLoot, entity.containerLoot);
    if (!rows.length && !oldRows.length) continue;
    for (const row of rows) if (row.objectId && namedByObject.has(row.objectId)) {
      assert.equal(current.resolveItemDatabaseEntry(currentIndex, row)?.id, namedByObject.get(row.objectId).id); lootIdentities++;
    }
    const categories = rows.filter((row) => row.kind === "category");
    if (categories.length) {
      assert.deepEqual(current.getMapLootDisplayRows(categories, after.items, currentLootIndex).map((row) => row.id), previous.getMapLootDisplayRows(categories, before.items).map((row) => row.id));
      categoryComparisons++;
    }
    // This comparison uses only the old generic catalog. Named identity changes
    // are checked above; count/odds changes must be separately explained.
    const currentDisplay = current.getMapLootDisplayRows(rows, before.items, genericLootIndex).map((row) => omit(row, ["item"]));
    const oldDisplay = previous.getMapLootDisplayRows(oldRows, before.items).map((row) => omit(row, ["item"]));
    if (!equal(currentDisplay, oldDisplay)) {
      const ownerId = entity.storyDestination?.characterContentId ?? entity.id, owner = objects.get(ownerId); assert(owner);
      assert.deepEqual(currentDisplay.map((row) => row.id).sort(), oldDisplay.map((row) => row.id).sort());
      const changes = [];
      for (const row of currentDisplay) {
        const old = oldDisplay.find((entry) => entry.id === row.id); if (equal(row, old)) continue;
        assert.deepEqual(omit(row, ["amount"]), omit(old, ["amount"])); assert.equal(row.certainty, "guaranteed");
        const sourceRows = (owner.object.ItemList ?? []).flatMap((group) => group.Item ?? []).filter((entry) => {
          if (!entity.containerLoot && entry.IsDroppedOnDeath?.value !== true) return false;
          const native = inventoryItem(entry);
          const handle = native.placed?.DisplayName?.handle || inherited(native.templateId, "DisplayName")?.handle;
          return previous.resolveItemDatabaseEntry(previousIndex, { ...native, title: localization.en.get(handle) ?? entry.ItemName?.value,
            itemName: entry.ItemName?.value })?.id === row.id;
        });
        assert(sourceRows.length > 0); assert(sourceRows.every((entry) => !entry.OnlyInNPCLoadout?.value && !entry.ExcludeInNPCLoadout?.value));
        assert.equal(row.amount, sourceRows.reduce((sum, entry) => sum + (entry.Amount?.value ?? 1), 0), `Source display quantity: ${mapId}/${entity.id}/${row.id}`);
        changes.push({ itemId: row.id, before: old.amount, after: row.amount, sourcePath: owner.file, objectIds: sourceRows.map((entry) => entry.UUID?.value) });
      }
      lootChanges.push({ mapId, id: entity.id, changes });
    }
  }
}
for (const item of after.items) {
  const records = current.presentItemAcquisitions(item.acquisitions).flatMap((group) => group.acquisitions);
  assert.equal(records.length, item.acquisitions.length); assert.equal(new Set(records).size, records.length);
  for (const record of item.acquisitions) assert(records.includes(record)); presentationRecords += records.length;
}
for (const file of [import.meta.filename, "scripts/lib/localization.mjs", "scripts/lib/native-item-stats.mjs", ...Object.keys(snapshot.snapshots)]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), expected, `Changed during audit: ${file}`);
const errors = [];
const report = { kind: "independent-placed-item-identity-audit", stage: snapshot.stage, snapshotPath, itemsPath, indexPath: snapshot.indexPath,
  stats: { maps: manifest.maps.length, appearances, nativeFiles, sourceIdentities: resolution.entries.length, linked, unlinked,
    preservedItems: before.items.length, items: after.items.length, acquisitions, moved, splitContexts, templateComparisons, markerIdentities, lootIdentities,
    categoryComparisons, presentationRecords }, recoveredItems, statCorrections, quantityChanges, payloadChanges, lootChanges, errors, hashes };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errors: errors.slice(0, 8), errorCount: errors.length, hashes: Object.keys(hashes).length, output: relative(output) }));
if (errors.length) process.exitCode = 1;
