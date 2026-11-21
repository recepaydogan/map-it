import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 7,
  "Usage: audit-scene-appearance-consumers.mjs <full-record-audit> <before-index> <after-index> <item-audit> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [recordPath, beforeIndexPath, afterIndexPath, itemPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relativeOutput = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput) && !fs.existsSync(output));
const hashes = {};
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(data)); hashes[key] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const verify = (proof) => {
  assert.deepEqual(proof.errors, []); assert(Object.keys(proof.hashes ?? {}).length);
  for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), hash, `Stale consumer evidence: ${file}`);
};
const omit = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const identity = (row) => `${row.mapId}/${row.id}`;
const keyed = (rows) => { const index = new Map(rows.map((row) => [identity(row), row])); assert.equal(index.size, rows.length); return index; };
const proof = read(recordPath), itemProof = read(itemPath); verify(proof); verify(itemProof);
assert.equal(proof.kind, "scene-appearance-native-record-audit");
const regionalProof = read(itemProof.recordAudit); assert.equal(regionalProof.beforeRoot, proof.beforeRoot);
assert.deepEqual(regionalProof.matches, proof.matches);
const base = read(path.join(proof.beforeRoot, "stage-manifest.json")), afterManifest = read(path.join(proof.afterRoot, "stage-manifest.json"));
assert.deepEqual(base.maps, afterManifest.maps);
const before = read(beforeIndexPath), after = read(afterIndexPath), previous = keyed(before.locations), next = keyed(after.locations);
assert.deepEqual(omit(before, ["locations", "relationships"]), omit(after, ["locations", "relationships"]));
assert.deepEqual([...previous.keys()].sort(), [...next.keys()].sort());
assert.equal(next.size, proof.stats.appearances);
const changed = keyed(proof.matches), groups = new Set();
for (const [side, manifest, index] of [[proof.beforeRoot, base, previous], [proof.afterRoot, afterManifest, next]]) {
  const seen = new Set();
  for (const mapId of manifest.maps) {
    const markers = read(path.join(side, `public/maps/${mapId}/locations.json`)).locations;
    for (const raw of markers) {
      const key = `${mapId}/${raw.id}`, row = index.get(key); assert(row && !seen.has(key)); seen.add(key);
      for (const field of ["name", "x", "y", "category", "contentId", "region", "regionId", "label", "subtype"]) assert.deepEqual(row[field], raw[field]);
      const compact = (values) => [...new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean).map((value) => value.slice(0, 240)))];
      const extra = ["rarity", "slot", "armorType", "weaponType", "proficiency"].map((field) => row.gameplay?.[field]);
      if (row.gameplay?.unique) extra.push("unique");
      assert.deepEqual(row.searchTerms, compact([...raw.searchTerms, ...extra]));
    }
  }
  assert.equal(seen.size, index.size);
}
for (const [key, old] of previous) {
  const current = next.get(key), change = changed.get(key);
  if (!change) { assert.deepEqual(current, old, `Unrelated indexed appearance changed: ${key}`); continue; }
  assert.equal(old.name, change.beforeTitle); assert.equal(current.name, change.afterTitle);
  assert.deepEqual(omit(old, ["name", "searchTerms"]), omit(current, ["name", "searchTerms"]));
  assert(old.searchTerms.every((term) => current.searchTerms.includes(term)) && current.searchTerms.includes(old.name));
  groups.add(`${old.category}:${old.name}`); groups.add(`${current.category}:${current.name}`);
}
const groupKey = (row) => `${row.category}:${row.name}`;
assert.deepEqual(before.relationships.filter((row) => !groups.has(groupKey(row))), after.relationships.filter((row) => !groups.has(groupKey(row))));
for (const index of [before, after]) for (const key of groups) {
  const members = index.locations.filter((row) => groupKey(row) === key), matching = index.relationships.filter((row) => groupKey(row) === key);
  const eligible = members.length >= 2 && members.length <= 12 && new Set(members.map((row) => row.mapId)).size >= 2;
  assert.equal(matching.length, eligible ? 1 : 0);
  if (eligible) {
    assert.equal(matching[0].confidence, "uncertain"); assert.equal(matching[0].kind, "exact-name-match");
    assert.deepEqual(matching[0].appearances, members.map((row) => ({ mapId: row.mapId, locationId: row.id })));
  }
}
for (const file of [import.meta.filename, "scripts/build-map-search-index.mjs", "src/features/map/map-location-details.tsx",
  "src/features/map/map-point-icon.tsx"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const stats = { maps: base.maps.length, indexedAppearances: next.size, changedIndexNames: changed.size,
  unchangedIndexRows: next.size - changed.size, unchangedNativeConnections: after.connections.length,
  preservedItems: itemProof.stats.preservedItems, unchangedRegionalAcquisitions: itemProof.stats.unchangedAcquisitions,
  renamedRegionalAcquisitions: itemProof.stats.renamedAcquisitions, addedConditionalEquipmentPossessions: itemProof.stats.addedConditionalEquipmentPossessions };
writeGeneratedFile(output, `${JSON.stringify({ kind: "scene-appearance-consumer-audit", recordPath, beforeIndexPath, afterIndexPath, itemPath,
  stats, hashes, errors: [], scope: "Actual full raw index matched to every source marker and exact prior rows/connections; paired item proof includes all payloads and narrowly conditional equipment copies. Stored native icon identity is corrected; UI character markers currently use category glyphs, not native character portraits. No live UI test or canonical/curated-navigation publication claim." }, null, 2)}\n`);
console.log(JSON.stringify({ output, stats, hashes: Object.keys(hashes).length }, null, 2));
