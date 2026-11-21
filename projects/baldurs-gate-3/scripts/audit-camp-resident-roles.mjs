import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Audit actual generated camp records and their complete prior payloads.
// No production scene application or presentation helpers are imported.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 5, "Usage: audit-camp-resident-roles.mjs <before-stage> <after-stage> <fresh-report>");
const [beforeRoot, afterRoot, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outRelative && !outRelative.startsWith("..") && !path.isAbsolute(outRelative) && !fs.existsSync(output));
const hashes = {}, errors = [], changed = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  const key = path.relative(root, absolute).replaceAll("\\", "/"), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const check = (condition, message) => { if (!condition) errors.push(message); };
const keyed = (rows) => { const result = new Map(rows.map((row) => [row.id, row])); assert.equal(result.size, rows.length); return result; };
const omit = (row, fields) => Object.fromEntries(Object.entries(row).filter(([key]) => !fields.includes(key)));
const before = read(path.join(beforeRoot, "stage-manifest.json")), after = read(path.join(afterRoot, "stage-manifest.json"));
assert.deepEqual(before.maps, after.maps);
for (const key of ["storyLocationsPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath", "previousStageRoot", "configPath"]) assert.equal(before[key], after[key]);
const oldScenes = read(before.sceneContentPath), scenes = read(after.sceneContentPath);
for (const [file, hash] of Object.entries(scenes.hashes)) assert.equal(digest(bytes(file)), hash, `Stale scene input: ${file}`);
const oldProfiles = keyed(oldScenes.profiles), newProfiles = keyed(scenes.profiles);
for (const [id, profile] of oldProfiles) assert.deepEqual(newProfiles.get(id), profile);
const recipe = read(scenes.inputs.campResidentScenes), source = read(recipe.sourceAudit);
assert.equal(digest(bytes(recipe.sourceAudit)), recipe.sourceAuditSha256);
assert.deepEqual(source.errors, []);
const sourceCatalog = read(after.storyLocationsPath);
const nativeAnchors = new Set(source.reviewedRows.map(({ characterId, anchorId }) => `${characterId}/${anchorId}`));
const profileByAnchor = new Map();
for (const profile of scenes.profiles.filter(({ id }) => !oldProfiles.has(id))) {
  const key = `${profile.characterContentId}/${profile.anchorContentId}`;
  assert(nativeAnchors.has(key) && !profileByAnchor.has(key));
  const relations = sourceCatalog.scriptedDestinations.filter(({ character, anchor }) => character.id === profile.characterContentId && anchor.id === profile.anchorContentId);
  const context = relations.find(({ campResidentContext }) => campResidentContext)?.campResidentContext;
  assert(context);
  const definition = recipe.profiles.find(({ contextId }) => contextId === context.id);
  assert(definition && definition.kind === "npc" && definition.omitAuthoredCombat === false);
  const expected = { id: `${definition.id}:${context.camp}`, characterContentId: profile.characterContentId, anchorContentId: profile.anchorContentId,
    kind: "npc", omitAuthoredCombat: false, localizedDescriptions: definition.localizedDescriptions, lootAvailability: definition.lootAvailability,
    evidence: [context.registration, context.campFlags, ...context.recruitment.evidence, ...context.runtime.flatMap(({ evidence }) => evidence)] };
  assert.deepEqual(profile, expected);
  profileByAnchor.set(key, profile);
}
assert.equal(profileByAnchor.size, nativeAnchors.size);
let count = 0, unchanged = 0;
const appliedAnchors = new Set();
for (const mapId of after.maps) {
  const load = (directory, file) => read(path.join(directory, file));
  const oldContent = load(beforeRoot, `public/maps/${mapId}/content.json`), newContent = load(afterRoot, `public/maps/${mapId}/content.json`);
  const oldMarkers = load(beforeRoot, `public/maps/${mapId}/locations.json`), newMarkers = load(afterRoot, `public/maps/${mapId}/locations.json`);
  const oldCandidates = load(beforeRoot, `map-sources/catalog/${mapId}-placements.json`), newCandidates = load(afterRoot, `map-sources/catalog/${mapId}-placements.json`);
  const oldEntities = keyed(oldContent.entities), newEntities = keyed(newContent.entities);
  const beforeMarkers = keyed(oldMarkers.locations), afterMarkers = keyed(newMarkers.locations);
  const beforeCandidates = keyed(oldCandidates.candidates), afterCandidates = keyed(newCandidates.candidates);
  assert.deepEqual([...oldEntities.keys()].sort(), [...newEntities.keys()].sort());
  for (const index of [beforeMarkers, afterMarkers, beforeCandidates, afterCandidates]) assert.deepEqual([...index.keys()].sort(), [...oldEntities.keys()].sort());
  check(equal(omit(oldContent, ["entities"]), omit(newContent, ["entities"])), `Content envelope/relationships changed: ${mapId}`);
  check(equal(omit(oldMarkers, ["locations"]), omit(newMarkers, ["locations"])), `Marker envelope changed: ${mapId}`);
  check(equal(omit(oldCandidates, ["generatedAt", "candidates"]), omit(newCandidates, ["generatedAt", "candidates"])), `Candidate accounting changed: ${mapId}`);
  check(equal(load(beforeRoot, `map-sources/catalog/${mapId}-placement-rejections.json`), load(afterRoot, `map-sources/catalog/${mapId}-placement-rejections.json`)),
    `Rejections changed: ${mapId}`);
  for (const [id, entity] of newEntities) {
    count++;
    const oldEntity = oldEntities.get(id), oldMarker = beforeMarkers.get(id), marker = afterMarkers.get(id),
      oldCandidate = beforeCandidates.get(id), candidate = afterCandidates.get(id);
    const key = entity.storyDestination ? `${entity.storyDestination.characterContentId}/${entity.storyDestination.anchorContentId}` : "";
    const profile = profileByAnchor.get(key);
    if (!profile) {
      check(equal(entity, oldEntity) && equal(marker, oldMarker) && equal(candidate, oldCandidate), `Unrelated complete record changed: ${mapId}/${id}`);
      unchanged++;
      continue;
    }
    appliedAnchors.add(key);
    // These reviewed appearances have no authored loot or trade payload. Fail
    // instead of silently applying this contract to a later inventory change.
    assert(!oldEntity.deathLoot && !oldEntity.tradeInventory && !oldEntity.sceneContext);
    const expectedEntity = { ...oldEntity, kind: "npc", tags: oldEntity.tags.map((tag) => tag === oldEntity.kind ? "npc" : tag),
      sceneContext: { id: profile.id, localizedDescriptions: profile.localizedDescriptions, evidence: profile.evidence } };
    check(equal(entity, expectedEntity), `Resident entity changed beyond reviewed role/context: ${mapId}/${id}`);
    check(equal(marker, { ...oldMarker, category: "npc", subtype: "npc", label: "Character" }), `Resident marker geometry/search changed: ${mapId}/${id}`);
    check(equal(candidate, { ...oldCandidate, candidateKind: "npc", reviewedPresentation: { kind: "npc" }, sceneContent: profile }),
      `Resident candidate changed beyond reviewed role/context: ${mapId}/${id}`);
    check(equal(entity.gameplay, oldEntity.gameplay), `Native combat/stat data changed: ${mapId}/${id}`);
    changed.push({ mapId, id, beforeKind: oldEntity.kind, afterKind: entity.kind, preservedWorldPosition: entity.worldPosition });
  }
}
assert.equal(appliedAnchors.size, nativeAnchors.size);
for (const file of [import.meta.filename, "scripts/lib/reviewed-camp-resident-profiles.mjs", "scripts/build-scene-content-catalog.mjs",
  "scripts/lib/scene-content-profile.mjs", "scripts/build-placement-catalog.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const stats = { maps: after.maps.length, preservedAppearances: count, unchangedCompleteAppearances: unchanged,
  correctedResidentRoles: changed.length, originalSceneProfilesPreserved: oldProfiles.size, newNativeResidentProfiles: profileByAnchor.size };
writeGeneratedFile(output, `${JSON.stringify({ kind: "camp-resident-role-conservation-audit", beforeRoot, afterRoot, stats,
  changed, hashes, errors, scope: "Native reviewed camp-resident role and conditional text, retaining all combat stats, IDs, world/image positions, search terms, rejections, relationships and unrelated complete records. Other camp scenes and whole-map publication remain open." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
