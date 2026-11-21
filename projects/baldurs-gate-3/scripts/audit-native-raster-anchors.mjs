import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { refineNativeRasterAnchors } from "./lib/native-raster-anchor.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 6, "Usage: audit-native-raster-anchors.mjs <pixel-review> <snapshot> <normal-generated-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [reviewPath, snapshotPath, generatedStage, output] = process.argv.slice(2).map((value) => path.resolve(root, value));
assert(!fs.existsSync(output));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const hashes = {};
const read = (file) => { const bytes = fs.readFileSync(file); hashes[relative(file)] = hash(bytes); return bytes; };
const json = (file) => JSON.parse(read(file));
const review = json(reviewPath), snapshot = json(snapshotPath);
for (const [file, expected] of Object.entries(review.hashes)) {
  const capture = snapshot.snapshots[file];
  if (capture) assert.equal(capture.hash, expected);
  assert.equal(hash(read(path.resolve(root, capture?.path ?? file))), expected, `Pixel review input changed: ${file}`);
}
const stage = path.resolve(root, review.stage), manifest = json(path.join(stage, "stage-manifest.json"));
const rasters = json(path.resolve(root, review.rasterReview));
const overrideIds = new Set(rasters.results.map((map) => map.mapId));
const findings = new Map(review.findings.map((row) => [`${row.mapId}/${row.id}`, row]));
const round = (value) => Math.round(value * 1000) / 1000;
const changes = [];
let checkedCandidates = 0, checkedNormalCandidates = 0;
for (const mapId of manifest.maps) {
  const rasterRoot = path.join(overrideIds.has(mapId) ? path.resolve(root, rasters.rasterRoot) : path.join(root, "public/maps"), mapId);
  const metadataPath = path.join(rasterRoot, "metadata.json"), metadata = json(metadataPath);
  const file = `map-sources/catalog/${mapId}-placements.json`, bytes = read(path.join(stage, file));
  assert.equal(hash(bytes), manifest.outputHashes[file]);
  const candidates = JSON.parse(bytes).candidates;
  const locationFile = `public/maps/${mapId}/locations.json`, locationBytes = read(path.join(stage, locationFile));
  assert.equal(hash(locationBytes), manifest.outputHashes[locationFile]);
  const locations = new Map(JSON.parse(locationBytes).locations.map((row) => [row.id, row]));
  assert.equal(locations.size, candidates.length);
  for (const row of candidates) assert.deepEqual(row.mapPosition, { x: locations.get(row.id).x, y: locations.get(row.id).y });
  const serialized = JSON.stringify(candidates);
  const result = await refineNativeRasterAnchors(candidates, metadata, metadataPath);
  assert.equal(JSON.stringify(candidates), serialized, "Anchor refinement mutated its input");
  assert.equal(result.length, candidates.length);
  const generatedFile = path.join(generatedStage, file);
  const generated = fs.existsSync(generatedFile) ? new Map(json(generatedFile).candidates.map((row) => [row.id, row])) : null;
  if (generated) assert.equal(generated.size, candidates.length);
  for (const [index, after] of result.entries()) {
    const before = candidates[index], finding = findings.get(`${mapId}/${before.id}`);
    if (!finding) assert.deepEqual(after, before, `Unexplained change: ${mapId}/${before.id}`);
    else {
      assert(finding.nearestWithinEightPixels && finding.nearestWithinEightPixels.distance < 2);
      assert.deepEqual(after.mapPosition, Object.fromEntries(Object.entries(finding.nearestWithinEightPixels.mapPosition).map(([key, value]) => [key, round(value)])));
      assert.deepEqual({ ...after, mapPosition: before.mapPosition, mapPositionAdjustment: before.mapPositionAdjustment },
        { ...before, mapPositionAdjustment: before.mapPositionAdjustment });
      assert.equal(after.mapPositionAdjustment.kind, "native-raster-edge");
      assert.deepEqual(after.mapPositionAdjustment.original, before.mapPosition);
      assert.equal(after.mapPositionAdjustment.previousAdjustment, before.mapPositionAdjustment);
      assert(Math.abs(after.mapPositionAdjustment.distance - finding.nearestWithinEightPixels.distance) < 1e-8);
      changes.push({ mapId, id: before.id, original: before.mapPosition, mapPosition: after.mapPosition,
        adjustment: after.mapPositionAdjustment });
    }
    if (generated) { assert.deepEqual(generated.get(after.id), after, `Normal generator mismatch: ${mapId}/${after.id}`); checkedNormalCandidates++; }
    checkedCandidates++;
  }
}
assert.equal(changes.length, review.findings.length);
assert.equal(checkedCandidates, review.stats.locations);
assert(checkedNormalCandidates > 0, "Require an actual normal-generation comparison");
const generatedManifest = json(path.join(generatedStage, "stage-manifest.json"));
assert.equal(path.resolve(root, generatedManifest.rasterOverridesRoot), path.resolve(root, rasters.rasterRoot));
for (const mapId of generatedManifest.maps) {
  const before = json(path.join(stage, `public/maps/${mapId}/content.json`));
  const after = json(path.join(generatedStage, `public/maps/${mapId}/content.json`));
  assert.deepEqual(after.entities, before.entities, `Normal generator changed canonical content: ${mapId}`);
  const oldLocations = json(path.join(stage, `public/maps/${mapId}/locations.json`));
  const newLocations = json(path.join(generatedStage, `public/maps/${mapId}/locations.json`));
  assert.deepEqual(newLocations.locations, oldLocations.locations.map((row) => {
    const change = changes.find((entry) => entry.mapId === mapId && entry.id === row.id);
    return change ? { ...row, ...change.mapPosition } : row;
  }));
}
const producerPath = "scripts/build-placement-catalog.mjs";
const beforeSource = read(path.resolve(root, snapshot.snapshots[producerPath].path)).toString().replaceAll("\r\n", "\n");
const afterSource = read(path.join(root, producerPath)).toString().replaceAll("\r\n", "\n")
  .replace('import { refineNativeRasterAnchors } from "./lib/native-raster-anchor.mjs";\n', "")
  .replace("let candidates = silhouetteResults", "const candidates = silhouetteResults")
  .replace('  if (mapMetadata) {\n    candidates = await refineNativeRasterAnchors(candidates, mapMetadata, path.resolve(arguments_.get("map-metadata")));\n  }\n\n', "");
assert.equal(afterSource, beforeSource, "Unexpected unrelated placement producer changes");
for (const file of [import.meta.filename, "scripts/lib/native-raster-anchor.mjs", "scripts/build-registered-placement-maps.mjs"])
  read(path.resolve(root, file));
for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, `Input changed during audit: ${file}`);
const report = { kind: "independent-native-raster-anchor-audit", stage: relative(stage), rasterReview: review.rasterReview,
  pixelReview: relative(reviewPath), snapshotPath: relative(snapshotPath), generatedStage: relative(generatedStage),
  stats: { maps: manifest.maps.length, checkedCandidates, adjustedCandidates: changes.length,
    unchangedCandidates: checkedCandidates - changes.length, checkedNormalCandidates,
    maximumNativePixelDistance: Math.max(...changes.map((row) => row.adjustment.distance)) },
  changes, errors: [], hashes,
  limitations: ["Uses every real canonical candidate and original level-zero tile. The independent pixel review supplies expected nearest positions.",
    "Normal source generation is compared only for maps present in the supplied generated stage, not claimed for all maps.",
    "Canonical maps, search/index/items, registry and published rasters remain unchanged; coupled staging/publication and remaining full-goal reviews are still required."] };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, hashes: Object.keys(hashes).length, output: relative(output) }));
