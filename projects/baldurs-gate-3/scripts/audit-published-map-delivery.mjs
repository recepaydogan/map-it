import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 5, "Usage: audit-published-map-delivery.mjs <delivery> <publication> <fresh-report>");
const root = path.resolve(import.meta.dirname, ".."), [deliveryPath, publicationPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
assert(!fs.existsSync(output));
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const digest = (data) => createHash("sha256").update(data).digest("hex"), hashes = {};
const bytes = (file) => { const full = path.resolve(root, file), data = fs.readFileSync(full); hashes[relative(full)] = digest(data); return data; };
const read = (file) => JSON.parse(bytes(file));
const deliveryBytes = bytes(deliveryPath), delivery = JSON.parse(deliveryBytes), publication = read(publicationPath);
assert.equal(delivery.publicationReady, true); assert.deepEqual(delivery.errors, []); assert.deepEqual(delivery.remaining, []);
assert.equal(publication.kind, "recoverable-coupled-map-publication"); assert.deepEqual(publication.errors, []);
assert.equal(path.resolve(root, publication.deliveryManifest), deliveryPath);
assert.equal(publication.deliveryManifestHash, digest(deliveryBytes));
assert.equal(publication.stats.files, Object.keys(delivery.files).length);
assert.deepEqual(publication.published, Object.fromEntries(Object.entries(delivery.files).map(([target, entry]) => [target, entry.sha256])));
for (const file of ["src/features/map/map-registry.ts", "src/features/map/map-config.ts", "public/maps/index.json", "public/data/item-database.json"]) {
  assert.equal(digest(bytes(file)), delivery.files[file].sha256, `Changed key published file: ${file}`);
}
const mapIds = readRegisteredMapIds(bytes("src/features/map/map-registry.ts").toString("utf8"));
assert.equal(mapIds.length, 165); assert.equal(new Set(mapIds).size, mapIds.length);
const index = read("public/maps/index.json"), indexedMaps = new Set(index.maps.map(({ id }) => id));
assert.deepEqual([...indexedMaps].sort(), [...mapIds].sort());
const locations = new Set(), contents = new Set();
let appearances = 0, placementCandidates = 0, rasters = 0;
for (const mapId of mapIds) {
  const metadata = read(`public/maps/${mapId}/metadata.json`), content = read(`public/maps/${mapId}/content.json`);
  const document = read(`public/maps/${mapId}/locations.json`), placement = read(`map-sources/catalog/${mapId}-placements.json`);
  const entities = new Set(content.entities.map(({ id }) => id));
  assert.equal(entities.size, content.entities.length, `Duplicate content ID: ${mapId}`);
  for (const id of entities) contents.add(`${mapId}/${id}`);
  for (const location of document.locations) {
    assert(Number.isFinite(location.x) && Number.isFinite(location.y));
    assert(location.x >= metadata.bounds.minX && location.x <= metadata.bounds.maxX
      && location.y >= metadata.bounds.minY && location.y <= metadata.bounds.maxY, `Out-of-bounds pin: ${mapId}/${location.id}`);
    assert(entities.has(location.contentId ?? location.id), `Pin without content: ${mapId}/${location.id}`);
    assert(!locations.has(`${mapId}/${location.id}`), `Duplicate pin: ${mapId}/${location.id}`);
    locations.add(`${mapId}/${location.id}`); appearances++;
  }
  assert.equal(placement.candidates.length, document.locations.length, `Candidate/pin mismatch: ${mapId}`);
  placementCandidates += placement.candidates.length;
  const prefix = `public/maps/${mapId}/`;
  rasters += Object.keys(delivery.files).filter((file) => file.startsWith(prefix) && file.endsWith(".webp")).length;
}
assert.equal(appearances, 15_391); assert.equal(placementCandidates, appearances);
assert.equal(index.locations.length, appearances);
for (const location of index.locations) assert(locations.has(`${location.mapId}/${location.id}`), `Index location missing: ${location.mapId}/${location.id}`);
for (const connection of index.connections) for (const endpoint of connection.endpoints) {
  assert(locations.has(`${endpoint.mapId}/${endpoint.locationId}`), `Connection endpoint missing: ${connection.id}`);
}
const database = read("public/data/item-database.json");
let acquisitions = 0, mappedAcquisitions = 0;
for (const item of database.items) for (const acquisition of item.acquisitions ?? []) {
  acquisitions++;
  if (!acquisition.mapId) continue;
  assert(indexedMaps.has(acquisition.mapId), `Item acquisition map missing: ${item.id}/${acquisition.id}`);
  if (acquisition.locationId) assert(locations.has(`${acquisition.mapId}/${acquisition.locationId}`), `Item acquisition pin missing: ${item.id}/${acquisition.id}`);
  mappedAcquisitions++;
}
assert.equal(database.items.length, 6_870); assert.equal(acquisitions, 140_073);
assert.equal(index.connections.length, 217); assert.equal(rasters, 33_983);
for (const target of Object.keys(delivery.files)) assert(!fs.existsSync(path.resolve(root, `${target}.codex-map-publish-${process.pid}`)));
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Audit input changed: ${file}`);
const report = {
  kind: "published-map-delivery-audit", delivery: relative(deliveryPath), publication: relative(publicationPath),
  stats: { maps: mapIds.length, appearances, placementCandidates, contentRecords: contents.size, rasters,
    connections: index.connections.length, items: database.items.length, acquisitions, mappedAcquisitions },
  checks: { allPinsInsideMapBounds: true, allPinsHaveContent: true, allIndexPinsPublished: true,
    allConnectionEndpointsPublished: true, allMappedItemAcquisitionsPublished: true, registryIndexMapSetsMatch: true,
    publicationIsRecoverable: true },
  hashes, errors: [], limitations: ["No browser, application, game, fixture or test-suite run; the user performs visual/application testing."],
};
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, errors: report.errors.length, output: relative(output) }));
