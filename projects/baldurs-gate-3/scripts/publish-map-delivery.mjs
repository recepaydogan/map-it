import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 4, "Usage: publish-map-delivery.mjs <delivery-manifest> <fresh-backup-directory>");
const root = path.resolve(import.meta.dirname, ".."), manifestPath = path.resolve(root, process.argv[2]);
const backup = path.resolve(root, process.argv[3]), audits = fs.realpathSync(path.join(root, "map-sources/audits"));
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const inside = (parent, child) => { const value = path.relative(parent, child); return Boolean(value) && !value.startsWith("..") && !path.isAbsolute(value); };
assert(inside(audits, backup) && !fs.existsSync(backup), "Backup must be a fresh directory inside map-sources/audits");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const hashFile = (file) => digest(fs.readFileSync(file));
const manifestBytes = fs.readFileSync(manifestPath), manifest = JSON.parse(manifestBytes);
assert.equal(manifest.kind, "coupled-map-delivery-candidate");
assert.equal(manifest.publicationReady, true); assert.deepEqual(manifest.errors, []); assert.deepEqual(manifest.remaining, []);
const allowedTarget = /^(?:public\/maps\/[a-z0-9][a-z0-9/-]*\.(?:json|webp)|public\/data\/item-database\.json|map-sources\/catalog\/[a-z0-9-]+-(?:placements|placement-rejections)\.json|src\/features\/map\/(?:map-registry|map-config)\.ts)$/;
const operations = [];
for (const [targetRelative, entry] of Object.entries(manifest.files)) {
  assert(allowedTarget.test(targetRelative) && !targetRelative.split("/").includes(".."), `Unsafe delivery target: ${targetRelative}`);
  const target = path.resolve(root, targetRelative), source = path.resolve(root, entry.source);
  assert(inside(root, target) && inside(root, source) && fs.statSync(source).isFile());
  assert.equal(hashFile(source), entry.sha256, `Changed delivery source: ${entry.source}`);
  const previous = fs.existsSync(target) ? hashFile(target) : null;
  operations.push({ targetRelative, target, source, expected: entry.sha256, previous,
    temporary: `${target}.codex-map-publish-${process.pid}` });
}
assert.equal(new Set(operations.map(({ targetRelative }) => targetRelative)).size, operations.length);
const changed = operations.filter(({ previous, expected }) => previous !== expected);
assert(changed.length > 0, "Delivery is already published");
for (const operation of changed) {
  assert(!fs.existsSync(operation.temporary), `Stale publication temporary file: ${operation.temporary}`);
  fs.mkdirSync(path.dirname(operation.temporary), { recursive: true });
  fs.copyFileSync(operation.source, operation.temporary);
  assert.equal(hashFile(operation.temporary), operation.expected);
}
fs.mkdirSync(backup);
const applied = [];
try {
  for (const operation of changed) {
    const saved = path.join(backup, "previous-files", operation.targetRelative);
    if (operation.previous !== null) {
      fs.mkdirSync(path.dirname(saved), { recursive: true });
      fs.renameSync(operation.target, saved);
    }
    fs.renameSync(operation.temporary, operation.target);
    applied.push({ ...operation, saved });
  }
  for (const operation of operations) assert.equal(hashFile(operation.target), operation.expected, `Published file mismatch: ${operation.targetRelative}`);
} catch (error) {
  for (const operation of [...applied].reverse()) {
    if (fs.existsSync(operation.target)) fs.unlinkSync(operation.target);
    if (operation.previous !== null && fs.existsSync(operation.saved)) fs.renameSync(operation.saved, operation.target);
  }
  for (const operation of changed) if (fs.existsSync(operation.temporary)) fs.unlinkSync(operation.temporary);
  throw error;
}
const report = {
  kind: "recoverable-coupled-map-publication", deliveryManifest: relative(manifestPath), deliveryManifestHash: digest(manifestBytes),
  stats: { files: operations.length, changedFiles: changed.length, unchangedFiles: operations.length - changed.length,
    backedUpFiles: changed.filter(({ previous }) => previous !== null).length, createdFiles: changed.filter(({ previous }) => previous === null).length },
  previous: Object.fromEntries(changed.map(({ targetRelative, previous }) => [targetRelative, previous])),
  published: Object.fromEntries(operations.map(({ targetRelative, expected }) => [targetRelative, expected])), errors: [],
};
writeGeneratedFile(path.join(backup, "publisher-source.mjs"), fs.readFileSync(import.meta.filename));
writeGeneratedFile(path.join(backup, "publication-manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, backup: relative(backup) }));
