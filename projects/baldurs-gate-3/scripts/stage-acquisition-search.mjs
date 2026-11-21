import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { syncAcquisitionSearch } from "./lib/sync-acquisition-search.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Reconcile item-derived search in a fresh snapshot, never behind the hashes
// of an accepted map stage or in the published map directory.
assert.equal(process.argv.length, 7, "Usage: stage-acquisition-search.mjs <map-stage> <map-audit> <previous-items> <current-items> <fresh-output>");
const root = path.resolve(import.meta.dirname, "..");
const [stage, auditPath, previousItemsPath, itemsPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relativeOutput = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput) && !fs.existsSync(output));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const data = fs.readFileSync(file); hashes[path.relative(root, file).replaceAll("\\", "/")] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const baseline = read(path.join(stage, "stage-manifest.json")), audit = read(auditPath);
assert.equal(audit.after, stage); assert.deepEqual(audit.errors, []);
assert.equal(audit.stats.maps, baseline.maps.length);
const previous = read(previousItemsPath), current = read(itemsPath), pending = new Map();
for (const [file, expected] of Object.entries(baseline.outputHashes)) {
  assert(!path.isAbsolute(file) && !file.split(/[\\/]/).includes(".."));
  const data = bytes(path.join(stage, file)); assert.equal(digest(data), expected, `Changed map stage: ${file}`); pending.set(file, data);
}
for (const [file, expected] of Object.entries(audit.hashes)) {
  const absolute = path.resolve(root, file), relative = path.relative(stage, absolute);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) assert.equal(digest(bytes(absolute)), expected, `Stale map audit: ${file}`);
}
fs.mkdirSync(output);
for (const [file, data] of pending) {
  const target = path.join(output, file); fs.mkdirSync(path.dirname(target), { recursive: true }); writeGeneratedFile(target, data);
}
const stats = syncAcquisitionSearch(previous.items, current.items, path.join(output, "public/maps"));
const outputHashes = {}, changedFiles = [];
for (const file of pending.keys()) {
  outputHashes[file] = digest(fs.readFileSync(path.join(output, file)));
  if (outputHashes[file] !== baseline.outputHashes[file]) {
    assert(baseline.maps.some((id) => file === `public/maps/${id}/locations.json`), `Unexpected search write: ${file}`);
    changedFiles.push(file);
  }
}
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Input changed during synchronization: ${file}`);
const report = { kind: "staged-acquisition-search-refresh", stage, auditPath, previousItemsPath, itemsPath, hashes, stats, changedFiles };
const write = (file, value) => {
  const data = `${JSON.stringify(value, null, 2)}\n`; writeGeneratedFile(path.join(output, file), data); outputHashes[file] = digest(data);
};
write("acquisition-search-refresh-report.json", report);
write("stage-manifest.json", { ...baseline, kind: "canonical-acquisition-search-stage", previousSearchStage: stage,
  searchAuditPath: auditPath, previousItemsPath, itemsPath, outputHashes: { ...outputHashes },
  publishedDataUnchanged: true, requiresRoutingAndConservationReview: true });
console.log(JSON.stringify({ output, stats, changedFiles }, null, 2));
