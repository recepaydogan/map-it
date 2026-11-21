import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Reconstruct native identity/equipment independently of the appearance
// producer, then compare all real raw records, including untouched maps.
assert.equal(process.argv.length, 5, "Usage: audit-scene-appearance.mjs <before-full-stage> <after-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [beforeRoot, afterRoot, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, errors = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(data)); hashes[key] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const verify = (proof) => {
  assert(Object.keys(proof.hashes ?? {}).length);
  for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), hash, `Stale source: ${file}`);
};
const keyed = (rows) => { const result = new Map(rows.map((row) => [row.id, row])); assert.equal(result.size, rows.length); return result; };
const omit = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const check = (value, message) => { if (!value) errors.push(message); };
const before = read(path.join(beforeRoot, "stage-manifest.json")), after = read(path.join(afterRoot, "stage-manifest.json"));
for (const key of ["kind", "configPath", "storyLocationsPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath",
  "previousAnchorContext", "previousStageRoot", "previousContentHashes", "recordsIncluded", "storyDestinationRouting"]) assert.deepEqual(before[key], after[key]);
assert.equal(after.kind, "unfinalized-placement-stage"); assert(after.maps.every((id) => before.maps.includes(id)));
const config = read(before.configPath); assert.deepEqual([...before.maps].sort(), config.maps.map(({ id }) => id).sort());
const oldCatalog = read(before.sceneContentPath), catalog = read(after.sceneContentPath); verify(catalog);
assert.deepEqual(oldCatalog.profiles.map(({ id }) => id), catalog.profiles.map(({ id }) => id));
assert.equal(catalog.enrichedProfileIds.length, 1);
const profile = catalog.profiles.find(({ id }) => id === catalog.enrichedProfileIds[0]); assert(profile);
const oldProfile = oldCatalog.profiles.find(({ id }) => id === profile.id);
for (const previous of oldCatalog.profiles.filter(({ id }) => id !== profile.id)) assert.deepEqual(catalog.profiles.find(({ id }) => id === previous.id), previous);
assert.deepEqual(omit(profile, ["localizedTitles", "appearance", "equipmentChange"]), oldProfile);
const recipe = read(catalog.inputs.recipe), source = read(catalog.inputs.sourceReview); verify(source); assert.deepEqual(source.errors, []);
assert.equal(profile.characterContentId, source.characterContentId); assert.equal(profile.anchorContentId, source.anchorContentId);
const actor = read(source.nativeActor.sourcePath).save.regions.Templates.GameObjects.find((row) => row.MapKey?.value === source.sourceActorId); assert(actor);
const native = read(source.nativeActor.templatePath).save.regions.Templates.GameObjects.find((row) => row.MapKey?.value === actor.TemplateName.value); assert(native);
const names = {};
for (const [language, file] of Object.entries({ en: "map-sources/converted/localization/english/english.xml", tr: "map-sources/converted/localization/turkish/turkish.xml" })) {
  const matches = [...bytes(file).toString("utf8").matchAll(/<content contentuid="([^"]+)"[^>]*>([^<]+)<\/content>/g)]
    .filter((row) => row[1] === actor.DisplayName.handle);
  assert.equal(matches.length, 1); assert(!matches[0][2].includes("&")); names[language] = matches[0][2];
}
assert.deepEqual(profile.localizedTitles, names);
const ruleBlocks = bytes(source.shapeRule.sourcePath).toString("utf8").split('<node id="Rule">')
  .filter((block) => block.includes(`value="${source.shapeRule.ruleId}"`)); assert.equal(ruleBlocks.length, 1);
const flags = Object.fromEntries([...ruleBlocks[0].split("<children>")[0].matchAll(/<attribute id="([^"]+)" type="[^"]+" value="([^"]*)"\/>/g)]
  .map((row) => [row[1], row[2]]));
for (const flag of ["ApplyVisual", "ChangeIcon", "UseShapeshiftIdentity"]) assert.equal(flags[flag], "true");
assert.equal(flags.RetainDisplayName, "false");
assert.equal(profile.appearance.projection, "identity-only"); assert(profile.omitAuthoredCombat);
assert.deepEqual(omit(profile.appearance, ["authoredStatsId"]), { projection: "identity-only", templateId: actor.TemplateName.value,
  iconId: native.Icon.value, statsId: native.Stats.value, ruleId: source.shapeRule.ruleId,
  sourcePath: source.nativeActor.templatePath, ruleSourcePath: source.shapeRule.sourcePath });
const copy = profile.evidence.filter((row) => row.statement.startsWith("CopyCharacterEquipment(")); assert.equal(copy.length, 1);
const normalize = (value) => value.trim().replace(/;$/, "").replace(/\s+/g, " ");
assert.equal(normalize(bytes(copy[0].sourcePath).toString("utf8").split(/\r?\n/)[copy[0].sourceLine - 1]), copy[0].statement);
assert.deepEqual(copy[0].statement.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g), [profile.characterContentId, source.sourceActorId]);
const equipment = profile.equipmentChange;
assert.equal(equipment.mode, "copy-equipped"); assert.equal(equipment.sourceCharacterContentId, source.sourceActorId);
assert.equal(equipment.definitionId, native.Equipment.value); assert.deepEqual(equipment.removedSlots, []);
assert.deepEqual(equipment.localizedConditions, recipe.localizedEquipmentConditions); assert.deepEqual(equipment.evidence, oldProfile.evidence);
const identityCatalog = read(catalog.inputs.equipmentItems); verify(identityCatalog);
const itemCatalog = read(identityCatalog.inputs.itemDatabase), itemById = keyed(itemCatalog.items);
const definition = identityCatalog.definitions[native.Equipment.value];
const lines = bytes(definition.sourcePath).toString("utf8").split(/\r?\n/);
const expectedItems = definition.groups.map((group) => {
  assert.equal(group.entries.length, 1); const entry = group.entries[0], ref = identityCatalog.references[entry.statsId];
  assert.equal(ref.status, "resolved"); assert.equal(ref.itemIds.length, 1); const item = itemById.get(ref.itemIds[0]);
  assert.equal(item.statsId, entry.statsId); assert(item.templateIds.includes(ref.rootTemplateId));
  assert.equal(lines[entry.sourceLine - 1].trim(), `add equipment entry "${entry.statsId}"`);
  return { itemId: item.id, templateId: ref.rootTemplateId, statsId: item.statsId, title: item.name, localizedNames: item.localizedNames,
    amount: 1, evidence: [{ sourcePath: definition.sourcePath, sourceLine: entry.sourceLine, statement: `add equipment entry "${entry.statsId}"` }] };
});
assert.deepEqual(equipment.items, expectedItems);
const matches = [], generationTimestamps = []; let appearances = 0, identical = 0;
for (const mapId of before.maps) {
  const refreshed = after.maps.includes(mapId), oldDocuments = {}, newDocuments = {};
  for (const [key, file] of Object.entries({ content: `public/maps/${mapId}/content.json`, locations: `public/maps/${mapId}/locations.json`,
    placement: `map-sources/catalog/${mapId}-placements.json`, rejections: `map-sources/catalog/${mapId}-placement-rejections.json` })) {
    oldDocuments[key] = read(path.join(beforeRoot, file)); newDocuments[key] = refreshed ? read(path.join(afterRoot, file)) : oldDocuments[key];
  }
  for (const [key, rows] of [["content", "entities"], ["locations", "locations"], ["placement", "candidates"]]) {
    const ignored = [rows];
    if (key === "placement" && oldDocuments[key].generatedAt !== newDocuments[key].generatedAt) {
      const previous = oldDocuments[key].generatedAt, next = newDocuments[key].generatedAt;
      assert(refreshed && new Date(previous).toISOString() === previous && new Date(next).toISOString() === next && Date.parse(next) >= Date.parse(previous));
      ignored.push("generatedAt"); generationTimestamps.push({ mapId, before: previous, after: next });
    }
    check(equal(omit(oldDocuments[key], ignored), omit(newDocuments[key], ignored)), `Document envelope changed: ${mapId}/${key}`);
    assert.deepEqual(oldDocuments[key][rows].map(({ id }) => id), newDocuments[key][rows].map(({ id }) => id));
  }
  check(equal(oldDocuments.rejections, newDocuments.rejections), `Rejections changed: ${mapId}`);
  const oldMarkers = keyed(oldDocuments.locations.locations), nextMarkers = keyed(newDocuments.locations.locations);
  const oldCandidates = keyed(oldDocuments.placement.candidates), nextCandidates = keyed(newDocuments.placement.candidates), nextEntities = keyed(newDocuments.content.entities);
  for (const entity of oldDocuments.content.entities) {
    const marker = oldMarkers.get(entity.id), nextEntity = nextEntities.get(entity.id); assert(marker && nextEntity); appearances++;
    if (entity.sceneContext?.id !== profile.id) {
      check(equal(entity, nextEntity) && equal(marker, nextMarkers.get(entity.id)) && equal(oldCandidates.get(entity.id), nextCandidates.get(entity.id)), `Unrelated complete triple changed: ${mapId}/${entity.id}`);
      identical++; continue;
    }
    assert(refreshed); assert.equal(profile.appearance.authoredStatsId, entity.statsId); assert(!entity.gameplay?.combat);
    assert.deepEqual(omit(entity.sceneContext, ["authoredCombat"]), { id: oldProfile.id, localizedDescriptions: oldProfile.localizedDescriptions, evidence: oldProfile.evidence });
    const expectedEntity = { ...entity, title: names.en, localizedTitles: names, iconId: native.Icon.value,
      sceneContext: { ...entity.sceneContext, authoredTitles: entity.localizedTitles ?? { en: entity.title },
        authoredIconId: entity.iconId, appearance: profile.appearance, equipmentChange: equipment } };
    check(equal(nextEntity, expectedEntity), `Unexpected appearance entity delta: ${mapId}/${entity.id}`);
    check(equal(nextMarkers.get(entity.id), { ...marker, name: names.en, searchTerms: [...marker.searchTerms, marker.name, ...Object.values(names),
      ...expectedItems.flatMap((item) => [...Object.values(item.localizedNames), item.statsId])] }), `Unexpected appearance marker delta: ${mapId}/${entity.id}`);
    check(equal(nextCandidates.get(entity.id), { ...oldCandidates.get(entity.id), sceneContent: profile }), `Unexpected appearance candidate delta: ${mapId}/${entity.id}`);
    matches.push({ mapId, id: entity.id, profileId: profile.id, beforeTitle: entity.title, afterTitle: names.en, copiedEquipmentItems: expectedItems.length });
  }
}
assert.equal(matches.length, 1);
for (const file of [import.meta.filename, "scripts/build-placement-catalog.mjs", "scripts/build-registered-placement-maps.mjs",
  "scripts/lib/scene-content-profile.mjs", "src/features/map/types.ts"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const stats = { maps: before.maps.length, refreshedMaps: after.maps.length, appearances, identicalCompleteAppearances: identical,
  changedAppearances: matches.length, preservedOtherProfiles: catalog.profiles.length - 1, conditionalEquipmentItems: expectedItems.length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "scene-appearance-native-record-audit", beforeRoot, afterRoot, stats, matches, generationTimestamps,
  hashes, errors, scope: "Independent original name/icon/copy-target/equipment identity reconstruction and complete raw record conservation. Source combat remains provenance, original inventory and death restriction remain unchanged. Conditional copied equipment is not proven obtainable loot. Item/index consumers, full canonical reconciliation and publication remain separate." }, null, 2)}\n`);
console.log(JSON.stringify({ output, stats, errors }, null, 2)); if (errors.length) process.exitCode = 1;
