import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Inspect actual full index, composed map files and paired item outputs. Do
// not infer consumer correctness from a passing scene applicator comparison.
assert.equal(process.argv.length, 8,
  "Usage: audit-scene-name-consumers.mjs <record-report> <full-stage> <before-index> <after-index> <item-report> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [recordPath, fullRoot, beforeIndexPath, afterIndexPath, itemPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && !fs.existsSync(output));
const hashes = {};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(data)); hashes[key] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const verify = (proof) => {
  assert.deepEqual(proof.errors, []);
  assert(Object.keys(proof.hashes).length);
  for (const [file, expected] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), expected, `Stale proof: ${file}`);
};
const omit = (row, fields) => Object.fromEntries(Object.entries(row).filter(([key]) => !fields.includes(key)));
const identity = (row) => `${row.mapId}/${row.id}`;
const keyed = (rows, key = identity) => {
  const values = new Map(rows.map((row) => [key(row), row]));
  assert.equal(values.size, rows.length); return values;
};
const proof = read(recordPath), itemProof = read(itemPath); verify(proof); verify(itemProof);
assert.equal(itemProof.recordAudit, recordPath);
const before = read(beforeIndexPath), after = read(afterIndexPath);
assert.deepEqual(omit(before, ["locations", "relationships"]), omit(after, ["locations", "relationships"]));
const previous = keyed(before.locations), next = keyed(after.locations), changed = keyed(proof.matches);
assert.deepEqual([...previous.keys()].sort(), [...next.keys()].sort());
const manifest = read(path.join(fullRoot, "stage-manifest.json"));
const base = read(path.join(proof.beforeRoot, "stage-manifest.json")), overlay = read(path.join(proof.afterRoot, "stage-manifest.json"));
assert.deepEqual(manifest.maps, base.maps); assert.equal(manifest.sceneContentPath, base.sceneContentPath);
assert.deepEqual(manifest.composedFrom, [proof.beforeRoot, proof.afterRoot]);
const mapMarkers = new Map(); let copiedFiles = 0;
for (const mapId of manifest.maps) {
  const source = overlay.maps.includes(mapId) ? proof.afterRoot : proof.beforeRoot;
  for (const file of [`public/maps/${mapId}/content.json`, `public/maps/${mapId}/locations.json`,
    `map-sources/catalog/${mapId}-placements.json`, `map-sources/catalog/${mapId}-placement-rejections.json`]) {
    assert.equal(digest(bytes(path.join(fullRoot, file))), digest(bytes(path.join(source, file))), `Composition mismatch: ${file}`);
    copiedFiles++;
  }
  const markers = read(path.join(fullRoot, `public/maps/${mapId}/locations.json`)).locations;
  for (const row of markers) {
    const key = `${mapId}/${row.id}`; assert(!mapMarkers.has(key)); mapMarkers.set(key, row);
  }
}
assert.deepEqual([...mapMarkers.keys()].sort(), [...next.keys()].sort());
const affectedGroups = new Set();
for (const [key, old] of previous) {
  const current = next.get(key), raw = mapMarkers.get(key), match = changed.get(key);
  assert.equal(current.name, raw.name, `Index uses a stale pin name: ${key}`);
  if (!match) { assert.deepEqual(current, old, `Unrelated index row changed: ${key}`); continue; }
  assert.equal(old.name, match.beforeName); assert.equal(current.name, match.afterName);
  assert.deepEqual(omit(current, ["name", "searchTerms"]), omit(old, ["name", "searchTerms"]));
  assert.equal(new Set(current.searchTerms).size, current.searchTerms.length);
  assert.deepEqual([...new Set(current.searchTerms)].sort(), [...new Set([...old.searchTerms, old.name])].sort());
  assert(current.searchTerms.includes(old.name));
  affectedGroups.add(`${old.category}:${old.name}`); affectedGroups.add(`${current.category}:${current.name}`);
}
const groupKey = (row) => `${row.category}:${row.name}`;
const unaffected = (rows) => rows.filter((row) => !affectedGroups.has(groupKey(row)));
assert.deepEqual(unaffected(before.relationships), unaffected(after.relationships));
const groupChanges = [];
for (const index of [before, after]) {
  for (const key of affectedGroups) {
    const members = index.locations.filter((row) => groupKey(row) === key && !["transition", "vertical-access"].includes(row.category));
    const groups = index.relationships.filter((row) => groupKey(row) === key);
    const eligible = members.length >= 2 && members.length <= 12 && new Set(members.map((row) => row.mapId)).size >= 2;
    assert.equal(groups.length, eligible ? 1 : 0);
    if (!eligible) continue;
    const group = groups[0];
    assert.equal(group.kind, "exact-name-match"); assert.equal(group.confidence, "uncertain");
    assert.equal(group.id, `name-${createHash("sha1").update(key).digest("hex").slice(0, 12)}`);
    assert.deepEqual(group.appearances, members.map((row) => ({ mapId: row.mapId, locationId: row.id })));
    groupChanges.push({ side: index === before ? "before" : "after", name: group.name, appearances: members.length });
  }
}
const oldItems = read(itemProof.beforeItems), newItems = read(itemProof.afterItems);
assert.deepEqual(omit(oldItems, ["generatedAt"]), omit(newItems, ["generatedAt"]), "Marker naming changed actual item data");
assert.equal(itemProof.stats.unchangedAcquisitions, newItems.stats.acquisitionRecords);
for (const file of [import.meta.filename, "scripts/build-map-search-index.mjs", "scripts/compose-placement-stage.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const stats = { maps: manifest.maps.length, copiedFiles, indexedAppearances: next.size, correctedIndexNames: changed.size,
  unchangedIndexRows: next.size - changed.size, unchangedVerifiedConnections: after.connections.length,
  oldUncertainNameGroups: before.relationships.length, newUncertainNameGroups: after.relationships.length,
  preservedItems: newItems.items.length, unchangedRegionalAcquisitions: newItems.stats.acquisitionRecords };
writeGeneratedFile(output, `${JSON.stringify({ kind: "scene-name-full-consumer-audit", recordPath, fullRoot, beforeIndexPath, afterIndexPath,
  itemPath, stats, groupChanges, hashes, errors: [], scope: "Full raw composition and actual index comparison; all verified connections unchanged, only named-scene pin labels/search aliases and resulting uncertain name groups differ. Complete paired regional item documents identical except generation time. Raw native index is not the canonical index with curated connection additions; routing, remaining scene content, coverage and publication remain open." }, null, 2)}\n`);
console.log(JSON.stringify({ output, stats, hashes: Object.keys(hashes).length }, null, 2));
