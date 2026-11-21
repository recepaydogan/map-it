import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Prove the regional boundary of a source upgrade before reusing untouched
// raw map files. This is not approval of newly introduced encounter content.
assert([5, 7].includes(process.argv.length),
  "Usage: audit-placement-source-upgrade.mjs <base-stage> <overlay-stage> <fresh-report> [--scene-record-audit report]");
const root = path.resolve(import.meta.dirname, "..");
const [baseRoot, overlayRoot, output] = process.argv.slice(2, 5).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const inside = (file) => {
  const value = path.relative(boundary, file);
  return value && !value.startsWith("..") && !path.isAbsolute(value);
};
assert(inside(fs.realpathSync(baseRoot)) && inside(fs.realpathSync(overlayRoot)) && baseRoot !== overlayRoot);
assert(inside(path.join(fs.realpathSync(path.dirname(output)), path.basename(output))) && !fs.existsSync(output));
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashes = {}, errors = [];
const read = (file) => {
  const absolute = path.resolve(root, file), bytes = fs.readFileSync(absolute), key = relative(absolute);
  assert(!hashes[key] || hashes[key] === digest(bytes), `Input changed: ${key}`);
  hashes[key] = digest(bytes);
  return JSON.parse(bytes);
};
const pin = (file) => { hashes[relative(path.resolve(root, file))] = digest(fs.readFileSync(path.resolve(root, file))); };
const check = (condition, message) => { if (!condition) errors.push(message); };
let sceneRecordProof;
if (process.argv.length === 7) {
  assert.equal(process.argv[5], "--scene-record-audit"); sceneRecordProof = read(process.argv[6]);
  assert.equal(sceneRecordProof.kind, "scene-appearance-native-record-audit"); assert.deepEqual(sceneRecordProof.errors, []);
  assert.equal(sceneRecordProof.beforeRoot, baseRoot); assert.equal(sceneRecordProof.afterRoot, overlayRoot);
  assert(Object.keys(sceneRecordProof.hashes ?? {}).length);
  for (const [file, hash] of Object.entries(sceneRecordProof.hashes)) {
    pin(file); assert.equal(hashes[relative(path.resolve(root, file))], hash, `Stale scene record proof: ${file}`);
  }
}
const keyed = (rows, key = (row) => row.id) => {
  const result = new Map(rows.map((row) => [key(row), row]));
  assert.equal(result.size, rows.length, "Duplicate source identity");
  return result;
};
const base = read(path.join(baseRoot, "stage-manifest.json"));
const overlay = read(path.join(overlayRoot, "stage-manifest.json"));
assert.equal(base.kind, "unfinalized-placement-stage");
assert.equal(overlay.kind, base.kind);
const upgradedFields = ["storyLocationsPath", "sceneContentPath"];
for (const key of ["configPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath",
  "previousAnchorContext", "previousStageRoot", "previousContentHashes", "storyDestinationRouting", "recordsIncluded"]) {
  assert.deepEqual(base[key], overlay[key], `Unreviewed contract change: ${key}`);
}
assert.equal(base.recordsIncluded, false);
assert.equal(base.storyDestinationRouting, "superseding-map-first");
const config = read(base.configPath), maps = keyed(config.maps);
assert.deepEqual([...base.maps].sort(), [...maps.keys()].sort());
assert.equal(new Set(overlay.maps).size, overlay.maps.length);
assert(overlay.maps.length && overlay.maps.every((id) => maps.has(id)));
const reusedMaps = base.maps.filter((id) => !overlay.maps.includes(id));
assert(reusedMaps.length);
const before = read(base.storyLocationsPath), after = read(overlay.storyLocationsPath);
const metadataKeys = new Set(["stats", "scriptedDestinations", "scriptedDestinationsByCharacterId",
  "campEntryReviews", "campResidentReviews", "excludedCampEntryDestinations"]);
for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (!metadataKeys.has(key)) check(equal(before[key], after[key]), `Unrelated source field changed: ${key}`);
}
for (const catalog of [before, after]) {
  const grouped = Object.groupBy(catalog.scriptedDestinations, (row) => row.character.id);
  check(equal({ ...grouped }, catalog.scriptedDestinationsByCharacterId), "Destination index differs from source rows");
  check(catalog.stats.scriptedDestinations === catalog.scriptedDestinations.length, "Wrong destination count");
  check(catalog.stats.scriptedDestinationCharacters === Object.keys(grouped).length, "Wrong destination actor count");
}
for (const key of new Set([...Object.keys(before.stats), ...Object.keys(after.stats)])) {
  if (!["scriptedDestinations", "scriptedDestinationCharacters", "excludedCampEntryRelations"].includes(key)) {
    check(equal(before.stats[key], after.stats[key]), `Unrelated source statistic changed: ${key}`);
  }
}
const previousRelations = keyed(before.scriptedDestinations), nextRelations = keyed(after.scriptedDestinations);
const removed = [...previousRelations.values()].filter(({ id }) => !nextRelations.has(id));
const changed = [...nextRelations.values()].filter((row) => previousRelations.has(row.id) && !equal(row, previousRelations.get(row.id)));
const added = [...nextRelations.values()].filter(({ id }) => !previousRelations.has(id));
const oldScenes = read(base.sceneContentPath), nextScenes = read(overlay.sceneContentPath);
const sceneKey = (row) => `${row.characterContentId}/${row.anchorContentId}`;
const previousProfiles = keyed(oldScenes.profiles, sceneKey), nextProfiles = keyed(nextScenes.profiles, sceneKey);
const changedProfiles = [];
for (const [id, profile] of previousProfiles) {
  const next = nextProfiles.get(id);
  if (equal(profile, next)) continue;
  check(next && sceneRecordProof?.matches.some((match) => match.profileId === profile.id), `Existing scene profile changed without record proof: ${id}`);
  if (next) changedProfiles.push(next);
}
if (sceneRecordProof) assert.deepEqual([...new Set(sceneRecordProof.matches.map((row) => row.profileId))].sort(), changedProfiles.map(({ id }) => id).sort());
const addedProfiles = [...nextProfiles.values()].filter((profile) => !previousProfiles.has(sceneKey(profile)));
const affectedProfiles = [...addedProfiles, ...changedProfiles];
for (const [file, expected] of Object.entries(nextScenes.hashes)) {
  pin(file); check(hashes[relative(path.resolve(root, file))] === expected, `Stale scene source: ${file}`);
}

// Include both sides of changed rows: moving an anchor/actor must not make
// the previous side invisible to the impact analysis.
const affectedRows = [...removed, ...added, ...changed, ...changed.map(({ id }) => previousRelations.get(id))];
const relationAnchorIds = new Set(affectedRows.map((row) => row.anchor.id));
const anchorIds = new Set([...affectedRows.map((row) => row.anchor.id), ...affectedProfiles.map((row) => row.anchorContentId)]);
const affectedPairs = new Set([...affectedRows.map((row) => `${row.character.id}/${row.anchor.id}`), ...affectedProfiles.map(sceneKey)]);
const anchorPositions = new Map(), files = new Map();
for (const [stageRoot, manifest] of [[baseRoot, base], [overlayRoot, overlay]]) {
  for (const id of manifest.maps) {
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));
    const documents = {};
    for (const [key, file] of Object.entries({ content: `public/maps/${id}/content.json`,
      locations: `public/maps/${id}/locations.json`, placement: `map-sources/catalog/${id}-placements.json`,
      rejections: `map-sources/catalog/${id}-placement-rejections.json` })) documents[key] = read(path.join(stageRoot, file));
    assert.equal(documents.placement.recordsOmitted, true);
    assert(!Object.hasOwn(documents.placement, "records"));
    files.set(`${stageRoot}/${id}`, documents);
    for (const candidate of documents.placement.candidates) {
      const anchorId = candidate.storyDestination?.anchorContentId;
      if (!anchorIds.has(anchorId)) continue;
      const position = { level: candidate.level, position: candidate.position };
      assert(position.level && ["x", "y", "z"].every((axis) => Number.isFinite(position.position?.[axis])));
      const existing = anchorPositions.get(anchorId);
      check(!existing || equal(existing.native, position), `Conflicting anchor projections: ${anchorId}`);
      if (!existing) anchorPositions.set(anchorId, { native: position, sources: [] });
      anchorPositions.get(anchorId).sources.push({ stageRoot, mapId: id, candidateId: candidate.id });
    }
  }
}
for (const id of anchorIds) check(anchorPositions.has(id), `No positioned source anchor: ${id}`);
const exclusions = [];
for (const id of reusedMaps) {
  const map = maps.get(id), metadata = read(path.join(root, `public/maps/${id}/metadata.json`));
  const bounds = metadata.coordinateReference?.worldBounds;
  assert(bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0, `Missing world bounds: ${id}`);
  const level = map.levelPattern ? new RegExp(map.levelPattern) : null;
  let outsideLevel = 0, outsideBounds = 0, sceneOnlyUnreferenced = 0;
  for (const [anchorId, { native }] of anchorPositions) {
    // Scene profiles decorate an already selected actor/anchor pair. With no
    // relation change they cannot introduce an anchor into an otherwise empty
    // parent map. The recursive stored-reference check below still applies,
    // including alternate/rejected records. Changed relations retain the
    // stronger geometric exclusion because they can create new placements.
    if (!relationAnchorIds.has(anchorId)) { sceneOnlyUnreferenced++; continue; }
    if (level && !level.test(native.level)) { outsideLevel++; continue; }
    const p = native.position;
    if (p.x < bounds.x || p.x > bounds.x + bounds.width || p.z < bounds.y || p.z > bounds.y + bounds.height) {
      outsideBounds++; continue;
    }
    errors.push(`Source upgrade can affect reused map; regenerate it: ${id}/${anchorId}`);
  }
  // Check stored selected and alternate evidence too, including rejected
  // candidates. An absence in displayed content alone is insufficient.
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.characterContentId && value.anchorContentId) {
      for (const anchorId of [value.anchorContentId, ...(value.otherAnchorContentIds ?? [])]) {
        check(!affectedPairs.has(`${value.characterContentId}/${anchorId}`), `Affected stored destination on reused map: ${id}/${anchorId}`);
      }
    }
    for (const child of Object.values(value)) if (typeof child === "object") visit(child);
  };
  visit(files.get(`${baseRoot}/${id}`));
  exclusions.push({ mapId: id, outsideLevel, outsideBounds, sceneOnlyUnreferenced });
}
for (const file of ["scripts/audit-placement-source-upgrade.mjs", "scripts/build-placement-catalog.mjs",
  "scripts/build-registered-placement-maps.mjs", "scripts/lib/story-destination.mjs",
  "scripts/lib/placement-at-anchor.mjs", "scripts/lib/scene-content-profile.mjs"]) pin(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Changed input: ${file}`);
const report = { kind: "regional-placement-source-upgrade-audit", baseRoot, overlayRoot, upgradedFields,
  contracts: Object.fromEntries(upgradedFields.map((key) => [key, { before: base[key], after: overlay[key] }])),
  reusedMaps, overlayMaps: overlay.maps, stats: { configuredMaps: maps.size, reusedMaps: reusedMaps.length,
    refreshedMaps: overlay.maps.length, removedRelations: removed.length, changedRelations: changed.length,
    addedRelations: added.length, unchangedSceneProfiles: previousProfiles.size - changedProfiles.length,
    changedSceneProfiles: changedProfiles.length, addedSceneProfiles: addedProfiles.length,
    affectedAnchors: anchorIds.size, relationAnchors: relationAnchorIds.size,
    anchorMapExclusions: exclusions.reduce((sum, row) => sum + row.outsideLevel + row.outsideBounds, 0),
    sceneOnlyReferenceExclusions: exclusions.reduce((sum, row) => sum + row.sceneOnlyUnreferenced, 0) },
  affectedRelations: { removed: removed.map(({ id }) => id), changed: changed.map(({ id }) => id), added: added.map(({ id }) => id) },
  anchors: [...anchorPositions].map(([id, value]) => ({ id, ...value })), exclusions, hashes, errors,
  scope: "Source-upgrade impact boundary and immutable raw-file reuse only. Anchor positions are those in the source stages; this does not independently re-extract original geometry, approve encounter semantics, establish full map coverage, route pins or publish data." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, stats: report.stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
