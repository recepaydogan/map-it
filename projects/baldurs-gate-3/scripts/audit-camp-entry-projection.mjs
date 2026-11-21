import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent complete-file conservation against real source-review records.
// Do not import the projection implementation or execute fixture tests.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 7, "Usage: audit-camp-entry-projection.mjs <before> <after> <source-review> <canonical> <fresh-report>");
const [beforePath, afterPath, sourcePath, canonical, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outputRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outputRelative && !outputRelative.startsWith("..") && !path.isAbsolute(outputRelative) && !fs.existsSync(output), "Use a fresh audit report");
const hashes = {}, errors = [];
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), name = relative(absolute), hash = digest(data);
  assert(!hashes[name] || hashes[name] === hash, `Changed input: ${name}`);
  hashes[name] = hash;
  return data;
};
const read = (file) => JSON.parse(bytes(file));
const keyed = (rows) => {
  const result = new Map(rows.map((entry) => [entry.id, entry]));
  assert.equal(result.size, rows.length, "Duplicate identity"); return result;
};
const before = read(beforePath), after = read(afterPath), source = read(sourcePath), manifest = read(path.join(canonical, "stage-manifest.json"));
assert.equal(source.kind, "camp-entry-native-source-survey");
assert.deepEqual(source.errors, []);
assert.equal(source.catalogPath, beforePath);
for (const [file, expected] of Object.entries(source.hashes)) assert.equal(digest(bytes(file)), expected, `Stale source proof: ${file}`);
const oldRows = keyed(before.scriptedDestinations), nextRows = keyed(after.scriptedDestinations), reviews = keyed(source.reviewed);
const excluded = keyed(after.excludedCampEntryDestinations);
const allowedFields = new Set(["stats", "scriptedDestinations", "scriptedDestinationsByCharacterId", "campEntryReviews", "excludedCampEntryDestinations"]);
for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (!allowedFields.has(field)) assert(equal(before[field], after[field]), `Unrelated catalog field changed: ${field}`);
}
const allowedStats = new Set(["scriptedDestinations", "scriptedDestinationCharacters", "excludedCampEntryRelations"]);
for (const field of new Set([...Object.keys(before.stats), ...Object.keys(after.stats)])) {
  if (!allowedStats.has(field)) assert.equal(before.stats[field], after.stats[field], `Unrelated statistic changed: ${field}`);
}
let unchanged = 0, conditional = 0;
for (const [id, previous] of oldRows) {
  const review = reviews.get(id), next = nextRows.get(id);
  if (!review) {
    assert.deepEqual(next, previous, `Unrelated source relation changed: ${id}`);
    assert(!excluded.has(id)); unchanged++;
    continue;
  }
  assert.deepEqual(review.unresolved, []);
  if (review.classification !== "camp-listed-conditional-scene") {
    assert(["camp-not-listed-for-scene", "offstage-dialog-setup", "legacy-save-repair"].includes(review.classification));
    assert(!next, `Non-encounter entry retained: ${id}`);
    const archived = excluded.get(id);
    assert(archived && archived.reason === review.classification && archived.camp === review.camp);
    const { reason: _reason, camp: _camp, review: _review, ...original } = archived;
    assert.deepEqual(original, previous, `Excluded source evidence lost: ${id}`);
    assert.deepEqual(archived.review.movement, review.movement);
    assert.deepEqual(archived.review.allowedCamps, review.allowedCamps);
    assert.deepEqual(archived.review.contradictedActiveCamp, review.contradictedActiveCamp);
    continue;
  }
  assert(next && !excluded.has(id));
  const { camp, campEntryContext: context, ...original } = next;
  assert.deepEqual(original, previous, `Retained source evidence changed: ${id}`);
  assert.equal(camp, review.camp);
  assert(review.allowedCamps.includes(camp));
  assert.equal(context.kind, "conditional-scene-entry");
  assert.equal(context.requiresSceneContentReview, true);
  // Reconstruct literal night/camp pairs without the production parser.
  const registrations = review.registrations.filter(({ evidence }) => evidence.statement.match(/,\s*"([^"\\]+)"\s*\)$/)?.[1] === camp);
  const nightIds = [...new Set(registrations.map(({ evidence }) => evidence.statement.match(/_([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\s*,/i)?.[1]))].sort();
  assert(nightIds.length && nightIds.every((night) => night && review.nights.includes(night)));
  assert.deepEqual(context.nightIds, nightIds);
  assert.deepEqual(context.registrations, registrations);
  assert.deepEqual(context.nightEvidence, review.nightEvidence.filter(({ id }) => nightIds.includes(id)));
  assert.deepEqual(context.effects, review.effects);
  assert.deepEqual(context.movement, review.movement);
  conditional++;
}
assert.equal(nextRows.size + excluded.size, oldRows.size);
assert.equal(conditional + excluded.size, reviews.size);
assert([...nextRows.keys(), ...excluded.keys()].every((id) => oldRows.has(id)));
assert.deepEqual(after.scriptedDestinationsByCharacterId, { ...Object.groupBy(after.scriptedDestinations, ({ character }) => character.id) });
assert.equal(after.stats.scriptedDestinations, nextRows.size);
assert.equal(after.stats.scriptedDestinationCharacters, Object.keys(after.scriptedDestinationsByCharacterId).length);
assert.equal(after.stats.excludedCampEntryRelations, excluded.size);
for (const [file, expected] of Object.entries(after.campEntryReviews.hashes)) assert.equal(digest(bytes(file)), expected);
assert.equal(after.campEntryReviews.reviewedRelations, reviews.size);
assert.equal(after.campEntryReviews.retainedConditionalRelations, conditional);
assert.equal(after.campEntryReviews.excludedNormalLocationRelations, excluded.size);
const canonicalReferences = [];
let canonicalAppearances = 0;
for (const mapId of manifest.maps) {
  const file = `public/maps/${mapId}/content.json`, data = bytes(path.join(canonical, file));
  assert.equal(digest(data), manifest.outputHashes[file], `Changed canonical content: ${mapId}`);
  for (const entity of JSON.parse(data).entities) {
    canonicalAppearances++;
    const profile = entity.storyDestination;
    if (!profile) continue;
    for (const [anchor, kind, selected] of [
      ...profile.kinds.map((kind) => [profile.anchorContentId, kind, true]),
      ...(profile.alternateDestinations ?? []).map((entry) => [entry.anchorContentId, entry.kind, false]),
    ]) {
      const id = `${profile.characterContentId}:${kind}:${anchor}`;
      if (reviews.has(id)) canonicalReferences.push({ mapId, id: entity.id, relationId: id, selected, excluded: excluded.has(id) });
    }
  }
}
for (const file of [import.meta.filename, "scripts/lib/reviewed-camp-entry-relations.mjs", "scripts/build-story-location-relation-catalog.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const stats = { beforeRelations: oldRows.size, afterRelations: nextRows.size, unchangedRelations: unchanged,
  retainedConditionalRelations: conditional, archivedNonEncounterRelations: excluded.size,
  canonicalMaps: manifest.maps.length, canonicalAppearances, canonicalReferences: canonicalReferences.length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "camp-entry-projection-conservation-audit", beforePath, afterPath, sourcePath, canonical,
  stats, canonicalReferences, hashes, errors,
  scope: "Complete source-catalog conservation and canonical-reference impact. This audit does not approve retained scene roles, loot or positions, nor publish map data. Source interpretation is independently recorded by the native runtime survey." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors }, null, 2));
