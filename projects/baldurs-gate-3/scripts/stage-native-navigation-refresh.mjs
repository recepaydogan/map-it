import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { finalizePlacementRouting } from "./lib/placement-routing.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 8) throw new Error("Usage: stage-native-navigation-refresh.mjs <canonical> <old-raw> <new-raw> <native-audit> <output-stage> <report>");
const [canonical, oldRaw, newRaw, auditPath, output, reportPath] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const within = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(within && !within.startsWith("..") && !path.isAbsolute(within) && !fs.existsSync(output), "Output must be a fresh audit directory");
const hashes = {}, outputHashes = {}, pending = new Map();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = relative(absolute), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash, `Changed input: ${key}`); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const serialize = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const keyed = (entries) => {
  const result = new Map(entries.map((entry) => [entry.id, entry]));
  assert.equal(result.size, entries.length, "Duplicate identity"); return result;
};
const proof = read(auditPath), manifest = read(path.join(canonical, "stage-manifest.json"));
assert.equal(proof.kind, "native-action-navigation-source-and-conservation"); assert.deepEqual(proof.errors, []);
assert.equal(path.resolve(proof.stage), newRaw); assert.equal(path.resolve(proof.baseline), oldRaw);
for (const [file, expected] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), expected, `Stale native proof: ${file}`);
const rawManifest = read(path.join(newRaw, "stage-manifest.json"));
const oldManifest = read(path.join(oldRaw, "stage-manifest.json"));
assert.equal(rawManifest.kind, "unfinalized-placement-stage"); assert.equal(rawManifest.recordsIncluded, false);
assert.deepEqual(omit(rawManifest, ["dialogCatalogPath"]), omit(oldManifest, ["dialogCatalogPath"]));
assert.equal(path.resolve(manifest.sourceStageRoot), oldRaw);
assert.deepEqual(rawManifest.maps, manifest.maps);
const config = read(rawManifest.configPath);
assert.deepEqual([...manifest.maps].sort(), config.maps.map(({ id }) => id).sort());
assert.equal(proof.stats.maps, manifest.maps.length);
for (const [file, expected] of Object.entries(manifest.outputHashes)) assert.equal(digest(bytes(path.join(canonical, file))), expected, `Changed canonical artifact: ${file}`);
const documents = new Map(), originals = new Map(), rawDocuments = new Map();
const changedKeys = new Set(), addedKeys = new Set(), oldIdentities = new Set();
let preservedEntities = 0, preservedMarkers = 0, refreshedCandidates = 0;
for (const mapId of manifest.maps) {
  const contentFile = `public/maps/${mapId}/content.json`, locationsFile = `public/maps/${mapId}/locations.json`;
  const placementFile = `map-sources/catalog/${mapId}-placements.json`;
  const files = { content: contentFile, locations: locationsFile, placement: placementFile };
  const before = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(path.join(canonical, file))]));
  const raw = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(path.join(newRaw, file))]));
  const previousRaw = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(path.join(oldRaw, file))]));
  const next = structuredClone(before), entities = keyed(next.content.entities), candidates = keyed(next.placement.candidates);
  const rawEntities = keyed(raw.content.entities), rawCandidates = keyed(raw.placement.candidates);
  const rawMarkers = keyed(raw.locations.locations), oldRawEntities = keyed(previousRaw.content.entities);
  for (const entity of before.content.entities) oldIdentities.add(entity.id);
  for (const change of proof.changes.filter((entry) => entry.mapId === mapId)) {
    const current = entities.get(change.id), generated = rawEntities.get(change.id);
    assert(current && generated && !current.navigationPortal, `Missing or previously bound canonical owner: ${mapId}/${change.id}`);
    assert.deepEqual(generated.navigationPortal.actionBinding.actions, change.actions);
    assert.deepEqual(current.worldPosition, generated.worldPosition);
    assert.deepEqual(omit(generated, ["navigationPortal"]), oldRawEntities.get(change.id));
    current.navigationPortal = generated.navigationPortal;
    const markers = next.locations.locations.filter((marker) => marker.contentId === change.id);
    assert.equal(markers.length, 1, `Missing/ambiguous canonical source marker: ${mapId}/${change.id}`);
    markers[0].searchTerms.push(...[current.navigationPortal.sourceRegionId, current.navigationPortal.targetRegionId].filter(Boolean));
    changedKeys.add(`${mapId}/${change.id}`);
  }
  for (const addition of proof.additions.filter((entry) => entry.mapId === mapId)) {
    assert(!entities.has(addition.id) && !candidates.has(addition.id));
    const entity = rawEntities.get(addition.id), candidate = rawCandidates.get(addition.id);
    assert(entity && candidate && entity.navigationDestination);
    const markers = [...rawMarkers.values()].filter((marker) => marker.contentId === addition.id);
    assert.equal(markers.length, 1);
    next.content.entities.push(entity); next.locations.locations.push(markers[0]); next.placement.candidates.push(candidate);
    addedKeys.add(`${mapId}/${addition.id}`);
  }
  for (const candidate of before.placement.candidates) {
    const generated = rawCandidates.get(candidate.id), current = candidates.get(candidate.id);
    assert(generated, `Canonical source candidate absent from regeneration: ${mapId}/${candidate.id}`);
    assert.deepEqual(omit(candidate, ["teleportActions", "navigationPortal"]), omit(generated, ["teleportActions", "navigationPortal"]));
    if (Object.hasOwn(generated, "teleportActions")) current.teleportActions = generated.teleportActions;
    if (changedKeys.has(`${mapId}/${candidate.id}`)) current.navigationPortal = generated.navigationPortal;
    else assert.deepEqual(current.navigationPortal, generated.navigationPortal);
    if (!isDeepStrictEqual(candidate, current)) refreshedCandidates += 1;
  }
  // Source-object totals include synthetic arrivals even outside this map's crop.
  const uniqueArrivals = new Set(proof.additions.map(({ id }) => id)).size;
  assert.deepEqual(omit(raw.placement.stats, ["candidates", "uniqueObjects", "localizedObjects"]),
    omit(previousRaw.placement.stats, ["candidates", "uniqueObjects", "localizedObjects"]));
  for (const key of ["uniqueObjects", "localizedObjects"]) {
    assert.equal(raw.placement.stats[key] - previousRaw.placement.stats[key], uniqueArrivals);
    assert.equal(before.placement.stats[key], previousRaw.placement.stats[key]);
  }
  next.placement.stats = { ...raw.placement.stats, candidates: next.placement.candidates.length };
  next.placement.generatedAt = raw.placement.generatedAt;
  const rejectedFile = `map-sources/catalog/${mapId}-placement-rejections.json`;
  assert.deepEqual(read(path.join(newRaw, rejectedFile)), read(path.join(oldRaw, rejectedFile)));
  originals.set(mapId, before); documents.set(mapId, next); rawDocuments.set(mapId, raw);
}
assert.equal(changedKeys.size, proof.changes.length); assert.equal(addedKeys.size, proof.additions.length);
for (const addition of proof.additions) assert(!oldIdentities.has(addition.id), `Arrival reuses an accepted identity: ${addition.id}`);
const rawRouting = finalizePlacementRouting(config.maps, rawDocuments);
const routed = finalizePlacementRouting(config.maps, documents);
assert.equal(routed.stats.removedDuplicateAppearances, 0, "Addition must be assigned to its final floor before composition");
assert.equal(routed.stats.removedLinks, 0, "Composition must not discard accepted relationships");
for (const [mapId, next] of documents) {
  const before = originals.get(mapId), entities = keyed(next.content.entities), markers = keyed(next.locations.locations);
  const routedRawEntities = keyed(rawDocuments.get(mapId).content.entities);
  for (const previous of before.content.entities) {
    const current = entities.get(previous.id);
    assert(current, `Lost accepted entity: ${mapId}/${previous.id}`);
    if (changedKeys.has(`${mapId}/${previous.id}`)) assert.deepEqual(omit(current, ["navigationPortal"]), previous);
    else { assert.deepEqual(current, previous); preservedEntities += 1; }
  }
  for (const previous of before.locations.locations) {
    const current = markers.get(previous.id); assert(current);
    if (changedKeys.has(`${mapId}/${previous.contentId}`)) assert.deepEqual(omit(current, ["searchTerms"]), omit(previous, ["searchTerms"]));
    else { assert.deepEqual(current, previous); preservedMarkers += 1; }
  }
  for (const entity of next.content.entities) {
    const key = `${mapId}/${entity.id}`;
    if (addedKeys.has(key)) assert.deepEqual(entity, routedRawEntities.get(entity.id), `Wrong final arrival floor: ${key}`);
    if (changedKeys.has(key)) assert.deepEqual(entity.navigationPortal, routedRawEntities.get(entity.id)?.navigationPortal);
  }
  for (const [key, file] of [["content", `public/maps/${mapId}/content.json`], ["locations", `public/maps/${mapId}/locations.json`],
    ["placement", `map-sources/catalog/${mapId}-placements.json`]]) {
    pending.set(file, isDeepStrictEqual(before[key], next[key]) ? bytes(path.join(canonical, file)) : serialize(next[key]));
  }
}
for (const file of Object.keys(manifest.outputHashes)) if (!pending.has(file)) pending.set(file, bytes(path.join(canonical, file)));
assert.deepEqual([...pending.keys()].sort(), Object.keys(manifest.outputHashes).sort());
for (const file of [import.meta.filename, "scripts/lib/placement-routing.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const identities = new Set([...documents.values()].flatMap(({ content }) => content.entities.map(({ id }) => id)));
assert.equal(identities.size, oldIdentities.size + new Set(proof.additions.map(({ id }) => id)).size);
const stats = { maps: manifest.maps.length, appearances: routed.stats.retainedAppearances, identities: identities.size,
  preservedEntities, preservedMarkers, changedEntities: changedKeys.size, addedArrivals: addedKeys.size,
  refreshedCandidates, preservedBaselineFiles: [...pending.keys()].filter((file) => file.startsWith("baseline/")).length };
const report = { kind: "native-navigation-canonical-refresh", errors: [], canonical, oldRaw, newRaw, output, auditPath,
  stats, routing: { canonical: routed.stats, raw: rawRouting.stats }, hashes,
  scope: "Full-map source-proven navigation delta only. Every old canonical entity/marker is retained with exact unrelated fields, all metadata and historical baselines are preserved. Final arrival routing agrees with whole-set routing. No raster changes, live publication or claim of complete native content coverage." };
for (const [file, data] of pending) {
  const absolute = path.join(output, file); fs.mkdirSync(path.dirname(absolute), { recursive: true });
  writeGeneratedFile(absolute, data); outputHashes[file] = digest(data);
}
for (const [file, expected] of Object.entries(outputHashes)) assert.equal(digest(fs.readFileSync(path.join(output, file))), expected);
writeGeneratedFile(reportPath, serialize(report));
writeGeneratedFile(path.join(output, "stage-manifest.json"), serialize({ ...manifest, kind: "native-navigation-refresh-stage",
  baselineRoot: canonical, sourceStageRoot: newRaw, sourceAuditPath: auditPath, conservationAuditPath: reportPath,
  dialogCatalogPath: rawManifest.dialogCatalogPath, stats, hashes, outputHashes,
  requiresRoutingAndConservationReview: false, requiresItemAcquisitionReview: true, publishedDataUnchanged: true,
  scope: report.scope }));
console.log(JSON.stringify(stats, null, 2));
