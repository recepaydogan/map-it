import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independently compare every canonical artifact; do not import the stager.
assert.equal(process.argv.length, 5, "Usage: audit-role-stock-refresh.mjs <before> <after> <report>");
const root = path.resolve(import.meta.dirname, "..");
const [before, after, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const keyed = (rows) => {
  const index = new Map(rows.map((row) => [row.id, row])); assert.equal(index.size, rows.length); return index;
};
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const oldManifest = read(path.join(before, "stage-manifest.json")), manifest = read(path.join(after, "stage-manifest.json"));
assert.equal(manifest.kind, "canonical-role-stock-refresh-stage"); assert.equal(path.resolve(manifest.previousCanonical), before);
assert.deepEqual(manifest.maps, oldManifest.maps);
const roleProof = read(manifest.roleAuditPath), stockProof = read(manifest.inventoryAuditPath);
assert.deepEqual(roleProof.errors, []); assert.deepEqual(stockProof.unexpectedDeltas, []);
for (const proof of [roleProof, stockProof]) for (const [file, expected] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), expected, `Stale native proof: ${file}`);
for (const [directory, metadata] of [[before, oldManifest], [after, manifest]]) {
  for (const [file, expected] of Object.entries(metadata.outputHashes)) assert.equal(digest(bytes(path.join(directory, file))), expected, `Changed stage artifact: ${file}`);
}
const roles = new Set(roleProof.changes.map(({ mapId, id }) => `${mapId}/${id}`));
const capabilities = new Set(roleProof.capabilityChanges.map(({ mapId, id }) => `${mapId}/${id}`));
const factions = new Set(roleProof.factionChanges.map(({ mapId, id }) => `${mapId}/${id}`));
const stocks = new Set(stockProof.additions.map(({ mapId, id }) => `${mapId}/${id}`));
const entrances = new Set(stockProof.entranceChanges.map(({ mapId, id }) => `${mapId}/${id}`));
const stats = { maps: manifest.maps.length, appearances: 0, identities: 0, roleChanges: 0, capabilityChanges: 0,
  stockProfiles: 0, factionChanges: 0, entranceChanges: 0, unchangedArtifactFiles: 0, preservedVendorStockNames: 0 };
const identities = new Set(), changes = [];
for (const mapId of manifest.maps) {
  const get = (directory, file) => read(path.join(directory, file));
  const contentFile = `public/maps/${mapId}/content.json`, markerFile = `public/maps/${mapId}/locations.json`;
  const placementFile = `map-sources/catalog/${mapId}-placements.json`;
  const old = get(before, contentFile), current = get(after, contentFile), generated = get(manifest.sourceStageRoot, contentFile);
  const oldEntities = keyed(old.entities), sources = keyed(generated.entities);
  assert.deepEqual(current.entities.map(({ id }) => id), old.entities.map(({ id }) => id));
  assert.deepEqual(omit(current, ["entities"]), omit(old, ["entities"]));
  for (const entity of current.entities) {
    const key = `${mapId}/${entity.id}`, previous = oldEntities.get(entity.id), source = sources.get(entity.id); assert(source);
    assert.deepEqual(omit(entity, ["kind", "tags", "vendor", "tradeInventory", "sceneContext"]),
      omit(previous, ["kind", "tags", "vendor", "tradeInventory", "sceneContext"]), `Unrelated content changed: ${key}`);
    assert.equal(entity.kind, source.kind); assert.deepEqual(entity.vendor, source.vendor);
    if (entity.kind !== previous.kind) { assert(roles.has(key)); stats.roleChanges++; assert.deepEqual(entity.tags, source.tags); }
    else { assert(!roles.has(key)); assert.deepEqual(entity.tags, previous.tags); }
    assert.deepEqual(entity.tradeInventory, source.tradeInventory);
    assert.deepEqual(entity.sceneContext?.authoredTradeInventory, source.sceneContext?.authoredTradeInventory);
    if (entity.sceneContext || previous.sceneContext) assert.deepEqual(omit(entity.sceneContext ?? {}, ["authoredTradeInventory"]),
      omit(previous.sceneContext ?? {}, ["authoredTradeInventory"]));
    if (entity.tradeInventory || entity.sceneContext?.authoredTradeInventory) {
      assert(stocks.has(key)); stats.stockProfiles++;
      const profile = entity.tradeInventory ?? entity.sceneContext.authoredTradeInventory;
      assert.equal(profile.availability, "unverified"); assert.equal(profile.sourceKind, "native-trade-pool");
    }
    if (previous.vendor && !entity.vendor) for (const name of previous.vendor.namedStock) {
      assert(entity.tradeInventory?.namedStock.includes(name)); stats.preservedVendorStockNames++;
    }
    if (!isDeepStrictEqual(entity, previous)) changes.push({ mapId, id: entity.id, title: entity.title,
      fields: [...new Set([...Object.keys(entity), ...Object.keys(previous)])].filter((field) => !isDeepStrictEqual(entity[field], previous[field])) });
    stats.appearances++; identities.add(entity.id);
  }
  const oldPlacement = get(before, placementFile), placement = get(after, placementFile), rawPlacement = get(manifest.sourceStageRoot, placementFile);
  assert.deepEqual(omit(placement, ["candidates"]), omit(oldPlacement, ["candidates"]));
  assert.deepEqual(placement.candidates.map(({ id }) => id), oldPlacement.candidates.map(({ id }) => id));
  const candidates = keyed(placement.candidates), rawCandidates = keyed(rawPlacement.candidates);
  for (let i = 0; i < placement.candidates.length; i++) {
    const candidate = placement.candidates[i], previous = oldPlacement.candidates[i], source = rawCandidates.get(candidate.id), key = `${mapId}/${candidate.id}`;
    assert.deepEqual(omit(candidate, ["candidateKind", "characterCapabilities", "factionHostile", "mapPosition", "mapPositionAdjustment"]),
      omit(previous, ["candidateKind", "characterCapabilities", "factionHostile", "mapPosition", "mapPositionAdjustment"]));
    for (const field of ["candidateKind", "characterCapabilities", "factionHostile", "mapPosition", "mapPositionAdjustment"]) assert.deepEqual(candidate[field], source[field]);
    if (!isDeepStrictEqual(candidate.characterCapabilities, previous.characterCapabilities)) { assert(capabilities.has(key)); stats.capabilityChanges++; }
    if (!isDeepStrictEqual(candidate.factionHostile, previous.factionHostile)) { assert(factions.has(key)); stats.factionChanges++; }
    if (!isDeepStrictEqual(candidate.mapPosition, previous.mapPosition) || !isDeepStrictEqual(candidate.mapPositionAdjustment, previous.mapPositionAdjustment)) {
      assert(entrances.has(key)); stats.entranceChanges++;
    }
  }
  const oldMarkers = get(before, markerFile), markers = get(after, markerFile), rawMarkers = keyed(get(manifest.sourceStageRoot, markerFile).locations);
  assert.deepEqual(omit(markers, ["locations"]), omit(oldMarkers, ["locations"]));
  assert.deepEqual(markers.locations.map(({ id }) => id), oldMarkers.locations.map(({ id }) => id));
  for (let i = 0; i < markers.locations.length; i++) {
    const marker = markers.locations[i], previous = oldMarkers.locations[i], key = `${mapId}/${marker.contentId}`;
    assert.deepEqual(omit(marker, ["category", "label", "subtype", "x", "y"]), omit(previous, ["category", "label", "subtype", "x", "y"]));
    for (const field of ["category", "label", "subtype"]) assert.deepEqual(marker[field], roles.has(key) ? rawMarkers.get(marker.id)[field] : previous[field]);
    assert.deepEqual({ x: marker.x, y: marker.y }, candidates.get(marker.contentId).mapPosition);
    if (!entrances.has(key)) assert.deepEqual({ x: marker.x, y: marker.y }, { x: previous.x, y: previous.y });
  }
  const rejectionFile = `map-sources/catalog/${mapId}-placement-rejections.json`;
  const oldRejections = get(before, rejectionFile), rejections = get(after, rejectionFile), rawRejections = get(manifest.sourceStageRoot, rejectionFile);
  assert.deepEqual(omit(rejections, ["adjustedCandidates"]), omit(oldRejections, ["adjustedCandidates"]));
  const changed = (row) => entrances.has(`${mapId}/${row.id}`);
  assert.deepEqual(rejections.adjustedCandidates.filter((row) => !changed(row)), oldRejections.adjustedCandidates.filter((row) => !changed(row)));
  for (const row of rejections.adjustedCandidates.filter(changed)) assert.deepEqual(row, rawRejections.adjustedCandidates.find(({ id }) => id === row.id));
}
const allowedFiles = new Set(manifest.maps.flatMap((id) => [`public/maps/${id}/content.json`, `public/maps/${id}/locations.json`,
  `map-sources/catalog/${id}-placements.json`, `map-sources/catalog/${id}-placement-rejections.json`]));
for (const [file, expected] of Object.entries(oldManifest.outputHashes)) {
  assert(Object.hasOwn(manifest.outputHashes, file), `Lost canonical artifact: ${file}`);
  if (manifest.outputHashes[file] === expected) stats.unchangedArtifactFiles++;
  else assert(allowedFiles.has(file), `Changed immutable artifact: ${file}`);
}
assert.equal(stats.roleChanges, roleProof.stats.changedAppearances); assert.equal(stats.capabilityChanges, roleProof.stats.capabilityChanges);
assert.equal(stats.factionChanges, roleProof.stats.factionChanges);
stats.identities = identities.size;
bytes(import.meta.filename);
const report = { kind: "independent-canonical-role-stock-conservation", before, after, stats, changes, hashes, errors: [],
  scope: "Every existing canonical entity, marker, source candidate, relationship, rejection and immutable artifact compared. All unrelated fields, identities, floor ownership and world positions retained; changed fields match independently source-audited raw output. Item/search consumers and complete scene/map coverage require separate review." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors: [] }, null, 2));
