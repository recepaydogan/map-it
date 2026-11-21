import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// A source-only refresh must first account for the complete normal generation,
// then retain the canonical routed records rather than route a partial delta.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 9) throw new Error("Usage: stage-comment-aware-placement-refresh.mjs <canonical> <old-raw> <new-raw> <source-audit> <items> <output-stage> <report>");
const [canonical, oldRaw, newRaw, auditPath, itemsPath, output, reportPath] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const resolvedOutput = path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
const within = path.relative(boundary, resolvedOutput);
assert(within && !within.startsWith("..") && !path.isAbsolute(within) && !fs.existsSync(output), "Output must be a fresh audit directory");
const hashes = {}, outputHashes = {}, pending = [], changes = [], ids = new Set();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute), key = relative(absolute);
  assert(!hashes[key] || hashes[key] === hash(value), `Changed input: ${key}`);
  hashes[key] = hash(value); return value;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const serialized = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const proofKey = ({ sourcePath, sourceLine, statement }) => `${sourcePath}:${sourceLine}:${statement}`;
const uniqueProofs = (entries) => [...new Map(entries.map((entry) => [proofKey(entry), entry])).values()];
const sourceAudit = read(auditPath);
assert.equal(sourceAudit.kind, "comment-aware-native-catalog-audit"); assert.deepEqual(sourceAudit.errors, []);
for (const [file, expected] of Object.entries(sourceAudit.hashes)) assert.equal(hash(bytes(file)), expected, `Stale source audit: ${file}`);
const beforeManifest = read(path.join(oldRaw, "stage-manifest.json")), manifest = read(path.join(newRaw, "stage-manifest.json"));
const canonicalManifest = read(path.join(canonical, "stage-manifest.json"));
for (const value of [beforeManifest, manifest]) assert.equal(value.kind, "unfinalized-placement-stage");
assert.deepEqual(omit(manifest, ["storyLocationsPath", "sceneContentPath"]), omit(beforeManifest, ["storyLocationsPath", "sceneContentPath"]));
assert.deepEqual([...manifest.maps].sort(), [...canonicalManifest.maps].sort());
assert.deepEqual([...manifest.maps].sort(), read(manifest.configPath).maps.map(({ id }) => id).sort());
assert.deepEqual(read(beforeManifest.sceneContentPath).profiles, read(manifest.sceneContentPath).profiles);
const relations = read(manifest.storyLocationsPath), previousRelations = read(beforeManifest.storyLocationsPath);
for (const change of sourceAudit.changes) {
  assert.deepEqual(change.before, previousRelations.scriptedDestinations.find(({ id }) => id === (change.before ?? change.after).id));
  assert.deepEqual(change.after, relations.scriptedDestinations.find(({ id }) => id === (change.after ?? change.before).id));
}
const cleanups = sourceAudit.changes.filter(({ kind }) => kind === "removed-inactive-support");
const validateCleanup = (previous, next, label) => {
  assert(previous?.storyDestination && next?.storyDestination, `Not a source-only change: ${label}`);
  const profile = previous.storyDestination;
  const cleanup = cleanups.find(({ before }) => before.character.id === profile.characterContentId && before.anchor.id === profile.anchorContentId);
  assert(cleanup, `Unreviewed changed destination: ${label}`);
  assert.deepEqual(omit(next, ["storyDestination", "provenance"]), omit(previous, ["storyDestination", "provenance"]), `Changed content: ${label}`);
  assert.deepEqual(omit(next.storyDestination, ["evidence"]), omit(profile, ["evidence"]), `Changed destination: ${label}`);
  assert.deepEqual(profile.evidence, uniqueProofs(cleanup.before.evidence));
  assert.deepEqual(next.storyDestination.evidence, uniqueProofs(cleanup.after.evidence));
  const retained = new Set(cleanup.after.evidence.map(proofKey));
  const removed = new Set(cleanup.before.evidence.map(proofKey).filter((key) => !retained.has(key)));
  assert(removed.size && retained.size);
  assert.deepEqual(next.provenance, previous.provenance.filter((entry) => !removed.has(proofKey(entry))), `Changed native provenance: ${label}`);
  return { removedProofs: removed.size, relationId: cleanup.after.id };
};
let rawAppearances = 0, canonicalAppearances = 0, changedMaps = 0;
for (const mapId of manifest.maps) {
  const folder = `public/maps/${mapId}`;
  const oldContent = read(path.join(oldRaw, folder, "content.json")), newContent = read(path.join(newRaw, folder, "content.json"));
  const oldMarkers = read(path.join(oldRaw, folder, "locations.json")), newMarkers = read(path.join(newRaw, folder, "locations.json"));
  assert.deepEqual(newMarkers, oldMarkers, `Marker regression: ${mapId}`);
  assert.deepEqual(omit(newContent, ["entities"]), omit(oldContent, ["entities"]));
  assert.deepEqual(newContent.entities.map(({ id }) => id), oldContent.entities.map(({ id }) => id), `Identity/order regression: ${mapId}`);
  const changed = new Map();
  for (const [index, next] of newContent.entities.entries()) {
    const previous = oldContent.entities[index]; rawAppearances++;
    if (isDeepStrictEqual(previous, next)) continue;
    const proof = validateCleanup(previous, next, `${mapId}/${next.id}`);
    changed.set(next.id, { previous, next }); changes.push({ mapId, contentId: next.id, ...proof });
  }
  const catalogName = `map-sources/catalog/${mapId}-placements.json`;
  const oldCatalog = read(path.join(oldRaw, catalogName)), newCatalog = read(path.join(newRaw, catalogName));
  assert.deepEqual(omit(newCatalog, ["generatedAt", "candidates"]), omit(oldCatalog, ["generatedAt", "candidates"]));
  assert.deepEqual(newCatalog.candidates.map(({ id }) => id), oldCatalog.candidates.map(({ id }) => id));
  const changedCandidates = new Map();
  for (const [index, next] of newCatalog.candidates.entries()) {
    const previous = oldCatalog.candidates[index];
    if (isDeepStrictEqual(previous, next)) continue;
    validateCleanup(previous, next, `candidate/${mapId}/${next.id}`);
    assert(changed.has(next.id)); changedCandidates.set(next.id, { previous, next });
  }
  assert.deepEqual([...changedCandidates.keys()], [...changed.keys()]);
  const rejected = `map-sources/catalog/${mapId}-placement-rejections.json`;
  assert.deepEqual(read(path.join(newRaw, rejected)), read(path.join(oldRaw, rejected)));
  const contentBytes = bytes(path.join(canonical, folder, "content.json")), content = JSON.parse(contentBytes);
  const catalogBytes = bytes(path.join(canonical, catalogName)), catalog = JSON.parse(catalogBytes);
  const applied = new Set();
  for (const entity of content.entities) {
    ids.add(entity.id); canonicalAppearances++;
    const change = changed.get(entity.id); if (!change) continue;
    assert.deepEqual(entity, change.previous, "Canonical scene diverged from the reviewed raw source");
    const candidate = catalog.candidates.find(({ id }) => id === entity.id);
    const candidateChange = changedCandidates.get(entity.id);
    assert(candidate); validateCleanup(candidate, { ...candidate, provenance: candidateChange.next.provenance, storyDestination: candidateChange.next.storyDestination }, "canonical candidate");
    assert.deepEqual(candidate.provenance, candidateChange.previous.provenance);
    assert.deepEqual(candidate.storyDestination, candidateChange.previous.storyDestination);
    candidate.provenance = candidateChange.next.provenance; candidate.storyDestination = candidateChange.next.storyDestination;
    entity.provenance = change.next.provenance; entity.storyDestination = change.next.storyDestination;
    applied.add(entity.id);
  }
  assert.deepEqual([...applied].sort(), [...changed.keys()].sort(), "Source correction disappeared during canonical routing");
  if (applied.size) changedMaps++;
  pending.push([`${folder}/content.json`, applied.size ? serialized(content) : contentBytes], [catalogName, applied.size ? serialized(catalog) : catalogBytes]);
  for (const name of ["locations.json", "metadata.json"]) pending.push([`${folder}/${name}`, bytes(path.join(canonical, folder, name))]);
  pending.push([rejected, bytes(path.join(canonical, rejected))]);
}
const items = read(itemsPath);
bytes(import.meta.filename);
for (const file of ["scripts/build-placement-catalog.mjs", "scripts/build-registered-placement-maps.mjs", "scripts/lib/story-goal-facts.mjs", "scripts/lib/story-rule-context.mjs", "scripts/lib/story-source-lines.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(fs.readFileSync(path.resolve(root, file))), expected);
const report = { kind: "comment-aware-map-source-refresh", errors: [], baselineRoot: canonical, oldRawRoot: oldRaw, newRawRoot: newRaw, outputRoot: output,
  sourceAuditPath: auditPath, itemsPath, stats: { maps: manifest.maps.length, rawAppearances, canonicalAppearances, identities: ids.size,
    changedMaps, sourceOnlyChanges: changes.length, unchangedMarkers: canonicalAppearances, retainedItems: items.items.length }, changes, hashes,
  scope: "All raw entity/candidate/marker/rejection records compared. Only independently reviewed inactive-support removal admitted; canonical routed records, coordinates, marker bytes, metadata and item data retained. No publication, runtime test or claim of complete native coverage." };
for (const [file, value] of pending) {
  const absolute = path.join(output, file); fs.mkdirSync(path.dirname(absolute), { recursive: true });
  writeGeneratedFile(absolute, value); outputHashes[file] = hash(value);
}
for (const [file, expected] of Object.entries(outputHashes)) assert.equal(hash(fs.readFileSync(path.join(output, file))), expected);
writeGeneratedFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
writeGeneratedFile(path.join(output, "stage-manifest.json"), `${JSON.stringify({ ...manifest, kind: "comment-aware-map-source-refresh-stage", baselineRoot: canonical,
  sourceStageRoot: newRaw, sourceAuditPath: auditPath, conservationAuditPath: reportPath, stats: report.stats, outputHashes,
  requiresRoutingAndConservationReview: false, publishedDataUnchanged: true }, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
