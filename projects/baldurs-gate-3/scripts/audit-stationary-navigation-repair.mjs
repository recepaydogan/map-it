import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import ts from "typescript";
import { getOutgoingConnectionKeys } from "../src/features/map/map-connection-directions.ts";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Reconstruct the allowed complete-artifact delta without importing the stager,
// routing function, item builder or connection-index builder.
assert.equal(process.argv.length, 9, "Usage: node --experimental-strip-types audit-stationary-navigation-repair.mjs <before> <after> <old-index> <new-index> <old-items> <new-items> <report>");
const root = path.resolve(import.meta.dirname, "..");
const [before, after, oldIndexPath, indexPath, oldItemsPath, itemsPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const keyed = (rows, selector = ({ id }) => id) => {
  const result = new Map(rows.map((row) => [selector(row), row])); assert.equal(result.size, rows.length); return result;
};
const baseline = read(path.join(before, "stage-manifest.json")), manifest = read(path.join(after, "stage-manifest.json"));
assert.equal(manifest.kind, "canonical-navigation-repair-stage"); assert.equal(manifest.previousNavigationStage, before);
assert.deepEqual(manifest.maps, baseline.maps);
const proof = read(manifest.navigationAuditPath); assert.equal(proof.kind, "stationary-navigation-source-and-delta-audit"); assert.deepEqual(proof.errors, []);
const review = proof.review, raw = manifest.navigationRawStage, rawManifest = read(path.join(raw, "stage-manifest.json"));
assert.equal(proof.after, raw);
for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), hash, `Stale source proof: ${file}`);
for (const [directory, document] of [[before, baseline], [after, manifest]]) for (const [file, hash] of Object.entries(document.outputHashes)) {
  assert.equal(digest(bytes(path.join(directory, file))), hash, `Changed artifact: ${file}`);
}
assert.deepEqual(manifest.pendingNavigationReview, baseline.pendingNavigationReview.filter(({ id }) => id !== review.portalId));
const filesFor = (id) => ({ content: `public/maps/${id}/content.json`, locations: `public/maps/${id}/locations.json`,
  placement: `map-sources/catalog/${id}-placements.json`, rejections: `map-sources/catalog/${id}-placement-rejections.json` });
const documents = (stage, mapId) => Object.fromEntries(Object.entries(filesFor(mapId)).map(([key, file]) => [key, read(path.join(stage, file))]));
const oldSource = documents(before, review.parentMap), generated = documents(raw, review.sourceMap);
const sourceEntity = oldSource.content.entities.find(({ id }) => id === review.portalId);
const sourceCandidate = oldSource.placement.candidates.find(({ id }) => id === review.portalId);
const sourceMarker = oldSource.locations.locations.find(({ id }) => id === review.portalId);
const rawCandidate = generated.placement.candidates.find(({ id }) => id === review.portalId), rawMarker = generated.locations.locations.find(({ id }) => id === review.portalId);
assert(sourceEntity && sourceCandidate && sourceMarker && rawCandidate && rawMarker);
assert.deepEqual(omit(rawCandidate, ["mapPosition", "mapPositionAdjustment"]), omit(sourceCandidate, ["mapPosition", "mapPositionAdjustment"]));
const stats = { maps: manifest.maps.length, beforeAppearances: 0, afterAppearances: 0, preservedCompleteEntities: 0,
  movedSources: 0, retiredSyntheticAppearances: 0, immutableFiles: 0 };
const oldIds = new Set(), newIds = new Set(), locations = new Map(), allowedFiles = new Set();
for (const mapId of manifest.maps) {
  const old = documents(before, mapId), current = documents(after, mapId), expected = structuredClone(old);
  for (const entity of old.content.entities) oldIds.add(entity.id);
  for (const entity of current.content.entities) newIds.add(entity.id);
  stats.beforeAppearances += old.content.entities.length; stats.afterAppearances += current.content.entities.length;
  if (mapId === review.parentMap) {
    for (const [section, field] of [["content", "entities"], ["placement", "candidates"], ["locations", "locations"]]) {
      assert.equal(expected[section][field].filter(({ id }) => id === review.portalId).length, 1);
      expected[section][field] = expected[section][field].filter(({ id }) => id !== review.portalId);
    }
  }
  if (mapId === review.sourceMap) {
    const retired = old.content.entities.filter(({ id }) => id === review.retiredId); assert.equal(retired.length, 1);
    assert.equal(retired[0].navigationDestination.instanceId, review.portalInstanceId);
    assert.deepEqual(retired[0].navigationDestination.sourcePosition, retired[0].navigationDestination.targetPosition);
    for (const [section, field] of [["content", "entities"], ["placement", "candidates"], ["locations", "locations"]]) {
      const replacement = section === "content" ? sourceEntity : section === "placement"
        ? { ...sourceCandidate, mapPosition: rawCandidate.mapPosition, mapPositionAdjustment: rawCandidate.mapPositionAdjustment }
        : { ...sourceMarker, x: rawMarker.x, y: rawMarker.y, region: rawMarker.region, regionId: rawMarker.regionId };
      expected[section][field] = expected[section][field].map((entry) => entry.id === review.retiredId ? replacement : entry);
    }
    expected.rejections.rejectedCandidates = expected.rejections.rejectedCandidates.filter(({ id }) => id !== review.portalId);
    const row = generated.rejections.adjustedCandidates.find(({ id }) => id === review.portalId); assert(row);
    expected.rejections.adjustedCandidates.push(row);
    expected.placement.silhouetteRejectedCandidates = expected.placement.silhouetteRejectedCandidates.filter(({ id }) => id !== review.portalId);
    expected.placement.stats.silhouetteRejectedCandidates = expected.placement.silhouetteRejectedCandidates.length;
    stats.movedSources++; stats.retiredSyntheticAppearances++;
  }
  if (rawManifest.maps.includes(mapId)) {
    expected.placement.stats.uniqueObjects--;
    expected.placement.stats.localizedObjects--;
  }
  expected.placement.stats.candidates = expected.placement.candidates.length;
  assert.deepEqual(current, expected, `Unexpected complete-artifact delta: ${mapId}`);
  const entityIds = [...keyed(current.content.entities).keys()].sort();
  assert.deepEqual([...keyed(current.placement.candidates).keys()].sort(), entityIds);
  assert.deepEqual([...keyed(current.locations.locations, ({ contentId }) => contentId).keys()].sort(), entityIds);
  for (const entity of current.content.entities) {
    assert.notEqual(entity.id, review.retiredId);
    const previous = old.content.entities.find(({ id }) => id === entity.id) ?? (entity.id === review.portalId ? sourceEntity : null);
    assert.deepEqual(entity, previous); stats.preservedCompleteEntities++;
  }
  for (const marker of current.locations.locations) locations.set(`${mapId}/${marker.id}`, marker);
  for (const [key, file] of Object.entries(filesFor(mapId))) if (!isDeepStrictEqual(old[key], current[key])) allowedFiles.add(file);
}
assert.deepEqual([...newIds].sort(), [...oldIds].filter((id) => id !== review.retiredId).sort());
assert.equal(stats.beforeAppearances - stats.afterAppearances, 1); assert.equal(stats.movedSources, 1); assert.equal(stats.retiredSyntheticAppearances, 1);
for (const [file, hash] of Object.entries(baseline.outputHashes)) {
  assert(Object.hasOwn(manifest.outputHashes, file), `Lost baseline artifact: ${file}`);
  if (manifest.outputHashes[file] === hash) stats.immutableFiles++;
  else assert(allowedFiles.has(file), `Changed immutable artifact: ${file}`);
}
const oldIndex = read(oldIndexPath), index = read(indexPath), indexed = keyed(index.locations, ({ mapId, id }) => `${mapId}/${id}`);
assert.equal(indexed.size, stats.afterAppearances);
assert.deepEqual(omit(index, ["maps", "locations", "connections"]), omit(oldIndex, ["maps", "locations", "connections"]));
for (const old of oldIndex.locations) {
  if (old.id === review.retiredId) { assert(!indexed.has(`${old.mapId}/${old.id}`)); continue; }
  const moved = old.mapId === review.parentMap && old.id === review.portalId;
  const mapId = moved ? review.sourceMap : old.mapId, actual = indexed.get(`${mapId}/${old.id}`); assert(actual);
  const marker = locations.get(`${mapId}/${old.id}`), expected = { ...old };
  if (moved) Object.assign(expected, { mapId, mapName: read(path.join(after, `public/maps/${mapId}/metadata.json`)).displayName,
    region: marker.region, regionId: marker.regionId, x: marker.x, y: marker.y });
  assert.deepEqual(actual, expected, `Unexpected search delta: ${mapId}/${old.id}`);
}
assert.deepEqual(index.maps.map(({ id }) => id), oldIndex.maps.map(({ id }) => id));
for (let i = 0; i < index.maps.length; i++) {
  const row = index.maps[i]; assert.deepEqual(row, { ...oldIndex.maps[i], locationCount: index.locations.filter(({ mapId }) => mapId === row.id).length });
}
const removedConnections = oldIndex.connections.filter((connection) => !index.connections.some(({ id }) => id === connection.id));
assert.equal(removedConnections.length, 1); const falseConnection = removedConnections[0];
assert.equal(falseConnection.evidence, "navigation-portal-target");
assert.deepEqual(falseConnection.sourcePortalInstanceIds, [review.portalInstanceId, review.portalInstanceId]);
assert.deepEqual(falseConnection.endpoints, [{ mapId: review.parentMap, locationId: review.portalId }, { mapId: review.sourceMap, locationId: review.retiredId }]);
assert.deepEqual(index.connections, oldIndex.connections.filter(({ id }) => id !== falseConnection.id));

const readConnections = (file) => {
  const source = ts.createSourceFile(file, bytes(file).toString("utf8"), ts.ScriptTarget.Latest, true);
  const evaluate = (node) => {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(evaluate);
    assert(ts.isObjectLiteralExpression(node));
    return Object.fromEntries(node.properties.map((property) => {
      assert(ts.isPropertyAssignment(property)); return [ts.isIdentifier(property.name) ? property.name.text : evaluate(property.name), evaluate(property.initializer)];
    }));
  };
  const statements = source.statements.filter(ts.isVariableStatement).flatMap((statement) => statement.declarationList.declarations);
  const declaration = statements.find((node) => ts.isIdentifier(node.name) && node.name.text === "MAP_CONNECTIONS"); assert(declaration);
  return evaluate(declaration.initializer);
};
const oldCurated = readConnections("map-sources/audits/pre-stationary-navigation-fix/map-config.ts"), curated = readConnections("src/features/map/map-config.ts");
assert.deepEqual(curated.filter(({ id }) => id !== review.connectionId), oldCurated);
assert.deepEqual(curated.find(({ id }) => id === review.connectionId), proof.connection);
const combined = [...index.connections, ...curated], endpointKeys = new Set();
for (const connection of combined) for (const endpoint of connection.endpoints) {
  assert(indexed.has(`${endpoint.mapId}/${endpoint.locationId}`), `Connection endpoint has no current pin: ${connection.id}`);
  endpointKeys.add(`${endpoint.mapId}:${endpoint.locationId}`);
}
for (const key of endpointKeys) {
  const expected = new Set();
  for (const connection of combined) {
    const [from, to] = connection.endpoints.map(({ mapId, locationId }) => `${mapId}:${locationId}`);
    if (from === to) continue;
    if (from === key) expected.add(to);
    if (to === key && connection.direction !== "forward" && connection.evidence !== "navigation-portal-target") expected.add(from);
  }
  assert.deepEqual([...getOutgoingConnectionKeys(combined, key)].sort(), [...expected].sort());
}
const oldItems = read(oldItemsPath), items = read(itemsPath);
assert.deepEqual(omit(items, ["generatedAt"]), omit(oldItems, ["generatedAt"]));
assert(items.items.every((item) => item.acquisitions.every(({ locationId }) => locationId !== review.retiredId)));
for (const file of [import.meta.filename, "scripts/stage-stationary-navigation-repair.mjs", "scripts/build-map-search-index.mjs",
  "scripts/build-item-database.mjs", "src/features/map/map-connection-directions.ts", "src/features/map/saved-map-storage.ts",
  "src/features/map/use-saved-map-state.ts", "src/features/map/map-workspace.tsx"]) bytes(file);
Object.assign(stats, { identities: newIds.size, retainedNativeConnections: index.connections.length, curatedConnections: curated.length,
  directedEndpointKeys: endpointKeys.size, items: items.items.length, acquisitions: items.stats.acquisitionRecords });
writeGeneratedFile(output, `${JSON.stringify({ kind: "independent-stationary-navigation-repair-audit", before, after, stats, hashes, errors: [],
  removedFalseConnection: falseConnection, realDirectedConnection: proof.connection,
  scope: "Every canonical file/entity/candidate/marker/relationship compared; exactly one stationary duplicate retired and one identical real source moved. Every complete item/acquisition payload retained. All index rows, native connections and curated connection endpoints checked; the actual UI direction selector evaluated on the entire combined real graph. Alias mappings source-proven; saved storage backup/conflict/replay behavior is code/type review only, not live/synthetic storage testing. No claim of full native-room, scene-content or image-fidelity completion." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors: [] }, null, 2));
