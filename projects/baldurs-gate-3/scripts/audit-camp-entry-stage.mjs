import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 7, "Usage: audit-camp-entry-stage.mjs <old-raw> <new-raw> <canonical> <source-audit> <fresh-report>");
const [beforeRoot, afterRoot, canonical, sourcePath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outputRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outputRelative && !outputRelative.startsWith("..") && !path.isAbsolute(outputRelative) && !fs.existsSync(output));
const hashes = {}, errors = [], removed = [], changed = [], added = [];
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), name = relative(absolute), hash = digest(data);
  assert(!hashes[name] || hashes[name] === hash, `Changed input: ${name}`); hashes[name] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const keyed = (rows) => {
  const result = new Map(rows.map((row) => [row.id, row])); assert.equal(result.size, rows.length); return result;
};
const check = (condition, message) => { if (!condition) errors.push(message); };
const source = read(sourcePath), beforeManifest = read(path.join(beforeRoot, "stage-manifest.json")),
  afterManifest = read(path.join(afterRoot, "stage-manifest.json")), canonicalManifest = read(path.join(canonical, "stage-manifest.json"));
assert.equal(source.kind, "camp-entry-projection-conservation-audit"); assert.deepEqual(source.errors, []);
for (const [file, expected] of Object.entries(source.hashes)) assert.equal(digest(bytes(file)), expected, `Stale source projection: ${file}`);
assert.equal(beforeManifest.storyLocationsPath, source.beforePath); assert.equal(afterManifest.storyLocationsPath, source.afterPath);
assert.equal(afterManifest.previousStageRoot, canonical); assert.equal(beforeManifest.previousStageRoot, canonical);
assert.equal(afterManifest.kind, "unfinalized-placement-stage");
const catalog = read(source.afterPath), excluded = keyed(catalog.excludedCampEntryDestinations);
const review = read(source.sourcePath), reviews = keyed(review.reviewed), currentRelations = keyed(catalog.scriptedDestinations);
const relationIds = (profile, selectedOnly = false) => !profile ? [] : [
  ...profile.kinds.map((kind) => `${profile.characterContentId}:${kind}:${profile.anchorContentId}`),
  ...(!selectedOnly ? (profile.alternateDestinations ?? []).map((entry) => `${profile.characterContentId}:${entry.kind}:${entry.anchorContentId}`) : []),
];
const expectedMaps = beforeManifest.maps.filter((mapId) => read(path.join(beforeRoot, `public/maps/${mapId}/content.json`)).entities
  .some((entity) => relationIds(entity.storyDestination).some((id) => reviews.has(id))));
assert.deepEqual([...afterManifest.maps].sort(), [...expectedMaps].sort());
const load = (directory, mapId) => ({
  content: read(path.join(directory, `public/maps/${mapId}/content.json`)),
  markers: read(path.join(directory, `public/maps/${mapId}/locations.json`)),
  candidates: read(path.join(directory, `map-sources/catalog/${mapId}-placements.json`)),
  rejections: read(path.join(directory, `map-sources/catalog/${mapId}-placement-rejections.json`)),
});
const fields = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((field) => !equal(before[field], after[field]));
let beforeCount = 0, afterCount = 0, preservedCanonical = 0, references = 0;
for (const mapId of afterManifest.maps) {
  const previous = load(beforeRoot, mapId), next = load(afterRoot, mapId), oldEntities = keyed(previous.content.entities), newEntities = keyed(next.content.entities);
  const canonicalFile = `public/maps/${mapId}/content.json`, canonicalBytes = bytes(path.join(canonical, canonicalFile));
  assert.equal(digest(canonicalBytes), canonicalManifest.outputHashes[canonicalFile]);
  const accepted = keyed(JSON.parse(canonicalBytes).entities);
  beforeCount += oldEntities.size; afterCount += newEntities.size;
  for (const [id, entity] of accepted) {
    check(newEntities.has(id), `Accepted appearance removed: ${mapId}/${id}`);
    check(equal(newEntities.get(id)?.worldPosition, entity.worldPosition), `Accepted world position changed: ${mapId}/${id}`);
    if (newEntities.has(id)) preservedCanonical++;
  }
  for (const [id, entity] of oldEntities) if (!newEntities.has(id)) {
    const selected = relationIds(entity.storyDestination, true);
    check(!accepted.has(id) && selected.length && selected.every((relation) => excluded.has(relation)), `Unexplained removal: ${mapId}/${id}`);
    removed.push({ mapId, id, title: entity.title, relations: selected, reasons: selected.map((relation) => excluded.get(relation)?.reason) });
  }
  for (const [id, entity] of newEntities) {
    if (!oldEntities.has(id)) added.push({ mapId, id, title: entity.title });
    for (const relation of relationIds(entity.storyDestination)) {
      check(!excluded.has(relation) && currentRelations.has(relation), `Invalid destination reference retained: ${mapId}/${id}/${relation}`);
      if (reviews.has(relation)) references++;
    }
  }
  check(equal(previous.rejections, next.rejections), `Rejections changed: ${mapId}`);
  for (const [label, oldRows, nextRows, allowed] of [
    ["entity", previous.content.entities, next.content.entities, ["storyDestination"]],
    ["marker", previous.markers.locations, next.markers.locations, []],
    ["candidate", previous.candidates.candidates, next.candidates.candidates, ["storyDestination"]],
  ]) {
    const before = keyed(oldRows), after = keyed(nextRows);
    check(equal([...after.keys()].sort(), [...newEntities.keys()].sort()), `Mismatched ${label} IDs: ${mapId}`);
    for (const [id, row] of after) if (before.has(id)) {
      const differences = fields(before.get(id), row);
      if (differences.length) changed.push({ mapId, id, label, fields: differences });
      check(differences.every((field) => allowed.includes(field)), `Unreviewed ${label} fields: ${mapId}/${id}/${differences.join(",")}`);
    }
  }
  const missingIds = new Set([...oldEntities.keys()].filter((id) => !newEntities.has(id)));
  const expectedLinks = (previous.content.relationships ?? []).filter((link) => !missingIds.has(link.fromId));
  check(equal(next.content.relationships ?? [], expectedLinks), `Unreviewed relationships changed: ${mapId}`);
}
check(!added.length, `Unexpected new identities: ${added.length}`);
bytes(import.meta.filename);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const stats = { maps: afterManifest.maps.length, beforeRawAppearances: beforeCount, afterRawAppearances: afterCount,
  removedUnpublishedAppearances: removed.length, addedAppearances: added.length, preservedCanonicalAppearances: preservedCanonical,
  retainedReviewedSourceReferences: references, changedRecords: changed.length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "camp-entry-stage-conservation-audit", beforeRoot, afterRoot, canonical, sourcePath,
  stats, removed, added, changed, hashes, errors,
  scope: "Actual isolated generation, scoped source exclusions, complete retained-record and accepted-ID/world-position conservation. Unchanged old fields are not proof of correct camp scene roles, gear, loot or presentation. This raw stage is not approved for publication." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
