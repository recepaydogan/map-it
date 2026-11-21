import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { refineNativeRasterAnchors } from "./lib/native-raster-anchor.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 4, "Usage: stage-native-raster-anchors.mjs <anchor-proof> <fresh-stage>");
const root = path.resolve(import.meta.dirname, ".."), [proofPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const digest = (data) => createHash("sha256").update(data).digest("hex"), hashes = {}, outputHashes = {}, pending = new Map();
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file)), proof = read(proofPath);
assert.equal(proof.kind, "independent-native-raster-anchor-audit");
assert.deepEqual(proof.errors, []);
for (const [file, expected] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), expected, `Stale anchor proof: ${file}`);
const base = path.resolve(root, proof.stage), manifest = read(path.join(base, "stage-manifest.json"));
const rasterReview = read(proof.rasterReview), rasterRoot = path.resolve(root, rasterReview.rasterRoot);
const overrideIds = new Set(rasterReview.results.map((map) => map.mapId));
assert(rasterReview.results.every((map) => map.levels.every((level) => level.changedAlpha === 0)));
const expectedChanges = new Map(proof.changes.map((change) => [`${change.mapId}/${change.id}`, change]));
assert.equal(expectedChanges.size, proof.changes.length);
const changes = [], identities = new Set(); let appearances = 0;
for (const mapId of manifest.maps) {
  const candidatePath = `map-sources/catalog/${mapId}-placements.json`, locationPath = `public/maps/${mapId}/locations.json`;
  const rejectionPath = `map-sources/catalog/${mapId}-placement-rejections.json`;
  const files = [candidatePath, locationPath, rejectionPath, `public/maps/${mapId}/metadata.json`, `public/maps/${mapId}/content.json`];
  for (const file of files) {
    const data = bytes(path.join(base, file)); assert.equal(digest(data), manifest.outputHashes[file]); pending.set(file, data);
  }
  const catalog = JSON.parse(pending.get(candidatePath)), locations = JSON.parse(pending.get(locationPath));
  const rejections = JSON.parse(pending.get(rejectionPath)), originalCandidates = catalog.candidates;
  const metadataPath = path.join(overrideIds.has(mapId) ? rasterRoot : path.join(root, "public/maps"), mapId, "metadata.json");
  catalog.candidates = await refineNativeRasterAnchors(originalCandidates, read(metadataPath), metadataPath);
  const locationsById = new Map(locations.locations.map((location) => [location.id, location]));
  let changed = false;
  for (const [index, candidate] of catalog.candidates.entries()) {
    appearances++; identities.add(candidate.id);
    const original = originalCandidates[index], expected = expectedChanges.get(`${mapId}/${candidate.id}`);
    if (!expected) { assert.deepEqual(candidate, original); continue; }
    assert(!equal(candidate, original));
    assert.deepEqual(candidate.mapPosition, expected.mapPosition);
    assert.deepEqual(candidate.mapPositionAdjustment, expected.adjustment);
    assert.deepEqual({ ...candidate, mapPosition: original.mapPosition, mapPositionAdjustment: original.mapPositionAdjustment },
      { ...original, mapPositionAdjustment: original.mapPositionAdjustment });
    const location = locationsById.get(candidate.id); assert(location);
    assert.deepEqual({ x: location.x, y: location.y }, expected.original);
    Object.assign(location, candidate.mapPosition);
    const rows = rejections.adjustedCandidates.filter((row) => row.id === candidate.id);
    assert(rows.length <= 1);
    if (rows.length) rows[0].adjustment = candidate.mapPositionAdjustment;
    else rejections.adjustedCandidates.push({ id: candidate.id, title: location.name, adjustment: candidate.mapPositionAdjustment });
    changes.push(expected); changed = true;
  }
  if (changed) for (const [file, document] of [[candidatePath, catalog], [locationPath, locations], [rejectionPath, rejections]]) {
    pending.set(file, Buffer.from(`${JSON.stringify(document, null, 2)}\n`));
  }
}
assert.equal(changes.length, expectedChanges.size);
assert.equal(appearances, proof.stats.checkedCandidates);
for (const file of [import.meta.filename, "scripts/lib/native-raster-anchor.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), expected);
for (const [file, data] of pending) {
  const dest = path.join(output, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); writeGeneratedFile(dest, data); outputHashes[file] = digest(data);
}
const result = { ...manifest, kind: "canonical-native-raster-anchor-stage", baselineStage: base, anchorProof: proofPath,
  rasterOverridesRoot: rasterRoot, rasterReview: path.resolve(root, proof.rasterReview),
  stats: { ...manifest.stats, maps: manifest.maps.length, appearances, identities: identities.size, nativeRasterRefinements: changes.length },
  changes, hashes, outputHashes, requiresCoupledRasterPublication: true, publishedDataUnchanged: true };
writeGeneratedFile(path.join(output, "stage-manifest.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(output), stats: result.stats, changedFiles: [...pending].filter(([file, data]) => digest(data) !== manifest.outputHashes[file]).length }));
