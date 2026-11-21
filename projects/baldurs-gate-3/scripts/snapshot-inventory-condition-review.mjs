import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Preserve the actual pre-edit producer/consumer, not a possibly older Git HEAD.
assert.equal(process.argv.length, 4, "Usage: snapshot-inventory-condition-review.mjs <proof> <fresh-directory>");
const root = path.resolve(import.meta.dirname, ".."), [proofPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const proof = JSON.parse(fs.readFileSync(proofPath)); assert.deepEqual(proof.errors, []);
for (const [file, hash] of Object.entries(proof.hashes)) {
  assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash, `Stale baseline proof: ${file}`);
}
const files = ["scripts/build-placement-catalog.mjs", "scripts/build-item-database.mjs", "scripts/lib/native-item-placements.mjs",
  "src/features/map/map-loot-utils.ts", "src/features/map/types.ts", "src/features/items/types.ts",
  "src/features/map/map-loot-display-rows.ts", "src/features/map/map-loot-list.tsx"];
const snapshots = {};
for (const file of files) {
  const bytes = fs.readFileSync(path.join(root, file)), dest = path.join(output, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true }); writeGeneratedFile(dest, bytes);
  snapshots[file] = { path: relative(dest), hash: digest(bytes) };
}
const manifest = { kind: "inventory-condition-pre-edit-snapshot", proofPath: relative(proofPath), proofHash: digest(fs.readFileSync(proofPath)),
  stage: proof.stage, itemsPath: proof.itemsPath, indexPath: proof.indexPath, snapshots };
writeGeneratedFile(path.join(output, "snapshot.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ verifiedBaselineHashes: Object.keys(proof.hashes).length, snapshots: files.length, output: relative(output) }));
