import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { readVerifiedSceneContentCatalog, applySceneContentProfile } from "./lib/scene-content-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Apply a source-only availability refinement to an already routed full stage.
// No new placement/routing, reclassification, raster or pin edits are allowed.
assert.equal(process.argv.length, 5, "Usage: stage-scene-availability-refinement.mjs <native-source-audit> <catalog> <fresh-stage>");
const root = path.resolve(import.meta.dirname, "..");
const [proofPath, catalogPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, outputHashes = {}, pending = new Map(), changes = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const proof = read(proofPath); assert.equal(proof.kind, "independent-reconciled-scene-item-source-audit"); assert.deepEqual(proof.errors, []);
for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), hash, `Stale input proof: ${file}`);
const base = proof.stage, manifest = read(path.join(base, "stage-manifest.json"));
const before = read(manifest.sceneContentPath), after = readVerifiedSceneContentCatalog(catalogPath, root); bytes(catalogPath);
for (const file of Object.keys(after.hashes)) bytes(file);
assert.equal(path.resolve(root, after.inputs.baseCatalog), path.resolve(manifest.sceneContentPath));
const previous = new Map(before.profiles.map((profile) => [profile.id, profile])), profiles = new Map(after.profiles.map((profile) => [profile.id, profile]));
assert.deepEqual([...profiles.keys()], [...previous.keys()]);
const refined = new Map();
const omit = (object, fields) => Object.fromEntries(Object.entries(object).filter(([key]) => !fields.includes(key)));
for (const [id, profile] of profiles) if (!equal(profile, previous.get(id))) {
  const old = previous.get(id); assert.equal(profile.deathDropsUnavailable, true); assert(!old.deathDropsUnavailable);
  assert.deepEqual(omit(profile, ["deathDropsUnavailable", "localizedDescriptions", "lootAvailability", "evidence"]),
    omit(old, ["deathDropsUnavailable", "localizedDescriptions", "lootAvailability", "evidence"]));
  assert(old.evidence.every((entry) => profile.evidence.some((row) => equal(row, entry))));
  refined.set(id, profile);
}
assert.deepEqual([...refined.keys()].sort(), [...after.enrichedProfileIds].sort());
let appearances = 0; const identities = new Set(), matchedProfiles = new Set();
for (const mapId of manifest.maps) {
  const contentPath = `public/maps/${mapId}/content.json`, candidatePath = `map-sources/catalog/${mapId}-placements.json`;
  const content = read(path.join(base, contentPath)), candidates = read(path.join(base, candidatePath));
  const byId = new Map(candidates.candidates.map((row) => [row.id, row]));
  let changed = false;
  content.entities = content.entities.map((entity) => {
    appearances++; identities.add(entity.id);
    const profile = refined.get(entity.sceneContext?.id); if (!profile) return entity;
    assert(!matchedProfiles.has(profile.id)); matchedProfiles.add(profile.id);
    const candidate = byId.get(entity.id); assert(candidate);
    assert.deepEqual(candidate.sceneContent, previous.get(profile.id));
    assert(!candidate.deathLoot?.availability, "Unexpected preprojected candidate availability");
    candidate.sceneContent = profile;
    const updated = applySceneContentProfile(entity, profile);
    assert.deepEqual(omit(updated, ["sceneContext", "deathLoot"]), omit(entity, ["sceneContext", "deathLoot"]));
    assert.deepEqual(omit(updated.deathLoot, ["availability"]), omit(entity.deathLoot, ["availability"]));
    changes.push({ mapId, id: entity.id, profileId: profile.id }); changed = true;
    return updated;
  });
  for (const file of [contentPath, candidatePath, `public/maps/${mapId}/locations.json`,
    `public/maps/${mapId}/metadata.json`, `map-sources/catalog/${mapId}-placement-rejections.json`]) {
    const data = bytes(path.join(base, file));
    assert.equal(digest(data), manifest.outputHashes[file], `Changed canonical output: ${file}`);
    const document = file === contentPath ? content : file === candidatePath ? candidates : null;
    pending.set(file, changed && document ? Buffer.from(`${JSON.stringify(document, null, 2)}\n`) : data);
  }
}
assert.deepEqual([...matchedProfiles].sort(), [...refined.keys()].sort());
for (const file of [import.meta.filename, "scripts/lib/scene-content-profile.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
for (const [file, data] of pending) {
  const filename = path.join(output, file); fs.mkdirSync(path.dirname(filename), { recursive: true });
  writeGeneratedFile(filename, data); outputHashes[file] = digest(data);
}
const sourceInputs = Object.fromEntries(["configPath", "storyLocationsPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath"]
  .map((key) => [key, manifest[key]]));
const next = { ...sourceInputs, kind: "canonical-scene-availability-review-stage", maps: manifest.maps,
  sceneContentPath: catalogPath, baselineStage: base, sourceAuditPath: proofPath,
  stats: { maps: manifest.maps.length, appearances, identities: identities.size, refinedAppearances: changes.length }, changes,
  requiresGameplayAvailabilityReview: true, requiresSavedStateMigrationBeforePublication: manifest.requiresSavedStateMigrationBeforePublication,
  publishedDataUnchanged: true, hashes, outputHashes };
writeGeneratedFile(path.join(output, "stage-manifest.json"), `${JSON.stringify(next, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(output), stats: next.stats }));
