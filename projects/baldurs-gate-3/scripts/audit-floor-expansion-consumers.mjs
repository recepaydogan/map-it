import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 8, "Usage: audit-floor-expansion-consumers.mjs <stage> <old-index> <new-index> <old-items> <new-items> <report>");
const [stage, oldIndexPath, newIndexPath, oldItemsPath, newItemsPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const read = (file) => {
  const data = fs.readFileSync(file); hashes[path.relative(root, file).replaceAll("\\", "/")] = digest(data); return JSON.parse(data);
};
const omit = (row, fields) => Object.fromEntries(Object.entries(row).filter(([field]) => !fields.includes(field)));
const key = (rows, selector = ({ id }) => id) => {
  const result = new Map(rows.map((row) => [selector(row), row])); assert.equal(result.size, rows.length); return result;
};
const canonical = (rows) => rows.map((row) => JSON.stringify(row)).sort();
const manifest = read(path.join(stage, "stage-manifest.json"));
const proof = read(path.join(stage, "independent-floor-expansion-audit.json"));
assert.equal(proof.kind, "independent-native-floor-expansion-audit"); assert.deepEqual(proof.errors, []);
for (const [file, expected] of Object.entries(proof.hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Stale independent proof: ${file}`);
const expansion = read(manifest.conservationAuditPath);
const moves = key(expansion.relocations, ({ fromMap, id }) => `${fromMap}/${id}`);
const before = read(oldIndexPath), after = read(newIndexPath);
const oldLocations = key(before.locations, ({ mapId, id }) => `${mapId}/${id}`);
const locations = key(after.locations, ({ mapId, id }) => `${mapId}/${id}`);
const metadata = new Map(), markers = new Map();
for (const mapId of manifest.maps) {
  metadata.set(mapId, read(path.join(stage, "public/maps", mapId, "metadata.json")));
  const payload = read(path.join(stage, "public/maps", mapId, "locations.json"));
  for (const marker of payload.locations) markers.set(`${mapId}/${marker.id}`, marker);
}
const mappedAppearance = (entry) => ({ ...entry, mapId: moves.get(`${entry.mapId}/${entry.locationId}`)?.toMap ?? entry.mapId });
for (const old of before.locations) {
  const move = moves.get(`${old.mapId}/${old.id}`), mapId = move?.toMap ?? old.mapId;
  const next = locations.get(`${mapId}/${old.id}`); assert(next);
  if (!move) assert.deepEqual(next, old);
  else {
    const marker = markers.get(`${mapId}/${old.id}`);
    assert.deepEqual(omit(next, ["mapId", "mapName", "x", "y", "region"]), omit(old, ["mapId", "mapName", "x", "y", "region"]));
    assert.equal(next.mapName, metadata.get(mapId).displayName);
    for (const field of ["x", "y", "region"]) assert.equal(next[field], marker[field]);
  }
}
const newLocations = after.locations.filter((row) => !oldLocations.has(`${row.mapId}/${row.id}`)
  && !expansion.relocations.some(({ toMap, id }) => toMap === row.mapId && id === row.id));
assert.deepEqual(canonical(newLocations.map(({ mapId, id }) => ({ mapId, id }))),
  canonical(expansion.newArrivals.map(({ mapId, id }) => ({ mapId, id }))));
assert.equal(after.locations.length, before.locations.length + newLocations.length);
const connections = key(after.connections), oldConnections = key(before.connections);
assert.deepEqual([...connections.keys()].sort(), [...oldConnections.keys()].sort());
let movedConnections = 0;
for (const old of before.connections) {
  const expected = { ...old, endpoints: old.endpoints.map(mappedAppearance) }, actual = connections.get(old.id);
  if (!isDeepStrictEqual(expected.endpoints, old.endpoints)) movedConnections += 1;
  if (actual.endpoints[0].locationId !== expected.endpoints[0].locationId) {
    assert.equal(old.evidence, "reciprocal-navigation-portal", "One-way endpoint order changed");
    expected.endpoints.reverse(); expected.sourcePortalIds = [...expected.sourcePortalIds].reverse();
    expected.sourcePortalInstanceIds = [...expected.sourcePortalInstanceIds].reverse();
    [expected.sourceToTargetDistance, expected.targetToSourceDistance] = [expected.targetToSourceDistance, expected.sourceToTargetDistance];
  }
  assert.deepEqual(actual, expected, `Unrelated connection changed: ${old.id}`);
}
const relations = key(after.relationships), oldRelations = key(before.relationships);
for (const old of before.relationships) {
  const current = relations.get(old.id); assert(current);
  assert.deepEqual(omit(current, ["appearances"]), omit(old, ["appearances"]));
  assert.deepEqual(canonical(current.appearances), canonical(old.appearances.map(mappedAppearance)));
}
const addedRelations = after.relationships.filter(({ id }) => !oldRelations.has(id));
for (const relation of addedRelations) {
  assert.equal(relation.kind, "exact-name-match"); assert.equal(relation.confidence, "uncertain");
  const matching = after.locations.filter((row) => row.name === relation.name && row.category === relation.category);
  assert.deepEqual(canonical(relation.appearances), canonical(matching.map(({ mapId, id }) => ({ mapId, locationId: id }))));
  assert(new Set(relation.appearances.map(({ mapId }) => mapId)).size > 1);
  const formerly = before.locations.filter((row) => row.name === relation.name && row.category === relation.category);
  assert.equal(new Set(formerly.map(({ mapId }) => mapId)).size, 1, "Unexpected newly introduced name grouping");
}
const oldItems = read(oldItemsPath), newItems = read(newItemsPath), items = key(newItems.items);
assert.deepEqual(omit(newItems, ["generatedAt", "items"]), omit(oldItems, ["generatedAt", "items"]));
assert.deepEqual([...items.keys()].sort(), oldItems.items.map(({ id }) => id).sort());
let remappedAcquisitions = 0, acquisitions = 0, changedItemSources = 0;
for (const old of oldItems.items) {
  const current = items.get(old.id); assert.deepEqual(omit(current, ["acquisitions"]), omit(old, ["acquisitions"]));
  const expected = (old.acquisitions ?? []).map((acquisition) => {
    const move = moves.get(`${acquisition.mapId}/${acquisition.locationId}`);
    const result = omit(acquisition, ["id"]);
    if (move) {
      const marker = markers.get(`${move.toMap}/${acquisition.locationId}`);
      result.mapId = move.toMap; result.mapName = metadata.get(move.toMap).displayName; result.region = marker.region;
      remappedAcquisitions += 1;
    }
    return result;
  });
  // Acquisition IDs are generated ordinally; compare complete content as a
  // multiset so a map-order change cannot look like a changed drop method.
  assert.deepEqual(canonical((current.acquisitions ?? []).map((row) => omit(row, ["id"]))), canonical(expected), `Acquisition facts changed: ${old.id}`);
  if (!isDeepStrictEqual(current.acquisitions, old.acquisitions)) changedItemSources += 1;
  acquisitions += expected.length;
}
hashes["scripts/audit-floor-expansion-consumers.mjs"] = digest(fs.readFileSync(import.meta.filename));
hashes["scripts/build-map-search-index.mjs"] = digest(fs.readFileSync(path.join(root, "scripts/build-map-search-index.mjs")));
const result = { kind: "native-floor-consumer-conservation", stage, errors: [], hashes,
  stats: { maps: after.maps.length, locations: after.locations.length, preservedConnections: connections.size, movedConnections,
    preservedNameGroups: oldRelations.size, addedUncertainNameGroups: addedRelations.length,
    items: items.size, acquisitions, remappedAcquisitions, changedItemSources },
  scope: "Full old index/connection and item/acquisition conservation, allowing only independently verified floor remapping, one source-backed arrival, reciprocal orientation and newly cross-map uncertain name groups. Does not establish scene/vendor correctness, native-room completeness or publication readiness." };
writeGeneratedFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ stats: result.stats, errors: [] }, null, 2));
