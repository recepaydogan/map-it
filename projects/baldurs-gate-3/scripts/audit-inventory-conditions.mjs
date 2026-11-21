import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { build } from "esbuild";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent native parsing and explicit branch enumeration. Do not import
// the new condition reader, quantity calculator, stage or item producer.
assert.equal(process.argv.length, 7, "Usage: audit-inventory-conditions.mjs <stage> <items> <index> <generated-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [stage, itemsPath, indexPath, generatedStage, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outputRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outputRelative && !outputRelative.startsWith("..") && !path.isAbsolute(outputRelative) && !fs.existsSync(output));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const verify = (values) => { for (const [file, hash] of Object.entries(values)) assert.equal(digest(bytes(file)), hash, file); };
const omit = (row, fields) => Object.fromEntries(Object.entries(row).filter(([key]) => !fields.includes(key)));
const stripConditions = (input) => Array.isArray(input) ? input.map(stripConditions)
  : input && typeof input === "object" ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== "inventoryCondition")
    .map(([key, value]) => [key, stripConditions(value)])) : input;
const manifest = read(path.join(stage, "stage-manifest.json")); assert.equal(manifest.kind, "canonical-inventory-condition-stage"); verify(manifest.hashes);
const snapshot = read(manifest.snapshotPath), proof = read(snapshot.proofPath);
assert.equal(digest(bytes(snapshot.proofPath)), snapshot.proofHash); assert.deepEqual(proof.errors, []);
for (const [file, hash] of Object.entries(proof.hashes)) {
  const captured = snapshot.snapshots[file]; if (captured) assert.equal(captured.hash, hash);
  assert.equal(digest(bytes(captured?.path ?? file)), hash, `Changed baseline: ${file}`);
}
const originalManifest = read(path.join(snapshot.stage, "stage-manifest.json"));
assert.deepEqual(manifest.maps, originalManifest.maps);
assert.deepEqual(manifest.maps.slice().sort(), read(manifest.configPath).maps.map((map) => map.id).sort());
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
  ? walk(path.join(directory, entry.name)) : entry.name.endsWith(".lsj") ? [path.join(directory, entry.name)] : []);
const objects = new Map(), conditionalSources = [], flagIds = new Set(); let nativeRows = 0, nativeFiles = 0;
for (const directory of manifest.placementRoots) for (const file of walk(directory)) {
  nativeFiles++;
  for (const object of read(file).save?.regions?.Templates?.GameObjects ?? []) {
    const id = object.MapKey?.value; if (!id) continue;
    const rows = (object.ItemList ?? []).flatMap((group) => group.Item ?? []);
    nativeRows += rows.length;
    for (const row of rows) {
      const predicates = [...(row.OnlyInNPCLoadout ?? []), ...(row.ExcludeInNPCLoadout ?? [])];
      assert(predicates.length <= 1, "Unreviewed compound predicate");
      const difficulties = ["CasualExplorer", "Classic", "TacticianHardcore", "HonorHardcore"].filter((key) => row[key]?.value === true);
      assert(difficulties.length === 0 || difficulties.length === 4, "Unreviewed difficulty subset");
      if (predicates.length) {
        const flag = predicates[0].Object?.value; assert(flag); flagIds.add(flag);
        conditionalSources.push({ sourcePath: relative(file), id, itemName: row.ItemName.value, flagId: flag,
          present: (row.OnlyInNPCLoadout ?? []).length > 0 });
      }
    }
    if (!objects.has(id)) objects.set(id, { object, rows, sourcePath: relative(file) });
    else if (rows.some((row) => row.OnlyInNPCLoadout || row.ExcludeInNPCLoadout)) {
      assert.deepEqual(rows, objects.get(id).rows, `Disagreeing native extraction: ${id}`);
    }
  }
}
assert.equal(flagIds.size, 1, "Review branch enumeration before accepting another native loadout flag");
const sourceCondition = (row) => row.OnlyInNPCLoadout?.length ? { flagId: row.OnlyInNPCLoadout[0].Object.value, present: true }
  : row.ExcludeInNPCLoadout?.length ? { flagId: row.ExcludeInNPCLoadout[0].Object.value, present: false } : undefined;
const conditionalOwners = new Set(conditionalSources.map((row) => row.id));
const modes = [false, true];
const sourceQuantity = (rows) => {
  const totals = modes.map((mode) => rows.reduce((sum, row) => sum + (!sourceCondition(row) || sourceCondition(row).present === mode
    ? row.Amount?.value ?? 1 : 0), 0));
  return { minimum: Math.min(...totals), maximum: Math.max(...totals) };
};
const bundle = await build({ absWorkingDir: root, stdin: { resolveDir: root, loader: "ts", contents:
  `export { getMapLootRows as previousRows } from ${JSON.stringify(`./${snapshot.snapshots["src/features/map/map-loot-utils.ts"].path}`)};
   export { getMapLootRows as currentRows } from "./src/features/map/map-loot-utils.ts";
   export { getMapLootDisplayRows as displayRows } from "./src/features/map/map-loot-display-rows.ts";
   export { presentItemAcquisitions } from "./src/features/items/item-acquisition-presentation.ts";` },
bundle: true, platform: "node", format: "esm", write: false, metafile: true });
for (const file of Object.keys(bundle.metafile.inputs)) if (file !== "<stdin>") bytes(file);
const { previousRows, currentRows, displayRows, presentItemAcquisitions } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const items = read(itemsPath), previousItems = read(snapshot.itemsPath), entities = new Map();
const mapChanges = [], rowChanges = []; let appearances = 0, identicalEntities = 0, unchangedRawProjections = 0, duplicateGroups = 0;
const sortRows = (rows) => rows.slice().sort((a, b) => a.id.localeCompare(b.id, "en"));
for (const mapId of manifest.maps) {
  const contentFile = `public/maps/${mapId}/content.json`, candidateFile = `map-sources/catalog/${mapId}-placements.json`;
  const old = read(path.join(snapshot.stage, contentFile)), current = read(path.join(stage, contentFile));
  const oldCandidates = read(path.join(snapshot.stage, candidateFile)), candidates = read(path.join(stage, candidateFile));
  assert.deepEqual(stripConditions(current), old, `Unrelated content mutation: ${mapId}`);
  assert.deepEqual(stripConditions(candidates), oldCandidates, `Unrelated candidate mutation: ${mapId}`);
  const candidatesById = new Map(candidates.candidates.map((row) => [row.id, row]));
  for (const [index, entity] of current.entities.entries()) {
    appearances++; const previous = old.entities[index]; entities.set(`${mapId}/${entity.id}`, entity);
    const ownerId = entity.storyDestination?.characterContentId ?? entity.id, source = objects.get(ownerId);
    const oldRows = previousRows(previous.deathLoot, previous.containerLoot), nowRows = currentRows(entity.deathLoot, entity.containerLoot);
    const groups = Map.groupBy(previous.deathLoot?.guaranteedDrops ?? [], (row) => JSON.stringify([row.templateId, row.statsId, row.itemName, row.objectId]));
    duplicateGroups += [...groups.values()].filter((group) => group.length > 1).length;
    if (!conditionalOwners.has(ownerId)) {
      assert.deepEqual(entity, previous); assert.deepEqual(nowRows, oldRows); identicalEntities++; unchangedRawProjections++; continue;
    }
    const candidate = candidatesById.get(entity.id); assert(source && candidate);
    assert.equal(candidate.inventoryItems.length, source.rows.length);
    for (const [rowIndex, row] of candidate.inventoryItems.entries()) {
      assert.equal(row.itemName, source.rows[rowIndex].ItemName.value);
      assert.equal(row.amount, source.rows[rowIndex].Amount?.value ?? 1);
      assert.deepEqual(row.inventoryCondition, sourceCondition(source.rows[rowIndex]));
    }
    const nativeDrops = source.rows.filter((row) => row.IsDroppedOnDeath?.value === true);
    for (const profile of [candidate.deathLoot, entity.deathLoot, entity.sceneContext?.authoredLoot].filter(Boolean)) {
      const drops = profile.guaranteedDrops.filter((row) => !row.equipmentSource); assert.equal(drops.length, nativeDrops.length);
      for (const [dropIndex, drop] of drops.entries()) {
        assert.equal(drop.itemName, nativeDrops[dropIndex].ItemName.value);
        assert.deepEqual(drop.inventoryCondition, sourceCondition(nativeDrops[dropIndex]));
      }
    }
    const expectedRows = structuredClone(oldRows);
    for (const row of expectedRows) {
      const native = nativeDrops.filter((entry) => entry.ItemName.value === row.itemName); if (!native.some(sourceCondition)) continue;
      const quantity = sourceQuantity(native); row.amount = quantity.maximum;
      row.certainty = entity.deathLoot?.availability || quantity.minimum !== quantity.maximum ? "conditional" : "guaranteed";
      if (row.certainty === "conditional") delete row.chance; else row.chance = 100;
    }
    assert.deepEqual(sortRows(nowRows), sortRows(expectedRows), `Wrong quantity projection: ${mapId}/${entity.id}`);
    const beforeDisplay = displayRows(oldRows, previousItems.items), afterDisplay = displayRows(nowRows, items.items);
    assert.deepEqual(beforeDisplay.map((row) => row.item.id).sort(), afterDisplay.map((row) => row.item.id).sort());
    for (const row of afterDisplay) {
      const expected = expectedRows.find((entry) => entry.templateId && row.item.templateIds.includes(entry.templateId));
      if (expected) { assert.equal(row.amount, expected.amount); assert.equal(row.certainty, expected.certainty); assert.equal(row.chance, expected.chance); }
    }
    mapChanges.push({ mapId, id: entity.id, ownerId });
    for (const row of nowRows) {
      const prior = oldRows.find((entry) => entry.id === row.id);
      if (!equal(row, prior)) rowChanges.push({ mapId, id: entity.id, itemName: row.itemName,
        before: { amount: prior.amount, certainty: prior.certainty }, after: { amount: row.amount, certainty: row.certainty } });
    }
  }
  for (const file of [contentFile, candidateFile, `public/maps/${mapId}/locations.json`, `public/maps/${mapId}/metadata.json`,
    `map-sources/catalog/${mapId}-placement-rejections.json`]) {
    assert.equal(digest(bytes(path.join(stage, file))), manifest.outputHashes[file]);
    if (file !== contentFile && file !== candidateFile) assert(bytes(path.join(stage, file)).equals(bytes(path.join(snapshot.stage, file))));
  }
}
assert.deepEqual(mapChanges.map((row) => `${row.mapId}/${row.id}`).sort(), manifest.changes.map((row) => `${row.mapId}/${row.id}`).sort());
assert.deepEqual(omit(items, ["items", "generatedAt"]), omit(previousItems, ["items", "generatedAt"]));
assert.deepEqual(items.items.map((item) => item.id), previousItems.items.map((item) => item.id));
const acquisitionChanges = []; let unchangedAcquisitions = 0, presentationRecords = 0;
const acquisitionKey = (row) => JSON.stringify([row.kind, row.sourceId, row.source, row.mapId, row.locationId, row.detail]);
for (const [index, item] of items.items.entries()) {
  const previous = previousItems.items[index]; assert.deepEqual(omit(item, ["acquisitions"]), omit(previous, ["acquisitions"]));
  const current = new Map(item.acquisitions.map((row) => [acquisitionKey(row), row])); assert.equal(current.size, item.acquisitions.length);
  assert.equal(current.size, previous.acquisitions.length, `Acquisition count changed: ${item.name}`);
  for (const old of previous.acquisitions) {
    const row = current.get(acquisitionKey(old)); assert(row); current.delete(acquisitionKey(old));
    if (equal(omit(row, ["id"]), omit(old, ["id"]))) { unchangedAcquisitions++; continue; }
    assert(["drop", "pickpocket", "container", "carried"].includes(row.kind));
    assert.deepEqual(omit(row, ["id", "amount", "certainty", "inventoryVariants"]), omit(old, ["id", "amount", "certainty", "inventoryVariants"]));
    const source = objects.get(row.sourceId); assert(source, `Missing native acquisition owner: ${item.name}/${row.sourceId}`);
    const native = source.rows.filter((entry) => {
      const object = objects.get(entry.UUID?.value)?.object;
      const template = object?.TemplateName?.value || entry.TemplateID?.value;
      const matches = template ? item.templateIds.includes(template.toLowerCase()) : item.statsId === entry.ItemName?.value;
      return matches && (row.kind === "drop" ? entry.IsDroppedOnDeath?.value === true
        : row.kind === "pickpocket" ? entry.CanBePickpocketed?.value === true
        : row.kind === "carried" ? entry.IsDroppedOnDeath?.value !== true && entry.CanBePickpocketed?.value !== true : true);
    });
    assert(native.length, `No native item source: ${item.name}/${row.sourceId}`);
    const quantity = sourceQuantity(native), entity = entities.get(`${row.mapId}/${row.locationId}`);
    // Existing quantity + conditional badge is exact for present/absent stacks.
    // A nonzero variable amount needs a visible range before publication.
    if (quantity.minimum !== quantity.maximum) assert.equal(quantity.minimum, 0, "Variable positive quantity needs range display");
    assert.equal(row.amount ?? 1, quantity.maximum, `Wrong native quantity: ${item.name}/${row.sourceId}/${row.kind}`);
    assert.equal(row.certainty, entity?.deathLoot?.availability || quantity.minimum !== quantity.maximum ? "story" : "guaranteed");
    const variants = native.map((entry) => ({ amount: entry.Amount?.value ?? 1,
      ...(sourceCondition(entry) ? { inventoryCondition: sourceCondition(entry) } : {}) }));
    assert.deepEqual(row.inventoryVariants, quantity.minimum !== quantity.maximum ? variants : undefined);
    if (row.kind === "drop") assert(!entity?.deathLoot?.availability?.deathDropsUnavailable);
    acquisitionChanges.push({ itemId: item.id, sourcePath: source.sourcePath, before: old, after: row });
  }
  const groups = presentItemAcquisitions(item.acquisitions), projected = groups.flatMap((group) => group.acquisitions);
  assert.equal(new Set(projected).size, item.acquisitions.length); assert.equal(projected.length, item.acquisitions.length);
  for (const group of groups) {
    const variants = group.acquisitions.map((row) => JSON.stringify(row.inventoryVariants));
    assert.equal(new Set(variants).size, 1, "Presentation merged different native conditions");
  }
  presentationRecords += projected.length;
}
const generated = read(path.join(generatedStage, "stage-manifest.json"));
assert.equal(generated.kind, "unfinalized-placement-stage");
assert.equal(path.resolve(generated.previousStageRoot), path.resolve(snapshot.stage));
verify(generated.previousContentHashes);
let generatedComparisons = 0;
for (const mapId of generated.maps) {
  const actual = read(path.join(generatedStage, `public/maps/${mapId}/content.json`));
  const candidates = read(path.join(generatedStage, `map-sources/catalog/${mapId}-placements.json`));
  const byId = new Map(actual.entities.map((entity) => [entity.id, entity]));
  const staged = read(path.join(stage, `public/maps/${mapId}/content.json`));
  for (const entity of staged.entities) {
    const current = byId.get(entity.id); assert(current, `Normal generator lost ${mapId}/${entity.id}`);
    assert.deepEqual(current.deathLoot, entity.deathLoot, `Normal producer disagrees: ${mapId}/${entity.id}`);
    assert.deepEqual(current.containerLoot, entity.containerLoot);
    generatedComparisons++;
  }
  for (const row of manifest.changes.filter((entry) => entry.mapId === mapId)) {
    assert.deepEqual(candidates.candidates.find((entry) => entry.id === row.id)?.inventoryItems,
      read(path.join(stage, `map-sources/catalog/${mapId}-placements.json`)).candidates.find((entry) => entry.id === row.id)?.inventoryItems);
  }
}
assert(manifest.changes.every((row) => generated.maps.includes(row.mapId)));
const index = read(indexPath); assert.deepEqual(index, read(snapshot.indexPath)); assert.equal(index.locations.length, appearances);
for (const file of [import.meta.filename, "scripts/build-item-database.mjs", "scripts/build-placement-catalog.mjs",
  "scripts/lib/native-item-placements.mjs", "scripts/lib/native-inventory-condition.mjs", "src/lib/inventory-quantity.mjs",
  "src/lib/inventory-quantity.d.mts", "src/features/map/types.ts", "src/features/items/types.ts",
  "src/features/items/item-acquisition-source-card.tsx", "src/index.css", "scripts/build-registered-placement-maps.mjs",
  "scripts/stage-inventory-conditions.mjs", "map-sources/audits/scripted-item-transfers-source-rules.json"]) bytes(file);
verify(hashes);
const report = { kind: "independent-inventory-condition-audit", stage, itemsPath, indexPath, generatedStage,
  stats: { maps: manifest.maps.length, appearances, identicalEntities, refinedAppearances: mapChanges.length, nativeFiles, nativeRows,
    conditionalOwners: conditionalOwners.size, rawConditionalSourceRows: conditionalSources.length, duplicateDeathInventoryGroups: duplicateGroups,
    unchangedRawProjections, changedLootRows: rowChanges.length, preservedItems: items.items.length,
    acquisitions: items.stats.acquisitionRecords, unchangedAcquisitions, changedAcquisitions: acquisitionChanges.length,
    presentationRecords, generatedMaps: generated.maps.length, generatedComparisons, nativeConnections: index.connections.length },
  conditionalSources, mapChanges, rowChanges, acquisitionChanges, hashes, errors: [],
  scope: "All real staged map/candidate records and item payloads compared; independent native branch quantities; normal producer inventory comparison on every regenerated map; real pure selectors only. No tests, app/browser checks, live publication, raster edits or full-goal acceptance. Loadout GUID kept as source eligibility without inventing a human difficulty label. Existing full geometry proof transfers through unchanged pin/metadata bytes." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(output), stats: report.stats, hashes: Object.keys(hashes).length, errors: [] }));
