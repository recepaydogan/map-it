import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 8) throw new Error("Usage: stage-stat-expression-refresh.mjs <canonical> <old-raw> <new-raw> <native-audit> <output-stage> <report>");
const [canonical, oldRaw, newRaw, auditPath, output, reportPath] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const resolvedOutput = path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
const within = path.relative(boundary, resolvedOutput);
assert(within && !within.startsWith("..") && !path.isAbsolute(within) && !fs.existsSync(output), "Output must be a fresh audit directory");
const hashes = {}, outputHashes = {}, pending = [], changes = [], identities = new Set();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const bytes = (file) => {
  const value = fs.readFileSync(file), key = relative(file);
  assert(!hashes[key] || hashes[key] === digest(value), `Changed input: ${key}`);
  hashes[key] = digest(value); return value;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const serialize = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sourceAudit = read(auditPath);
assert.equal(sourceAudit.kind, "native-stat-expression-content-audit"); assert.deepEqual(sourceAudit.errors, []);
for (const [file, expected] of Object.entries(sourceAudit.hashes)) assert.equal(digest(bytes(path.resolve(root, file))), expected, `Stale native proof: ${file}`);
const oldStats = read(sourceAudit.oldStatsPath), newStats = read(sourceAudit.statsPath);
const revisions = new Map(sourceAudit.changes.map((change) => [change.id, change]));
assert.equal(revisions.size, sourceAudit.changes.length);
for (const [id, revision] of revisions) {
  assert.deepEqual(oldStats.entries[id].boosts, revision.before);
  assert.deepEqual(newStats.entries[id].boosts, revision.after);
  assert.deepEqual(omit(oldStats.entries[id], ["boosts"]), omit(newStats.entries[id], ["boosts"]));
}
const previousManifest = read(path.join(oldRaw, "stage-manifest.json"));
const rawManifest = read(path.join(newRaw, "stage-manifest.json"));
const manifest = read(path.join(canonical, "stage-manifest.json"));
assert.equal(previousManifest.kind, "unfinalized-placement-stage"); assert.equal(rawManifest.kind, previousManifest.kind);
assert.deepEqual(omit(rawManifest, ["gameplayStatsPath"]), omit(previousManifest, ["gameplayStatsPath"]));
assert.equal(path.resolve(manifest.sourceStageRoot), oldRaw);
assert.equal(path.resolve(rawManifest.gameplayStatsPath), path.resolve(sourceAudit.statsPath));
assert.deepEqual(rawManifest.maps, manifest.maps);
const config = read(rawManifest.configPath);
assert.deepEqual([...manifest.maps].sort(), config.maps.map(({ id }) => id).sort());
const originalStats = read(previousManifest.gameplayStatsPath ?? path.resolve(root, config.gameplayStats));
assert.deepEqual(originalStats.entries, oldStats.entries); assert.deepEqual(originalStats.byRootTemplate, oldStats.byRootTemplate);
assert.equal(originalStats.sourceBuild, oldStats.sourceBuild);
for (const [file, expected] of Object.entries(manifest.outputHashes)) assert.equal(digest(bytes(path.join(canonical, file))), expected, `Changed canonical file: ${file}`);

// Only exact native-proven stat lists may change. Coordinate arrays, metadata,
// identities, categories, narrative content and every unrelated field compare whole.
const compare = (before, after, label) => {
  if (isDeepStrictEqual(before, after)) return 0;
  if (Array.isArray(before)) {
    assert(Array.isArray(after)); assert.equal(after.length, before.length, label);
    return before.reduce((count, entry, index) => count + compare(entry, after[index], `${label}[${index}]`), 0);
  }
  assert(before && after && typeof before === "object" && typeof after === "object", `Unexpected difference: ${label}`);
  assert.deepEqual(Object.keys(after), Object.keys(before), label);
  let changed = 0;
  for (const key of Object.keys(before)) {
    if (key === "boosts" && !isDeepStrictEqual(before[key], after[key])) {
      assert(label.endsWith(".gameplay"), `Not a gameplay stat field: ${label}`);
      const proof = revisions.get(before.id); assert(proof, `Unproven stat delta: ${label}`);
      assert.deepEqual(before[key], proof.before); assert.deepEqual(after[key], proof.after); changed++;
    } else changed += compare(before[key], after[key], `${label}.${key}`);
  }
  return changed;
};
const refresh = (value, label) => {
  if (Array.isArray(value)) return value.map((entry, index) => refresh(entry, `${label}[${index}]`));
  if (!value || typeof value !== "object") return value;
  const next = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, refresh(entry, `${label}.${key}`)]));
  const proof = label.endsWith(".gameplay") ? revisions.get(value.id) : null;
  if (proof) { assert.deepEqual(value.boosts, proof.before, label); next.boosts = proof.after; }
  return next;
};
const queue = (file, previousBytes, next, count) => pending.push([file, count ? serialize(next) : previousBytes]);
let appearances = 0, rawAppearances = 0, rawStatFields = 0, canonicalStatFields = 0, changedMaps = 0;
for (const mapId of manifest.maps) {
  const folder = `public/maps/${mapId}`, contentName = `${folder}/content.json`, locationsName = `${folder}/locations.json`;
  const candidateName = `map-sources/catalog/${mapId}-placements.json`, rejectedName = `map-sources/catalog/${mapId}-placement-rejections.json`;
  const previousRaw = read(path.join(oldRaw, contentName)), nextRaw = read(path.join(newRaw, contentName));
  rawAppearances += previousRaw.entities.length;
  rawStatFields += compare(previousRaw, nextRaw, `${mapId}.raw`);
  assert.deepEqual(read(path.join(newRaw, locationsName)), read(path.join(oldRaw, locationsName)), "Changed raw markers");
  const previousCandidates = read(path.join(oldRaw, candidateName)), nextCandidates = read(path.join(newRaw, candidateName));
  compare(omit(previousCandidates, ["generatedAt"]), omit(nextCandidates, ["generatedAt"]), `${mapId}.candidates`);
  assert.deepEqual(read(path.join(newRaw, rejectedName)), read(path.join(oldRaw, rejectedName)), "Changed rejected source records");
  const contentBytes = bytes(path.join(canonical, contentName)), content = JSON.parse(contentBytes), nextContent = refresh(content, mapId);
  const count = compare(content, nextContent, mapId);
  canonicalStatFields += count; if (count) changedMaps++;
  const freshById = new Map(nextRaw.entities.map((entry) => [entry.id, entry]));
  for (const entry of nextContent.entities) {
    appearances++; identities.add(entry.id);
    if (revisions.has(entry.gameplay?.id)) {
      const generated = freshById.get(entry.id); assert(generated, `Missing regenerated pin: ${mapId}/${entry.id}`);
      assert.deepEqual(entry.gameplay, generated.gameplay, "Canonical gameplay differs from full generation");
      changes.push({ mapId, contentId: entry.id, statsId: entry.gameplay.id });
    }
  }
  queue(contentName, contentBytes, nextContent, count);
  const candidateBytes = bytes(path.join(canonical, candidateName)), candidates = JSON.parse(candidateBytes), nextCatalog = refresh(candidates, mapId);
  queue(candidateName, candidateBytes, nextCatalog, compare(candidates, nextCatalog, mapId));
  for (const file of [locationsName, `${folder}/metadata.json`, rejectedName]) pending.push([file, bytes(path.join(canonical, file))]);
}
const stagedFiles = new Set(pending.map(([file]) => file));
const preservedSnapshots = Object.keys(manifest.outputHashes).filter((file) => !stagedFiles.has(file));
assert.deepEqual(preservedSnapshots.toSorted(), manifest.maps.flatMap((mapId) => ["content.json", "locations.json", "metadata.json"]
  .map((name) => `baseline/maps/${mapId}/${name}`)).sort(), "Unexpected additional canonical artifacts");
for (const file of preservedSnapshots) pending.push([file, bytes(path.join(canonical, file))]);
assert.deepEqual(pending.map(([file]) => file).sort(), Object.keys(manifest.outputHashes).sort(), "Incomplete canonical output set");
for (const file of [import.meta.filename, "scripts/build-placement-catalog.mjs", "scripts/build-registered-placement-maps.mjs"]) bytes(path.resolve(root, file));
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const report = { kind: "native-stat-expression-map-refresh", errors: [], baselineRoot: canonical, oldRawRoot: oldRaw, newRawRoot: newRaw, outputRoot: output, sourceAuditPath: auditPath,
  stats: { maps: manifest.maps.length, rawAppearances, appearances, identities: identities.size, rawStatFields, canonicalStatFields, changedMaps, unchangedMarkers: appearances, preservedBaselineFiles: preservedSnapshots.length }, changes, hashes,
  openFindings: { malformedSourceFields: sourceAudit.malformedSourceFields, sourceResolutionDifferences: sourceAudit.sourceResolutionDifferences, unresolvedScenes: manifest.unresolvedScenes ?? [] },
  scope: "Complete raw content/candidate/marker/rejection comparison admits only exact native-audited boost boundaries. Canonical positions, markers, identities, metadata, narratives and other properties remain unchanged. No live publication, raster change, tests or claim of complete source coverage." };
for (const [file, value] of pending) {
  const absolute = path.join(output, file); fs.mkdirSync(path.dirname(absolute), { recursive: true });
  writeGeneratedFile(absolute, value); outputHashes[file] = digest(value);
}
for (const [file, expected] of Object.entries(outputHashes)) assert.equal(digest(fs.readFileSync(path.join(output, file))), expected);
writeGeneratedFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
writeGeneratedFile(path.join(output, "stage-manifest.json"), `${JSON.stringify({ ...manifest, kind: "stat-expression-map-refresh-stage", baselineRoot: canonical, sourceStageRoot: newRaw,
  sourceAuditPath: auditPath, gameplayStatsPath: rawManifest.gameplayStatsPath, conservationAuditPath: reportPath, stats: report.stats, hashes, outputHashes,
  openStatFindings: report.openFindings, publishedDataUnchanged: true, requiresRoutingAndConservationReview: false }, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
