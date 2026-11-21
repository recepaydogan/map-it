import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert([5, 6].includes(process.argv.length), "Usage: snapshot-reviewed-state.mjs <proof> <fresh-directory> <source-files-json> [prior-snapshot]");
const root = path.resolve(import.meta.dirname, ".."), [proofPath, output] = process.argv.slice(2, 4).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const proof = JSON.parse(fs.readFileSync(proofPath)); assert.deepEqual(proof.errors, []);
assert(Object.keys(proof.hashes ?? {}).length > 0);
const priorPath = process.argv[5] ? path.resolve(root, process.argv[5]) : undefined;
const prior = priorPath ? JSON.parse(fs.readFileSync(priorPath)) : undefined;
if (prior) {
  assert.equal(path.resolve(root, prior.proofPath), proofPath);
  assert.equal(prior.proofHash, digest(fs.readFileSync(proofPath)));
  for (const captured of Object.values(prior.snapshots)) assert.equal(digest(fs.readFileSync(path.resolve(root, captured.path))), captured.hash);
}
for (const [file, hash] of Object.entries(proof.hashes)) {
  const captured = prior?.snapshots[file]; if (captured) assert.equal(captured.hash, hash);
  assert.equal(digest(fs.readFileSync(path.resolve(root, captured?.path ?? file))), hash, `Stale baseline proof: ${file}`);
}
const snapshots = {};
for (const file of new Set([...Object.keys(prior?.snapshots ?? {}), ...JSON.parse(process.argv[4])])) {
  assert(!path.isAbsolute(file) && !file.split(/[\\/]/).includes(".."));
  // Previously edited sources retain their actual old capture; newly added
  // files must still match the verified pre-edit proof above.
  const bytes = fs.readFileSync(path.join(root, prior?.snapshots[file]?.path ?? file)), dest = path.join(output, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true }); writeGeneratedFile(dest, bytes);
  snapshots[file] = { path: relative(dest), hash: digest(bytes) };
}
const manifest = { kind: "reviewed-state-pre-edit-snapshot", proofPath: relative(proofPath), proofHash: digest(fs.readFileSync(proofPath)),
  stage: proof.stage, itemsPath: proof.itemsPath, indexPath: proof.indexPath, snapshots,
  ...(priorPath ? { priorSnapshotPath: relative(priorPath), priorSnapshotHash: digest(fs.readFileSync(priorPath)) } : {}) };
writeGeneratedFile(path.join(output, "snapshot.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ verifiedBaselineHashes: Object.keys(proof.hashes).length, snapshots: Object.keys(snapshots).length, output: relative(output) }));
