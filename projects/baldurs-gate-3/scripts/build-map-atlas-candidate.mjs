import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 5, "Usage: build-map-atlas-candidate.mjs <snapshot> <layout> <fresh-output-directory>");
const root = path.resolve(import.meta.dirname, "..");
const [snapshotPath, layoutPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashes = {};
const read = (file) => {
  const resolved = path.resolve(root, file), bytes = fs.readFileSync(resolved);
  hashes[relative(resolved)] = digest(bytes);
  return bytes;
};
const json = (file) => JSON.parse(read(file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const snapshot = json(snapshotPath), proof = json(snapshot.proofPath);
assert.equal(digest(read(snapshot.proofPath)), snapshot.proofHash);
assert.deepEqual(proof.errors, []);
for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(read(file)), hash, `Stale proof: ${file}`);
for (const [file, capture] of Object.entries(snapshot.snapshots)) {
  assert.equal(digest(read(capture.path)), capture.hash);
  assert.equal(digest(read(file)), capture.hash, `Source changed since capture: ${file}`);
}
const source = read("src/features/map/map-registry.ts").toString("utf8");
const evaluate = (text) => {
  const context = { exports: {}, require: (id) => {
    assert.equal(id, "./map-data-url"); return { MAP_DATA_BASE_URL: "/maps" };
  } };
  vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return JSON.parse(JSON.stringify(context.exports));
};
const original = evaluate(source), layout = json(layoutPath);
const configuration = json("map-sources/config/placement-maps.json");
const stage = json(`${proof.stage}/stage-manifest.json`);
const index = json(proof.indexPath);
assert.equal(stage.kind, "canonical-scene-item-transfer-stage");
assert.deepEqual([...stage.maps].sort(), configuration.maps.map(({ id }) => id).sort());
assert.deepEqual(index.maps.map(({ id }) => id).sort(), [...stage.maps].sort());
const originalIds = new Set(original.MAP_DEFINITIONS.map(({ id }) => id));
const additions = layout.additions.map(({ mapId }) => mapId);
assert.deepEqual([...additions].sort(), stage.maps.filter((id) => !originalIds.has(id)).sort());
const parent = original.MAP_DEFINITIONS.find(({ id }) => id === layout.parentMapId);
assert(parent?.groupKey);
const atlas = original.MAP_ATLASES.find(({ id }) => id === layout.atlasId);
assert(atlas?.placements.some(({ mapId }) => mapId === parent.id));
let candidate = source;
const definitions = [];
const placements = [];
for (const entry of layout.additions) {
  const config = configuration.maps.find(({ id }) => id === entry.mapId);
  assert.equal(config.floorVolumeSelection?.mapId, parent.id);
  const metadata = json(`${proof.stage}/public/maps/${entry.mapId}/metadata.json`);
  assert.deepEqual(json(`public/maps/${entry.mapId}/metadata.json`), metadata);
  const bounds = metadata.bounds;
  const physicalWidth = metadata.tileImageSize?.width ?? bounds.maxX - bounds.minX;
  const physicalHeight = metadata.tileImageSize?.height ?? bounds.maxY - bounds.minY;
  const height = entry.width * physicalHeight / physicalWidth;
  assert(Number.isFinite(height) && height > 0 && entry.width > 0);
  const placement = { ...entry, height: Number(height.toFixed(6)) };
  placements.push(placement);
  definitions.push(`  {\n    id: ${JSON.stringify(entry.mapId)},\n    name: ${JSON.stringify(metadata.displayName)},\n    groupKey: ${JSON.stringify(parent.groupKey)},\n    dataUrl: \`\${MAP_DATA_BASE_URL}/${entry.mapId}\`,\n  },`);
}
const definitionEnd = candidate.indexOf("\n];", candidate.indexOf("export const MAP_DEFINITIONS"));
assert(definitionEnd > 0);
candidate = `${candidate.slice(0, definitionEnd)}\n${definitions.join("\n")}\n${candidate.slice(definitionEnd)}`;
for (const move of layout.moves) {
  const old = atlas.placements.find(({ mapId }) => mapId === move.mapId);
  assert(old && originalIds.has(move.mapId));
  const line = candidate.split(/\r?\n/).filter((row) => row.includes(`{ mapId: "${move.mapId}",`));
  assert.equal(line.length, 1);
  candidate = candidate.replace(line[0], `      { mapId: ${JSON.stringify(move.mapId)}, x: ${move.x}, y: ${move.y}, width: ${old.width}, height: ${old.height} },`);
}
const lastId = atlas.placements.at(-1).mapId;
const lastLine = candidate.split(/\r?\n/).filter((row) => row.includes(`{ mapId: "${lastId}",`));
assert.equal(lastLine.length, 1);
candidate = candidate.replace(lastLine[0], `${lastLine[0]}\n${placements.map((p) => `      { mapId: ${JSON.stringify(p.mapId)}, x: ${p.x}, y: ${p.y}, width: ${p.width}, height: ${p.height} },`).join("\n")}`);
const evaluated = evaluate(candidate); // Executes the registry's real bounds/duplicate/overlap guards.
assert.deepEqual(evaluated.MAP_DEFINITIONS.map(({ id }) => id).sort(), [...stage.maps].sort());
const registryPath = path.join(output, "src/features/map/map-registry.ts");
fs.mkdirSync(path.dirname(registryPath), { recursive: true });
writeGeneratedFile(registryPath, candidate);
const manifest = {
  kind: "connected-map-atlas-candidate",
  baselineSnapshot: relative(snapshotPath), sourceProof: snapshot.proofPath, layoutPath: relative(layoutPath),
  mapStage: proof.stage, itemsPath: proof.itemsPath, indexPath: proof.indexPath,
  registryPath: relative(registryPath), registryHash: digest(Buffer.from(candidate)),
  mapCount: stage.maps.length, addedMaps: additions, movedAtlasMaps: layout.moves.map(({ mapId }) => mapId),
  requiresGameplayAvailabilityReview: stage.requiresGameplayAvailabilityReview,
  requiresSavedStateMigrationBeforePublication: stage.requiresSavedStateMigrationBeforePublication,
  publishedDataUnchanged: true, hashes,
};
read(import.meta.filename);
read("scripts/lib/write-generated-file.mjs");
writeGeneratedFile(path.join(output, "candidate-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(output), maps: manifest.mapCount, added: additions.length, moved: layout.moves.length, hashes: Object.keys(hashes).length }));
