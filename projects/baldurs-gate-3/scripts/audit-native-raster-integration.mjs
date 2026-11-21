import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 8, "Usage: audit-native-raster-integration.mjs <stage> <items> <index> <pixels> <snapshot> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [stage, itemsPath, indexPath, pixelsPath, snapshotPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
assert(!fs.existsSync(output));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => { const data = fs.readFileSync(path.resolve(root, file)); hashes[relative(file)] = digest(data); return data; };
const read = (file) => JSON.parse(bytes(file));
const manifest = read(path.join(stage, "stage-manifest.json")), snapshot = read(snapshotPath);
assert.equal(manifest.kind, "canonical-native-raster-anchor-stage");
const base = manifest.baselineStage, beforeManifest = read(path.join(base, "stage-manifest.json"));
const proof = read(manifest.anchorProof); assert.deepEqual(proof.errors, []);
assert.equal(snapshot.proofHash, digest(bytes(manifest.anchorProof)));
assert.equal(path.resolve(root, snapshot.proofPath), path.resolve(root, manifest.anchorProof));
for (const [file, expected] of Object.entries(manifest.hashes)) {
  const capture = snapshot.snapshots[file]; if (capture) assert.equal(capture.hash, expected);
  assert.equal(digest(bytes(capture?.path ?? file)), expected, `Changed stage input: ${file}`);
}
assert.deepEqual(manifest.maps, beforeManifest.maps);
assert.deepEqual(Object.keys(manifest.outputHashes).sort(), Object.keys(beforeManifest.outputHashes).sort());
assert.deepEqual(manifest.changes, proof.changes);
const changes = new Map(manifest.changes.map((row) => [`${row.mapId}/${row.id}`, row]));
let unchangedFiles = 0, changedFiles = 0, entities = 0, candidates = 0;
for (const [file, hash] of Object.entries(manifest.outputHashes)) {
  const after = bytes(path.join(stage, file)), before = bytes(path.join(base, file));
  assert.equal(digest(after), hash); assert.equal(digest(before), beforeManifest.outputHashes[file]);
  if (after.equals(before)) { unchangedFiles++; continue; }
  changedFiles++;
  const old = JSON.parse(before), current = JSON.parse(after);
  const mapId = file.startsWith("public/maps/") ? file.split("/")[2]
    : file.slice("map-sources/catalog/".length).replace(/-(?:placements|placement-rejections)\.json$/, "");
  assert([...changes.values()].some((change) => change.mapId === mapId), `Unexpected changed map: ${file}`);
  if (file.endsWith("/locations.json")) {
    assert.deepEqual(current, { ...old, locations: old.locations.map((row) => {
      const change = changes.get(`${mapId}/${row.id}`); return change ? { ...row, ...change.mapPosition } : row;
    }) });
  } else if (file.endsWith("-placements.json")) {
    assert.deepEqual(current, { ...old, candidates: old.candidates.map((row) => {
      const change = changes.get(`${mapId}/${row.id}`);
      return change ? { ...row, mapPosition: change.mapPosition, mapPositionAdjustment: change.adjustment } : row;
    }) });
  } else if (file.endsWith("-placement-rejections.json")) {
    const expected = structuredClone(old);
    const locations = read(path.join(base, `public/maps/${mapId}/locations.json`)).locations;
    for (const change of changes.values()) if (change.mapId === mapId) {
      const row = expected.adjustedCandidates.find((entry) => entry.id === change.id);
      if (row) row.adjustment = change.adjustment;
      else expected.adjustedCandidates.push({ id: change.id, title: locations.find((entry) => entry.id === change.id).name, adjustment: change.adjustment });
    }
    assert.deepEqual(current, expected);
  } else assert.fail(`Unapproved changed output: ${file}`);
}
for (const mapId of manifest.maps) {
  entities += read(path.join(stage, `public/maps/${mapId}/content.json`)).entities.length;
  candidates += read(path.join(stage, `map-sources/catalog/${mapId}-placements.json`)).candidates.length;
}
assert.equal(changedFiles, changes.size * 3);
assert.equal(entities, candidates); assert.equal(candidates, proof.stats.checkedCandidates);
for (const field of ["requiresGameplayAvailabilityReview", "requiresSavedStateMigrationBeforePublication", "sceneContentPath"]) {
  assert.deepEqual(manifest[field], beforeManifest[field], `Lost existing gate/catalog: ${field}`);
}
assert.equal(manifest.requiresCoupledRasterPublication, true);
const pixels = read(pixelsPath); assert.equal(path.resolve(root, pixels.stage), stage);
assert.equal(pixels.pixelCheckPassed, true); assert.equal(pixels.publicationReady, false);
assert.deepEqual(pixels.findings, []); assert.deepEqual(pixels.remainingRasterErrors, []);
assert.equal(pixels.stats.locations, entities); assert.equal(pixels.stats.maps, manifest.maps.length);
for (const [file, hash] of Object.entries(pixels.hashes)) assert.equal(digest(bytes(file)), hash, `Changed pixel evidence: ${file}`);
const rasterReview = read(manifest.rasterReview);
assert.equal(path.resolve(root, rasterReview.rasterRoot), path.resolve(root, manifest.rasterOverridesRoot));
assert.equal(path.resolve(root, pixels.rasterReview), path.resolve(root, manifest.rasterReview));
for (const [file, hash] of Object.entries(rasterReview.hashes)) if (file.startsWith(`${relative(manifest.rasterOverridesRoot)}/`)) {
  assert.equal(digest(bytes(file)), hash, `Changed approved raster: ${file}`);
}
const previousCandidate = read("map-sources/audits/measured-atlas-candidate/candidate-manifest.json");
assert.equal(path.resolve(root, previousCandidate.mapStage), path.resolve(root, base));
const previousIndex = read(previousCandidate.indexPath), index = read(indexPath);
assert.deepEqual(index, { ...previousIndex, locations: previousIndex.locations.map((row) => {
  const change = changes.get(`${row.mapId}/${row.id}`); return change ? { ...row, ...change.mapPosition } : row;
}) });
const previousItems = read(previousCandidate.itemsPath), items = read(itemsPath);
const withoutTimestamp = ({ generatedAt: _generatedAt, ...document }) => document;
assert.deepEqual(withoutTimestamp(items), withoutTimestamp(previousItems), "Item identity, acquisitions or item metadata changed");
for (const file of [import.meta.filename, "scripts/stage-native-raster-anchors.mjs", "scripts/lib/native-raster-anchor.mjs",
  "scripts/build-map-search-index.mjs", "scripts/build-item-database.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), hash, `Input changed during integration audit: ${file}`);
const report = { kind: "independent-native-raster-integration-audit", stage: relative(stage), itemsPath: relative(itemsPath), indexPath: relative(indexPath),
  pixelsPath: relative(pixelsPath), snapshotPath: relative(snapshotPath), rasterOverridesRoot: relative(manifest.rasterOverridesRoot),
  stats: { maps: manifest.maps.length, entities, candidates, adjustedPins: changes.size, unchangedFiles, changedFiles,
    items: items.items.length, acquisitions: items.items.reduce((sum, item) => sum + item.acquisitions.length, 0),
    nativeConnections: index.connections.length, nativeTransparentPins: pixels.stats.nativeTransparent },
  errors: [], hashes, publicationReady: false,
  limitations: ["Complete canonical stage and consumer conservation plus native-pixel/raster evidence, not a complete game-content or scene-state audit.",
    "Normal regeneration of the remaining affected maps and dependencies is a separate review; registry, saved-state and coordinated publication gates remain open."] };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, hashes: Object.keys(hashes).length, output: relative(output) }));
