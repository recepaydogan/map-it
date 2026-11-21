import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getOutgoingConnectionKeys } from "../src/features/map/map-connection-directions.ts";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length < 4) throw new Error("Usage: node --experimental-strip-types audit-map-connection-directions.mjs <report> <index> [index...]");
const [output, ...inputs] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, summaries = [];
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const file of inputs) {
  hashes[path.relative(root, file).replaceAll("\\", "/")] = hash(file);
  const index = JSON.parse(fs.readFileSync(file)), expected = new Map(), previous = new Map();
  const put = (map, from, to) => { const values = map.get(from) ?? new Set(); values.add(to); map.set(from, values); };
  for (const connection of index.connections) {
    const [source, target] = connection.endpoints.map((entry) => `${entry.mapId}:${entry.locationId}`);
    if (source === target) continue;
    put(previous, source, target); put(previous, target, source);
    put(expected, source, target);
    if (connection.evidence !== "navigation-portal-target") put(expected, target, source);
  }
  let removed = 0;
  for (const [key, oldTargets] of previous) {
    const result = getOutgoingConnectionKeys(index.connections, key);
    assert.deepEqual([...result].sort(), [...(expected.get(key) ?? [])].sort(), `Wrong directed targets: ${key}`);
    for (const target of result) assert(oldTargets.has(target), `Invented destination: ${key}/${target}`);
    removed += oldTargets.size - result.size;
  }
  summaries.push({ file, connections: index.connections.length, endpointKeys: previous.size, removedFalseReturnTargets: removed });
}
for (const file of ["src/features/map/map-connection-directions.ts", "src/features/map/map-workspace.tsx", "scripts/audit-map-connection-directions.mjs"]) hashes[file] = hash(path.join(root, file));
for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(path.resolve(root, file)), expected);
writeGeneratedFile(output, `${JSON.stringify({ kind: "native-connection-direction-audit", errors: [], summaries, hashes,
  scope: "Runs the UI's pure destination selector on actual generated connection records. Preserves forward routes and reciprocal routes, removes only unproven return routes from native arrival anchors. No browser/app testing or claim about unreviewed curated scripted route direction." }, null, 2)}\n`);
console.log(JSON.stringify(summaries, null, 2));
