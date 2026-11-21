import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Compare the completed artifacts without invoking the composer or routing code.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 8) throw new Error("Usage: audit-native-navigation-integration.mjs <stage> <before-index> <after-index> <before-items> <after-items> <report>");
const [stage, beforeIndexPath, afterIndexPath, beforeItemsPath, afterItemsPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, hash = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === hash(data), `Changed input: ${key}`); hashes[key] = hash(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const index = (entries, getKey = (entry) => entry.id) => {
  const result = new Map(entries.map((entry) => [getKey(entry), entry]));
  assert.equal(result.size, entries.length, "Duplicate artifact key"); return result;
};
const manifest = read(path.join(stage, "stage-manifest.json")), baseline = path.resolve(manifest.baselineRoot);
assert.equal(manifest.kind, "native-navigation-refresh-stage");
const previousManifest = read(path.join(baseline, "stage-manifest.json")), proof = read(manifest.sourceAuditPath);
assert.equal(proof.kind, "native-action-navigation-source-and-conservation"); assert.deepEqual(proof.errors, []);
assert.deepEqual(manifest.maps, previousManifest.maps);
assert.deepEqual(Object.keys(manifest.outputHashes).sort(), Object.keys(previousManifest.outputHashes).sort());
for (const [directory, value] of [[stage, manifest], [baseline, previousManifest]]) {
  for (const [file, expected] of Object.entries(value.outputHashes)) assert.equal(hash(bytes(path.join(directory, file))), expected);
}
const changes = index(proof.changes, ({ mapId, id }) => `${mapId}/${id}`);
const additions = index(proof.additions, ({ mapId, id }) => `${mapId}/${id}`);
const oldIds = new Set(), currentIds = new Set(), actualAdditions = [], actualChanges = [];
let oldAppearances = 0, appearances = 0, immutableArtifacts = 0;
for (const file of Object.keys(manifest.outputHashes)) {
  if (file.startsWith("baseline/") || file.endsWith("/metadata.json") || file.endsWith("-placement-rejections.json")) {
    assert.equal(manifest.outputHashes[file], previousManifest.outputHashes[file], `Changed immutable artifact: ${file}`); immutableArtifacts += 1;
  }
}
const byMap = new Map();
for (const mapId of manifest.maps) {
  const load = (directory, name) => read(path.join(directory, "public/maps", mapId, name));
  const before = load(baseline, "content.json"), after = load(stage, "content.json");
  assert.deepEqual(omit(after, ["entities"]), omit(before, ["entities"]));
  const old = index(before.entities), current = index(after.entities);
  for (const entity of before.entities) {
    oldIds.add(entity.id); oldAppearances += 1;
    const next = current.get(entity.id), key = `${mapId}/${entity.id}`; assert(next, `Lost canonical entity: ${key}`);
    if (changes.has(key)) {
      assert(!entity.navigationPortal); assert.deepEqual(omit(next, ["navigationPortal"]), entity);
      assert.deepEqual(next.navigationPortal.actionBinding.actions, changes.get(key).actions); actualChanges.push(key);
    } else assert.deepEqual(next, entity, `Unrelated canonical content changed: ${key}`);
  }
  for (const entity of after.entities) {
    currentIds.add(entity.id); appearances += 1;
    if (old.has(entity.id)) continue;
    const key = `${mapId}/${entity.id}`, evidence = additions.get(key); assert(evidence, `Unproven new entity: ${key}`);
    assert.deepEqual(entity.worldPosition, evidence.position); assert.deepEqual(entity.navigationDestination, evidence.destination);
    actualAdditions.push(key);
  }
  const oldMarkers = load(baseline, "locations.json"), newMarkers = load(stage, "locations.json");
  assert.deepEqual(omit(newMarkers, ["locations"]), omit(oldMarkers, ["locations"]));
  const markers = index(newMarkers.locations), previousMarkers = index(oldMarkers.locations);
  for (const marker of oldMarkers.locations) {
    const next = markers.get(marker.id), key = `${mapId}/${marker.contentId}`; assert(next);
    if (changes.has(key)) {
      assert.deepEqual(omit(next, ["searchTerms"]), omit(marker, ["searchTerms"]));
      const portal = current.get(marker.contentId).navigationPortal;
      assert.deepEqual(next.searchTerms, [...marker.searchTerms, ...[portal.sourceRegionId, portal.targetRegionId].filter(Boolean)]);
    } else assert.deepEqual(next, marker, `Old pin changed: ${key}`);
  }
  const metadata = load(stage, "metadata.json");
  for (const marker of newMarkers.locations) {
    assert(current.has(marker.contentId));
    if (previousMarkers.has(marker.id)) continue;
    assert(additions.has(`${mapId}/${marker.contentId}`));
    const position = current.get(marker.contentId).worldPosition, reference = metadata.coordinateReference;
    const world = reference.worldBounds, image = reference.imageBounds;
    const u = (position.x - world.x) / world.width, v = (position.z - world.y) / world.height;
    const projected = { x: image.x + u * image.width, y: image.y + (reference.flipY ? 1 - v : v) * image.height };
    assert(Math.abs(marker.x - projected.x) <= 0.001 && Math.abs(marker.y - projected.y) <= 0.001, `Arrival projection differs: ${mapId}/${marker.id}`);
  }
  assert.equal(markers.size, current.size, `Marker/content count mismatch: ${mapId}`);
  const candidateFile = `map-sources/catalog/${mapId}-placements.json`;
  const oldCatalog = read(path.join(baseline, candidateFile)), catalog = read(path.join(stage, candidateFile));
  const rawCatalog = read(path.join(manifest.sourceStageRoot, candidateFile));
  const oldCandidates = index(oldCatalog.candidates), candidates = index(catalog.candidates), rawCandidates = index(rawCatalog.candidates);
  assert.deepEqual(omit(catalog, ["generatedAt", "stats", "candidates"]), omit(oldCatalog, ["generatedAt", "stats", "candidates"]));
  assert.deepEqual(omit(catalog.stats, ["candidates", "uniqueObjects", "localizedObjects"]),
    omit(oldCatalog.stats, ["candidates", "uniqueObjects", "localizedObjects"]));
  for (const field of ["uniqueObjects", "localizedObjects"]) assert.equal(catalog.stats[field], rawCatalog.stats[field]);
  assert.equal(catalog.stats.candidates, candidates.size); assert.equal(candidates.size, current.size);
  for (const [id, previous] of oldCandidates) {
    const candidate = candidates.get(id); assert(candidate, `Lost candidate: ${mapId}/${id}`);
    assert.deepEqual(omit(candidate, ["teleportActions", "navigationPortal"]), omit(previous, ["teleportActions", "navigationPortal"]));
    assert.deepEqual(candidate.teleportActions, rawCandidates.get(id)?.teleportActions);
    if (changes.has(`${mapId}/${id}`)) assert.deepEqual(candidate.navigationPortal, current.get(id).navigationPortal);
    else assert.deepEqual(candidate.navigationPortal, previous.navigationPortal);
  }
  for (const [id, candidate] of candidates) if (!oldCandidates.has(id)) {
    assert(additions.has(`${mapId}/${id}`)); assert.deepEqual(candidate, rawCandidates.get(id));
  }
  byMap.set(mapId, { entities: current, markers, oldCount: old.size, count: current.size });
}
assert.deepEqual(actualChanges.sort(), [...changes.keys()].sort());
assert.deepEqual(actualAdditions.sort(), [...additions.keys()].sort());
for (const id of oldIds) assert(currentIds.has(id));
assert.equal(currentIds.size - oldIds.size, new Set(proof.additions.map(({ id }) => id)).size);
const beforeIndex = read(beforeIndexPath), afterIndex = read(afterIndexPath);
assert.deepEqual(omit(afterIndex, ["maps", "locations", "connections"]), omit(beforeIndex, ["maps", "locations", "connections"]));
assert.equal(afterIndex.maps.length, manifest.maps.length);
const oldMapIndex = index(beforeIndex.maps);
for (const map of afterIndex.maps) {
  assert.deepEqual(omit(map, ["locationCount"]), omit(oldMapIndex.get(map.id), ["locationCount"]));
  assert.equal(map.locationCount, byMap.get(map.id).count);
}
const locationKey = ({ mapId, id }) => `${mapId}/${id}`, indexLocations = index(afterIndex.locations, locationKey);
assert.equal(indexLocations.size, appearances);
for (const location of beforeIndex.locations) {
  const key = locationKey(location), next = indexLocations.get(key); assert(next);
  if (changes.has(key)) assert.deepEqual(omit(next, ["searchTerms"]), omit(location, ["searchTerms"]));
  else assert.deepEqual(next, location);
}
for (const location of afterIndex.locations) {
  const marker = byMap.get(location.mapId)?.markers.get(location.id); assert(marker);
  assert.equal(location.x, marker.x); assert.equal(location.y, marker.y);
  const sourceGameplay = byMap.get(location.mapId).entities.get(marker.contentId).gameplay;
  const itemTerms = ["rarity", "slot", "armorType", "weaponType", "proficiency"]
    .map((key) => sourceGameplay?.[key]).filter((value) => typeof value === "string" && value);
  if (sourceGameplay?.unique === true) itemTerms.push("unique");
  assert.deepEqual(location.searchTerms, [...new Set([...marker.searchTerms, ...itemTerms]
    .filter((term) => typeof term === "string").map((term) => term.trim()).filter(Boolean).map((term) => term.slice(0, 240)))]);
}
const oldConnections = index(beforeIndex.connections), connections = index(afterIndex.connections), newConnections = [];
for (const [id, connection] of oldConnections) assert.deepEqual(connections.get(id), connection, `Changed existing connection: ${id}`);
for (const [id, connection] of connections) if (!oldConnections.has(id)) {
  assert.equal(connection.evidence, "navigation-portal-target"); assert.equal(connection.confidence, "verified");
  const [source, target] = connection.endpoints;
  assert(changes.has(`${source.mapId}/${source.locationId}`)); assert(additions.has(`${target.mapId}/${target.locationId}`));
  const owner = byMap.get(source.mapId).entities.get(source.locationId), arrival = byMap.get(target.mapId).entities.get(target.locationId);
  assert.equal(owner.navigationPortal.instanceId, arrival.navigationDestination.instanceId);
  assert.deepEqual(owner.navigationPortal.targetPosition, arrival.worldPosition); newConnections.push(connection);
}
assert.equal(newConnections.length, additions.size);
const beforeItems = read(beforeItemsPath), afterItems = read(afterItemsPath);
assert.deepEqual(omit(afterItems, ["generatedAt"]), omit(beforeItems, ["generatedAt"]), "Item content or acquisitions changed");
assert.equal(appearances, manifest.stats.appearances); assert.equal(currentIds.size, manifest.stats.identities);
const stats = { maps: manifest.maps.length, oldAppearances, appearances, oldIdentities: oldIds.size, identities: currentIds.size,
  changedEntities: changes.size, addedArrivals: additions.size, preservedConnections: oldConnections.size, addedConnections: newConnections.length,
  preservedImmutableArtifacts: immutableArtifacts, preservedItems: afterItems.stats.items, preservedAcquisitions: afterItems.stats.acquisitionRecords };
bytes(import.meta.filename);
for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(fs.readFileSync(path.resolve(root, file))), expected);
const report = { kind: "independent-native-navigation-integration", errors: [], stage, baseline, stats, newConnections, hashes,
  scope: "Independent completed-file comparison, exact old-content preservation, original world-to-image arrival projection, complete index delta and full item/acquisition conservation. Does not invoke the composer or routing implementation. Does not prove runtime reachability, all native-map coverage or live publication." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(stats, null, 2));
