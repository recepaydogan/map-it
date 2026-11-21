import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Snapshot identical map coverage/metadata for actual before/after item builds.
// Fresh audit-only output; never mutate input stages or published maps.
assert.equal(process.argv.length, 6, "Usage: stage-scene-item-inputs.mjs <before-stage> <after-stage> <record-audit> <fresh-output-root>");
const root = path.resolve(import.meta.dirname, "..");
const [beforeRoot, afterRoot, auditPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && !fs.existsSync(output));
const hashes = {}, outputs = {};
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(data)); hashes[key] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const proof = read(auditPath); assert.deepEqual(proof.errors, []);
assert.equal(proof.beforeRoot, beforeRoot); assert.equal(proof.afterRoot, afterRoot);
for (const [file, expected] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), expected, `Stale source/record proof: ${file}`);
const before = read(path.join(beforeRoot, "stage-manifest.json")), after = read(path.join(afterRoot, "stage-manifest.json"));
assert(after.maps.every((id) => before.maps.includes(id)));
const canonical = read(path.join(after.previousStageRoot, "stage-manifest.json"));
const documents = [];
for (const mapId of after.maps) {
  const metadataPath = `public/maps/${mapId}/metadata.json`, metadata = bytes(metadataPath);
  // Established metadata must match the accepted canonical snapshot. New
  // floor metadata has no canonical predecessor; record exact source bytes.
  if (canonical.maps.includes(mapId)) assert.equal(digest(metadata), canonical.outputHashes[metadataPath], `Canonical metadata changed: ${mapId}`);
  for (const [side, stage] of [["before", beforeRoot], ["after", afterRoot]]) {
    for (const name of ["content", "locations", "metadata"]) {
      const data = name === "metadata" ? metadata : bytes(path.join(stage, `public/maps/${mapId}/${name}.json`));
      const file = path.join(output, side, mapId, `${name}.json`); documents.push({ file, data });
    }
  }
}
bytes(import.meta.filename);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
fs.mkdirSync(output);
for (const { file, data } of documents) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); writeGeneratedFile(file, data.toString("utf8"));
  assert.equal(digest(fs.readFileSync(file)), digest(data)); outputs[path.relative(output, file).replaceAll("\\", "/")] = digest(data);
}
writeGeneratedFile(path.join(output, "input-manifest.json"), `${JSON.stringify({ kind: "paired-scene-item-inputs", beforeRoot, afterRoot, auditPath,
  maps: after.maps, beforeSceneCatalog: before.sceneContentPath, afterSceneCatalog: after.sceneContentPath, hashes, outputHashes: outputs,
  scope: "Actual paired raw-region item inputs with identical metadata and byte-exact stage content. Not a canonical map merge or a new geometry validation." }, null, 2)}\n`);
console.log(JSON.stringify({ output, maps: after.maps.length, files: documents.length }, null, 2));
