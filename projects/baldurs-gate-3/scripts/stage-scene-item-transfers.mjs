import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { readVerifiedSceneContentCatalog, applySceneContentProfile, applySceneInventorySearch } from "./lib/scene-content-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 5, "Usage: stage-scene-item-transfers.mjs <snapshot> <catalog> <fresh-stage>");
const root = path.resolve(import.meta.dirname, ".."), [snapshotPath, catalogPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const digest = (data) => createHash("sha256").update(data).digest("hex"), hashes = {}, outputHashes = {}, pending = new Map();
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file)), snapshot = read(snapshotPath), proof = read(snapshot.proofPath);
assert.deepEqual(proof.errors, []); assert.equal(digest(bytes(snapshot.proofPath)), snapshot.proofHash);
for (const [file, expected] of Object.entries(proof.hashes)) {
  const captured = snapshot.snapshots[file]; if (captured) assert.equal(captured.hash, expected);
  assert.equal(digest(bytes(captured?.path ?? file)), expected, `Stale baseline: ${file}`);
}
const base = snapshot.stage, manifest = read(path.join(base, "stage-manifest.json"));
const before = read(manifest.sceneContentPath), after = readVerifiedSceneContentCatalog(catalogPath, root); bytes(catalogPath);
for (const file of Object.keys(after.hashes)) bytes(file);
const oldById = new Map(before.profiles.map((profile) => [profile.id, profile])), refined = new Map();
assert.deepEqual(after.profiles.map((profile) => profile.id), before.profiles.map((profile) => profile.id));
for (const profile of after.profiles) if (!equal(profile, oldById.get(profile.id))) {
  const { itemTransfers, ...unchanged } = profile; assert(itemTransfers?.length); assert.deepEqual(unchanged, oldById.get(profile.id));
  refined.set(profile.id, profile);
}
assert.deepEqual([...refined.keys()].sort(), [...after.enrichedProfileIds].sort());
const changes = [], matched = new Set(), identities = new Set(); let appearances = 0;
for (const mapId of manifest.maps) {
  const contentPath = `public/maps/${mapId}/content.json`, candidatePath = `map-sources/catalog/${mapId}-placements.json`, locationPath = `public/maps/${mapId}/locations.json`;
  const content = read(path.join(base, contentPath)), candidates = read(path.join(base, candidatePath)), locations = read(path.join(base, locationPath));
  const byId = new Map(candidates.candidates.map((value) => [value.id, value])); let changed = false;
  content.entities = content.entities.map((entity) => {
    appearances++; identities.add(entity.id); const profile = refined.get(entity.sceneContext?.id); if (!profile) return entity;
    assert(!matched.has(profile.id)); matched.add(profile.id); const candidate = byId.get(entity.id); assert(candidate);
    assert.deepEqual(candidate.sceneContent, oldById.get(profile.id)); candidate.sceneContent = profile;
    const matchingLocations = locations.locations.filter((location) => location.contentId === entity.id); assert.equal(matchingLocations.length, 1);
    const location = matchingLocations[0]; Object.assign(location, applySceneInventorySearch(location, profile));
    const updated = applySceneContentProfile(entity, profile), { itemTransfers, ...oldScene } = updated.sceneContext;
    assert(itemTransfers?.length); assert.deepEqual({ ...updated, sceneContext: oldScene }, entity);
    changes.push({ mapId, id: entity.id, profileId: profile.id }); changed = true; return updated;
  });
  for (const file of [contentPath, candidatePath, locationPath, `public/maps/${mapId}/metadata.json`, `map-sources/catalog/${mapId}-placement-rejections.json`]) {
    const data = bytes(path.join(base, file)); assert.equal(digest(data), manifest.outputHashes[file]);
    const document = file === contentPath ? content : file === candidatePath ? candidates : file === locationPath ? locations : null;
    pending.set(file, changed && document ? Buffer.from(`${JSON.stringify(document, null, 2)}\n`) : data);
  }
}
assert.deepEqual([...matched].sort(), [...refined.keys()].sort());
for (const file of [import.meta.filename, "scripts/lib/scene-content-profile.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), expected);
for (const [file, data] of pending) {
  const dest = path.join(output, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); writeGeneratedFile(dest, data); outputHashes[file] = digest(data);
}
const inputs = Object.fromEntries(["configPath", "storyLocationsPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath", "placementRoots"].map((key) => [key, manifest[key]]));
const result = { ...inputs, kind: "canonical-scene-item-transfer-stage", maps: manifest.maps, sceneContentPath: catalogPath, baselineStage: base, snapshotPath,
  stats: { maps: manifest.maps.length, appearances, identities: identities.size, refinedAppearances: changes.length }, changes, hashes, outputHashes,
  requiresGameplayAvailabilityReview: true, requiresSavedStateMigrationBeforePublication: manifest.requiresSavedStateMigrationBeforePublication, publishedDataUnchanged: true };
writeGeneratedFile(path.join(output, "stage-manifest.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(output), stats: result.stats, changes }));
