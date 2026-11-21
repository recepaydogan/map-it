import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { build } from "esbuild";
import { readLocalization } from "./lib/localization.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 7, "Usage: audit-scene-item-transfers.mjs <stage> <items> <index> <normal-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, ".."), [stage, itemsPath, indexPath, generatedStage, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const digest = (data) => createHash("sha256").update(data).digest("hex"), hashes = {};
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file)), verify = (values) => {
  for (const [file, expected] of Object.entries(values)) assert.equal(digest(bytes(file)), expected, `Stale proof: ${file}`);
};
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
bytes(import.meta.filename);
const manifest = read(path.join(stage, "stage-manifest.json")); assert.equal(manifest.kind, "canonical-scene-item-transfer-stage"); verify(manifest.hashes);
const snapshot = read(manifest.snapshotPath), proof = read(snapshot.proofPath);
assert.deepEqual(proof.errors, []); assert.equal(digest(bytes(snapshot.proofPath)), snapshot.proofHash);
for (const [file, expected] of Object.entries(proof.hashes)) {
  const captured = snapshot.snapshots[file]; if (captured) assert.equal(captured.hash, expected);
  assert.equal(digest(bytes(captured?.path ?? file)), expected);
}
for (const captured of Object.values(snapshot.snapshots)) assert.equal(digest(bytes(captured.path)), captured.hash);
for (const file of Object.keys(snapshot.snapshots)) bytes(file);
if (snapshot.priorSnapshotPath) assert.equal(digest(bytes(snapshot.priorSnapshotPath)), snapshot.priorSnapshotHash);
const originalManifest = read(path.join(snapshot.stage, "stage-manifest.json")), before = read(originalManifest.sceneContentPath);
const catalog = read(manifest.sceneContentPath); verify(catalog.hashes);
const recipe = read(catalog.inputs.recipe), items = read(itemsPath), previousItems = read(snapshot.itemsPath);
const itemsById = new Map(items.items.map((item) => [item.id, item])); assert.equal(itemsById.size, items.items.length);
assert.deepEqual(items.items.map((item) => item.id), previousItems.items.map((item) => item.id));
for (const item of previousItems.items) assert.deepEqual(omit(itemsById.get(item.id), ["acquisitions"]), omit(item, ["acquisitions"]));
assert.deepEqual(items.recipes, previousItems.recipes); assert.deepEqual(items.categories, previousItems.categories);

// Independently delimit these actual native rules and strip line comments
// outside quoted strings; do not use the producer's logical rule reader.
const clean = (line) => {
  let quoted = false, escaped = false;
  for (let i = 0; i < line.length; i++) {
    if (!quoted && line[i] === "/" && line[i + 1] === "/") return line.slice(0, i).trim();
    if (line[i] === '"' && !escaped) quoted = !quoted;
    escaped = line[i] === "\\" && !escaped;
  }
  return line.trim();
};
const nativeRules = new Map();
for (const review of recipe.reviews) {
  const lines = bytes(review.sourcePath).toString().split(/\r?\n/).map(clean), first = review.actionLine - 1;
  const boundary = (line) => /^(?:IF|IFF|PROC|QRY|EXITSECTION|ENDEXITSECTION)$/.test(line ?? "");
  let start = first; while (start >= 0 && !boundary(lines[start])) start--;
  assert(start >= 0); let end = start + 1; while (end < lines.length && !boundary(lines[end])) end++;
  const then = lines.indexOf("THEN", start); assert(then > start && then < first);
  const evidence = [];
  for (let i = start + 1; i < end; i++) {
    if (!lines[i] || ["AND", "THEN"].includes(lines[i])) continue;
    assert(/^(?:NOT )?[A-Za-z_]\w*\(/.test(lines[i])); assert(/\);?$/.test(lines[i]));
    evidence.push({ sourcePath: review.sourcePath, sourceLine: i + 1, statement: lines[i].replace(/;$/, "") });
  }
  assert.deepEqual(evidence.filter((entry) => entry.sourceLine < then + 1).map((entry) => entry.statement), review.requiredGuards);
  assert.deepEqual(evidence.filter((entry) => entry.sourceLine > then + 1).map((entry) => entry.statement), review.requiredActions);
  assert.deepEqual(catalog.reviews.find((value) => value.id === review.id)?.evidence, evidence); nativeRules.set(review.id, evidence);
}
assert.equal(nativeRules.size, 4);
const oldProfiles = new Map(before.profiles.map((profile) => [profile.id, profile])), newProfiles = new Map(catalog.profiles.map((profile) => [profile.id, profile]));
assert.deepEqual([...newProfiles.keys()], [...oldProfiles.keys()]);
const refined = new Map();
for (const [id, profile] of newProfiles) {
  if (equal(profile, oldProfiles.get(id))) continue;
  assert.deepEqual(omit(profile, ["itemTransfers"]), oldProfiles.get(id)); assert.equal(profile.itemTransfers.length, 1);
  const [transfer] = profile.itemTransfers, request = recipe.transfers.find((value) => value.profileIds.includes(id)); assert(request);
  assert.equal(transfer.mode, "move-existing-item"); assert.equal(transfer.objectId, request.objectId);
  assert.equal(transfer.destinationContentId, profile.characterContentId); assert.equal(transfer.item.amount, 1);
  assert.deepEqual(transfer.localizedConditions, request.localizedConditions); assert.deepEqual(transfer.evidence, nativeRules.get(request.reviewId));
  const source = read(request.objectSourcePath).save.regions.Templates.GameObjects.find((object) => object.MapKey?.value === transfer.objectId); assert(source);
  const item = itemsById.get(transfer.item.itemId); assert(item && item.generation.sourceObjectId === source.MapKey.value);
  assert.equal(item.generation.sourcePath, request.objectSourcePath); assert.equal(transfer.item.templateId, source.TemplateName.value);
  assert.equal(transfer.item.statsId, item.statsId); assert.equal(transfer.item.title, item.name); assert.deepEqual(transfer.item.localizedNames, item.localizedNames);
  for (const [language, name] of [["en", "english"], ["tr", "turkish"]]) {
    const file = `map-sources/converted/localization/${name}/${name}.xml`; bytes(file);
    assert.equal(transfer.item.localizedNames[language], readLocalization(path.join(root, file)).get(source.DisplayName.handle));
  }
  const action = transfer.evidence.find((entry) => entry.sourceLine === recipe.reviews.find((value) => value.id === request.reviewId).actionLine).statement;
  assert(action.startsWith("ToInventory(")); assert(action.includes(transfer.objectId) && action.includes(profile.characterContentId));
  assert(/,\s*1,\s*0,\s*1\)$/.test(action)); refined.set(id, profile);
}
assert.equal(refined.size, 2); assert.deepEqual([...refined.keys()].sort(), [...catalog.enrichedProfileIds].sort());
const bundle = await build({ absWorkingDir: root, stdin: { resolveDir: root, loader: "ts", contents:
  `export { getMapScenePossessionGroups as currentGroups } from './src/features/map/map-scene-possession-groups.ts';
   export { getMapScenePossessionGroups as previousGroups } from ${JSON.stringify(`./${snapshot.snapshots["src/features/map/map-scene-possession-groups.ts"].path}`)};
   export { presentItemAcquisitions } from './src/features/items/item-acquisition-presentation.ts';` },
bundle: true, platform: "node", format: "esm", write: false, metafile: true });
for (const file of Object.keys(bundle.metafile.inputs)) if (file !== "<stdin>") bytes(file);
const { currentGroups, previousGroups, presentItemAcquisitions } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const uiPath = "src/features/map/map-location-details.tsx", ui = bytes(uiPath).toString().replaceAll("\r\n", "\n");
const oldUi = bytes(snapshot.snapshots[uiPath].path).toString().replaceAll("\r\n", "\n");
const oldGate = "content?.sceneContext?.equipmentChange || content?.sceneContext?.inventoryChange";
const newGate = "content?.sceneContext && (content.sceneContext.equipmentChange || content.sceneContext.inventoryChange || Boolean(content.sceneContext.itemTransfers?.length))";
assert(oldUi.includes(oldGate)); assert.deepEqual(ui, oldUi.replace(oldGate, newGate));
const visible = new Function("content", `return Boolean(${newGate});`);
let appearances = 0, identicalEntities = 0, changedPins = 0, sceneRows = 0, visibleTransfers = 0;
const changedLocations = new Map(), appearancesByScene = new Map(), expectedAdditions = [];
assert.deepEqual(manifest.maps, originalManifest.maps);
for (const mapId of manifest.maps) {
  const contentPath = `public/maps/${mapId}/content.json`, candidatePath = `map-sources/catalog/${mapId}-placements.json`, locationPath = `public/maps/${mapId}/locations.json`;
  const oldContent = read(path.join(snapshot.stage, contentPath)), currentContent = read(path.join(stage, contentPath));
  const oldCandidates = read(path.join(snapshot.stage, candidatePath)), currentCandidates = read(path.join(stage, candidatePath));
  const oldLocations = read(path.join(snapshot.stage, locationPath)), currentLocations = read(path.join(stage, locationPath));
  assert.deepEqual(omit(currentContent, ["entities"]), omit(oldContent, ["entities"]));
  assert.deepEqual(omit(currentCandidates, ["candidates"]), omit(oldCandidates, ["candidates"]));
  assert.deepEqual(omit(currentLocations, ["locations"]), omit(oldLocations, ["locations"]));
  assert.deepEqual(currentContent.entities.map((entity) => entity.id), oldContent.entities.map((entity) => entity.id));
  assert.deepEqual(currentCandidates.candidates.map((entity) => entity.id), oldCandidates.candidates.map((entity) => entity.id));
  const candidatesById = new Map(currentCandidates.candidates.map((entity) => [entity.id, entity]));
  const locationsById = new Map(currentLocations.locations.map((location) => [location.contentId, location]));
  for (const [index, entity] of currentContent.entities.entries()) {
    appearances++; const old = oldContent.entities[index], profile = refined.get(entity.sceneContext?.id);
    if (profile) {
      assert.deepEqual({ ...entity, sceneContext: omit(entity.sceneContext, ["itemTransfers"]) }, old);
      assert.deepEqual(entity.sceneContext.itemTransfers, profile.itemTransfers); assert(!appearancesByScene.has(profile.id));
      const location = locationsById.get(entity.id); assert(location); appearancesByScene.set(profile.id, { mapId, entity, location });
      changedLocations.set(`${mapId}/${location.id}`, profile.itemTransfers.flatMap(({ item }) => [...Object.values(item.localizedNames), item.statsId]));
      const groups = currentGroups(entity.sceneContext, items.items), oldGroups = previousGroups(old.sceneContext, previousItems.items);
      assert.deepEqual(groups.slice(0, oldGroups.length), oldGroups); assert.equal(groups.length, oldGroups.length + profile.itemTransfers.length);
      for (const transfer of profile.itemTransfers) {
        const group = groups.find((entry) => entry.id === `${profile.id}:transfer:${transfer.id}`); assert(group);
        assert.deepEqual(group.localizedConditions, transfer.localizedConditions); assert.equal(group.branches.length, 1); assert.equal(group.branches[0].rows.length, 1);
        assert.deepEqual(group.branches[0].rows[0].source, transfer.item); assert.deepEqual(group.branches[0].rows[0].item, itemsById.get(transfer.item.itemId));
        assert(visible(entity)); visibleTransfers++; sceneRows++;
        const conditions = Object.fromEntries(Object.entries(transfer.localizedConditions).map(([language, text]) => [language,
          `${profile.localizedDescriptions[language] ?? profile.localizedDescriptions.en}\n\n${text}`]));
        expectedAdditions.push({ itemId: transfer.item.itemId, mapId, locationId: location.id, sourceId: profile.characterContentId, conditions });
      }
    } else {
      assert.deepEqual(entity, old); identicalEntities++;
      if (entity.sceneContext) assert.deepEqual(currentGroups(entity.sceneContext, items.items), previousGroups(old.sceneContext, previousItems.items));
    }
  }
  for (const candidate of oldCandidates.candidates) {
    const current = candidatesById.get(candidate.id), profile = refined.get(candidate.sceneContent?.id);
    assert.deepEqual(profile ? { ...current, sceneContent: omit(current.sceneContent, ["itemTransfers"]) } : current, candidate);
  }
  assert.deepEqual(currentLocations.locations.map((location) => location.id), oldLocations.locations.map((location) => location.id));
  for (const old of oldLocations.locations) {
    const current = locationsById.get(old.contentId), terms = changedLocations.get(`${mapId}/${old.id}`);
    if (terms) { assert.deepEqual(current, { ...old, searchTerms: [...(old.searchTerms ?? []), ...terms] }); changedPins++; }
    else assert.deepEqual(current, old);
  }
  for (const file of [contentPath, candidatePath, locationPath, `public/maps/${mapId}/metadata.json`, `map-sources/catalog/${mapId}-placement-rejections.json`]) {
    const current = bytes(path.join(stage, file)), old = bytes(path.join(snapshot.stage, file));
    assert.equal(digest(current), manifest.outputHashes[file]); assert.equal(digest(old), originalManifest.outputHashes[file]);
    if (![...appearancesByScene.values()].some((value) => value.mapId === mapId) || ![contentPath, candidatePath, locationPath].includes(file)) assert.deepEqual(current, old);
  }
}
assert.equal(appearancesByScene.size, refined.size); assert.equal(changedPins, refined.size);
const previousIndex = read(snapshot.indexPath), currentIndex = read(indexPath);
assert.deepEqual(omit(currentIndex, ["locations"]), omit(previousIndex, ["locations"]));
assert.equal(currentIndex.locations.length, previousIndex.locations.length);
for (const [index, location] of currentIndex.locations.entries()) {
  const old = previousIndex.locations[index], terms = changedLocations.get(`${location.mapId}/${location.id}`);
  if (terms) {
    assert.deepEqual(omit(location, ["searchTerms"]), omit(old, ["searchTerms"]));
    // The index appends gameplay aliases after the marker's own terms. Check
    // exact additions and retained order, not an invented append position.
    assert(terms.every((term) => !(old.searchTerms ?? []).includes(term)));
    assert.deepEqual(location.searchTerms.filter((term) => !terms.includes(term)), old.searchTerms ?? []);
    assert.deepEqual(location.searchTerms.filter((term) => terms.includes(term)), terms);
  }
  else assert.deepEqual(location, old);
}
const generated = read(path.join(generatedStage, "stage-manifest.json"));
assert.equal(generated.previousStageRoot, stage); assert.deepEqual(generated.maps.slice().sort(), [...new Set([...appearancesByScene.values()].map((value) => value.mapId))].sort());
let normalEntities = 0;
for (const mapId of generated.maps) {
  const normalContent = read(path.join(generatedStage, `public/maps/${mapId}/content.json`)), canonical = read(path.join(stage, `public/maps/${mapId}/content.json`));
  assert.deepEqual(normalContent.entities, canonical.entities); normalEntities += canonical.entities.length;
  assert.deepEqual(read(path.join(generatedStage, `map-sources/catalog/${mapId}-placements.json`)).candidates,
    read(path.join(stage, `map-sources/catalog/${mapId}-placements.json`)).candidates);
}
let preservedAcquisitions = 0, presentationRecords = 0, newAcquisitions = 0;
const signature = (row) => JSON.stringify(Object.entries(omit(row, ["id"])).sort(([a], [b]) => a.localeCompare(b, "en")));
for (const previousItem of previousItems.items) {
  const item = itemsById.get(previousItem.id), previous = new Map(previousItem.acquisitions.map((row) => [signature(row), row]));
  assert.equal(previous.size, previousItem.acquisitions.length);
  for (const row of item.acquisitions) {
    if (previous.delete(signature(row))) { preservedAcquisitions++; continue; }
    const expected = expectedAdditions.find((value) => value.itemId === item.id && value.mapId === row.mapId && value.locationId === row.locationId); assert(expected);
    assert.equal(row.kind, "carried"); assert.equal(row.certainty, "story"); assert.equal(row.sourceId, expected.sourceId); assert.equal(row.amount ?? 1, 1);
    assert.deepEqual(row.localizedDetails, expected.conditions); assert.deepEqual(row.localizedLocationDetails, expected.conditions);
    assert.equal(row.detail, expected.conditions.en); assert.equal(row.locationDetail, expected.conditions.en); newAcquisitions++;
  }
  assert.equal(previous.size, 0, `Removed acquisition: ${item.id}`);
  const represented = presentItemAcquisitions(item.acquisitions).flatMap((group) => group.acquisitions);
  assert.equal(represented.length, item.acquisitions.length); assert.equal(new Set(represented).size, represented.length);
  for (const row of item.acquisitions) assert(represented.includes(row)); presentationRecords += represented.length;
}
assert.equal(newAcquisitions, expectedAdditions.length); assert.equal(preservedAcquisitions, previousItems.stats.acquisitionRecords);
for (const file of ["scripts/build-scene-item-transfer-catalog.mjs", "scripts/stage-scene-item-transfers.mjs", "scripts/snapshot-reviewed-state.mjs",
  "scripts/lib/localization.mjs", "src/features/map/map-scene-possessions.tsx", "src/features/items/item-acquisition-presentation.ts", ...Object.keys(snapshot.snapshots)]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), expected, `Changed during audit: ${file}`);
const report = { kind: "independent-scene-item-transfer-audit", stage, itemsPath, indexPath, generatedStage,
  stats: { maps: manifest.maps.length, appearances, identicalEntities, refinedScenes: refined.size, changedSearchPins: changedPins,
    nativeRules: nativeRules.size, sceneRows, visibleTransfers, normalMaps: generated.maps.length, normalEntities,
    items: items.items.length, preservedAcquisitions, newAcquisitions, presentationRecords, nativeConnections: currentIndex.connections.length },
  errors: [], hashes };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ stats: report.stats, hashes: Object.keys(hashes).length, output: relative(output) }));
