import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import ts from "typescript";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Verify actual index records and old item conservation. New scene acquisition
// records are inventoried separately; binding alone is not native item proof.
assert.equal(process.argv.length, 9,
  "Usage: audit-reconciled-map-consumers.mjs <map-audit> <old-index> <new-index> <old-items> <new-items> <fresh-report> <marker-audit>");
const root = path.resolve(import.meta.dirname, "..");
const [proofPath, oldIndexPath, indexPath, oldItemsPath, itemsPath, output, markerAuditPath] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relativeOutput = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput) && !fs.existsSync(output));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/"), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (row, fields) => Object.fromEntries(Object.entries(row).filter(([key]) => !fields.includes(key)));
const canonical = (row) => JSON.stringify(row, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en"))) : value);
const multiset = (rows) => rows.map(canonical).sort();
const keyed = (rows, key = (row) => row.id) => { const index = new Map(rows.map((row) => [key(row), row])); assert.equal(index.size, rows.length); return index; };
const proof = read(proofPath); assert.equal(proof.kind, "independent-canonical-map-reconciliation-audit"); assert.deepEqual(proof.errors, []);
for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), hash, `Stale reconciliation audit: ${file}`);
const manifest = read(path.join(proof.stage, "stage-manifest.json")), report = read(manifest.conservationAuditPath);
const scenes = read(manifest.sceneContentPath), profiles = keyed(scenes.profiles);
const moveById = keyed(report.moves, (row) => `${row.fromMap}/${row.id}`), retired = keyed(report.retirements, (row) => `${row.mapId}/${row.id}`);
const metadata = new Map(), entities = new Map(), markers = new Map();
for (const mapId of manifest.maps) {
  metadata.set(mapId, read(path.join(proof.stage, `public/maps/${mapId}/metadata.json`)));
  for (const entity of read(path.join(proof.stage, `public/maps/${mapId}/content.json`)).entities) entities.set(`${mapId}/${entity.id}`, entity);
  for (const marker of read(path.join(proof.stage, `public/maps/${mapId}/locations.json`)).locations) markers.set(`${mapId}/${marker.id}`, marker);
}
const before = read(oldIndexPath), after = read(indexPath), indexed = keyed(after.locations, (row) => `${row.mapId}/${row.id}`);
assert.deepEqual([...indexed.keys()].sort(), [...markers.keys()].sort());
assert.deepEqual(omit(before, ["maps", "locations", "relationships", "connections"]), omit(after, ["maps", "locations", "relationships", "connections"]));
assert.equal(after.maps.length, manifest.maps.length);
const indexedMaps = keyed(after.maps);
for (const [mapId, meta] of metadata) assert.deepEqual(indexedMaps.get(mapId), { id: mapId, name: meta.displayName,
  locationCount: after.locations.filter((row) => row.mapId === mapId).length, bounds: meta.bounds });
for (const [key, marker] of markers) {
  const row = indexed.get(key), entity = entities.get(key); assert(row && entity);
  for (const field of ["id", "name", "category", "categoryFacets", "contentId", "x", "y", "label", "subtype", "regionId", "region", "description"]) {
    assert.deepEqual(row[field], marker[field], `Index differs from marker: ${key}/${field}`);
  }
  assert.equal(row.mapName, metadata.get(row.mapId).displayName);
  const gameplay = Object.fromEntries(["rarity", "slot", "armorType", "weaponType", "proficiency"]
    .filter((field) => typeof entity.gameplay?.[field] === "string" && entity.gameplay[field]).map((field) => [field, entity.gameplay[field]]));
  if (entity.gameplay?.unique === true) gameplay.unique = true;
  assert.deepEqual(row.gameplay, Object.keys(gameplay).length ? gameplay : undefined);
  assert.equal(row.navigationDestinationFor, entity.navigationDestination?.portalId);
  const terms = [...(marker.searchTerms ?? []), ...["rarity", "slot", "armorType", "weaponType", "proficiency"].map((field) => gameplay[field]), gameplay.unique ? "unique" : ""];
  assert.deepEqual(row.searchTerms, [...new Set(terms.filter((term) => typeof term === "string").map((term) => term.trim()).filter(Boolean).map((term) => term.slice(0, 240)))]);
}
const indexChanges = [];
for (const old of before.locations) {
  if (retired.has(`${old.mapId}/${old.id}`)) { assert(!indexed.has(`${old.mapId}/${old.id}`)); continue; }
  const move = moveById.get(`${old.mapId}/${old.id}`), mapId = move?.toMap ?? old.mapId, current = indexed.get(`${mapId}/${old.id}`); assert(current);
  const fields = [...new Set([...Object.keys(old), ...Object.keys(current)])].filter((field) => !equal(old[field], current[field]));
  const allowed = ["name", "searchTerms", ...(move ? ["mapId", "mapName", "region", "regionId", "x", "y"] : [])];
  assert(fields.every((field) => allowed.includes(field)), `Unreviewed index delta: ${old.mapId}/${old.id}/${fields}`);
  if (fields.length) indexChanges.push({ fromMap: old.mapId, toMap: mapId, id: old.id, fields });
}
const groups = new Map();
for (const row of after.locations) if (!["transition", "vertical-access"].includes(row.category)) {
  const key = `${row.category}:${row.name}`, entries = groups.get(key) ?? []; entries.push(row); groups.set(key, entries);
}
const expectedGroups = [...groups].filter(([, rows]) => rows.length >= 2 && rows.length <= 12 && new Set(rows.map((row) => row.mapId)).size >= 2);
assert.equal(after.relationships.length, expectedGroups.length);
for (const [key, rows] of expectedGroups) {
  const matches = after.relationships.filter((row) => `${row.category}:${row.name}` === key); assert.equal(matches.length, 1);
  assert.equal(matches[0].kind, "exact-name-match"); assert.equal(matches[0].confidence, "uncertain");
  assert.deepEqual(matches[0].appearances, rows.map(({ mapId, id }) => ({ mapId, locationId: id })));
}
const connections = keyed(after.connections); assert.deepEqual([...connections.keys()].sort(), before.connections.map((row) => row.id).sort());
let movedConnections = 0;
for (const connection of before.connections) {
  const expected = structuredClone(connection);
  expected.endpoints = expected.endpoints.map((endpoint) => ({ ...endpoint, mapId: moveById.get(`${endpoint.mapId}/${endpoint.locationId}`)?.toMap ?? endpoint.mapId }));
  if (!equal(expected.endpoints, connection.endpoints)) movedConnections++;
  const actual = connections.get(connection.id);
  if (expected.endpoints[0].locationId !== actual.endpoints[0].locationId) {
    assert.equal(expected.evidence, "reciprocal-navigation-portal"); expected.endpoints.reverse();
    expected.sourcePortalIds.reverse(); expected.sourcePortalInstanceIds.reverse();
    [expected.sourceToTargetDistance, expected.targetToSourceDistance] = [expected.targetToSourceDistance, expected.sourceToTargetDistance];
  }
  assert.deepEqual(actual, expected, `Connection changed: ${connection.id}`);
}
const configFile = "src/features/map/map-config.ts";
const source = ts.createSourceFile(configFile, bytes(configFile).toString(), ts.ScriptTarget.Latest, true);
const declaration = source.statements.filter(ts.isVariableStatement).flatMap((statement) => statement.declarationList.declarations)
  .find((node) => ts.isIdentifier(node.name) && node.name.text === "MAP_CONNECTIONS"); assert(declaration);
const literal = (node) => {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  assert(ts.isObjectLiteralExpression(node));
  return Object.fromEntries(node.properties.map((property) => { assert(ts.isPropertyAssignment(property));
    return [ts.isIdentifier(property.name) ? property.name.text : literal(property.name), literal(property.initializer)]; }));
};
const curated = literal(declaration.initializer), combined = [...after.connections, ...curated]; keyed(combined);
for (const connection of combined) for (const endpoint of connection.endpoints) assert(indexed.has(`${endpoint.mapId}/${endpoint.locationId}`), `Connection endpoint missing: ${connection.id}`);
const oldItems = read(oldItemsPath), items = read(itemsPath), itemIndex = keyed(items.items);
assert.deepEqual([...itemIndex.keys()], oldItems.items.map((item) => item.id));
assert.deepEqual(omit(items, ["items", "generatedAt", "stats"]), omit(oldItems, ["items", "generatedAt", "stats"]));
assert.deepEqual(omit(items.stats, ["acquisitionRecords"]), omit(oldItems.stats, ["acquisitionRecords"]));
const added = [], updated = [], retiredAcquisitions = [];
let preservedAcquisitions = 0, remappedAcquisitions = 0;
const changedScenes = new Set(report.changes.filter((row) => row.fields.includes("sceneContext")).map((row) => `${row.toMap}/${row.id}`));
for (const oldItem of oldItems.items) {
  const item = itemIndex.get(oldItem.id); assert.deepEqual(omit(item, ["acquisitions"]), omit(oldItem, ["acquisitions"]));
  const remaining = new Map();
  for (const acquisition of item.acquisitions) {
    const key = canonical(omit(acquisition, ["id"])); remaining.set(key, [...(remaining.get(key) ?? []), acquisition]);
    if (!acquisition.locationId) continue;
    const marker = markers.get(`${acquisition.mapId}/${acquisition.locationId}`); assert(marker, `Acquisition pin missing: ${item.id}/${acquisition.locationId}`);
    assert.equal(acquisition.mapName, metadata.get(acquisition.mapId).displayName);
    assert.equal(acquisition.region, marker.region || undefined);
  }
  for (const acquisition of oldItem.acquisitions) {
    const oldKey = `${acquisition.mapId}/${acquisition.locationId}`, move = moveById.get(oldKey);
    if (retired.has(oldKey)) { retiredAcquisitions.push({ itemId: item.id, acquisition }); continue; }
    const expected = omit(acquisition, ["id"]);
    if (move) {
      expected.mapId = move.toMap; expected.mapName = metadata.get(move.toMap).displayName;
      expected.region = markers.get(`${move.toMap}/${acquisition.locationId}`).region; remappedAcquisitions++;
    }
    const key = `${expected.mapId}/${expected.locationId}`;
    if (changedScenes.has(key)) {
      const entity = entities.get(key), profile = profiles.get(entity.sceneContext.id); assert(profile);
      if (profile.localizedTitles) Object.assign(expected, { source: profile.localizedTitles.en, localizedSources: profile.localizedTitles });
      if (entity.deathLoot && ["drop", "pickpocket", "random-loot"].includes(expected.kind)) {
        const conditions = profile.lootAvailability; assert.deepEqual(entity.deathLoot.availability.localizedConditions, conditions);
        Object.assign(expected, { certainty: "story", detail: conditions.en, localizedDetails: conditions,
          locationDetail: conditions.en, localizedLocationDetails: conditions });
      }
    }
    const matches = remaining.get(canonical(expected)); assert(matches?.length, `Old acquisition unexpectedly lost/changed: ${item.id}/${oldKey}/${acquisition.kind}`); matches.pop();
    if (equal(expected, omit(acquisition, ["id"]))) preservedAcquisitions++;
    else updated.push({ itemId: item.id, before: acquisition, after: expected });
  }
  for (const acquisition of [...remaining.values()].flat()) {
    const entity = entities.get(`${acquisition.mapId}/${acquisition.locationId}`), profile = profiles.get(entity?.sceneContext?.id);
    assert(profile && profile.characterContentId === acquisition.sourceId, `Unbound new acquisition: ${item.id}/${acquisition.locationId}`);
    assert.equal(acquisition.certainty, "story");
    added.push({ itemId: item.id, acquisition, profileId: profile.id });
  }
}
assert.equal(oldItems.stats.acquisitionRecords, oldItems.items.reduce((sum, item) => sum + item.acquisitions.length, 0));
assert.equal(items.stats.acquisitionRecords, items.items.reduce((sum, item) => sum + item.acquisitions.length, 0));
assert.equal(items.stats.acquisitionRecords, oldItems.stats.acquisitionRecords - retiredAcquisitions.length + added.length);
// This report explicitly leaves the new routes' individual source/method/item
// derivation open. Do not mistake exact scene binding for acquisition proof.
const markerAudit = read(markerAuditPath); assert.equal(markerAudit.placementStageRoot, proof.stage);
assert.deepEqual([...markerAudit.placementStageMaps].sort(), [...manifest.maps].sort());
assert.equal(markerAudit.stats.auditedMaps, manifest.maps.length); assert.equal(markerAudit.stats.publishedMarkers, indexed.size);
for (const field of ["transparentPublishedMarkers", "distantPublishedMarkers", "actionableRejectedCandidates", "routingViolations", "unreviewedAdjustments"]) assert.equal(markerAudit.stats[field], 0);
bytes(import.meta.filename); bytes("scripts/build-map-search-index.mjs"); bytes("scripts/build-item-database.mjs"); bytes("scripts/audit-map-marker-placement.mjs");
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const result = { kind: "reconciled-map-consumer-conservation-review", proofPath, indexPath, itemsPath, markerAuditPath,
  stats: { maps: metadata.size, indexedAppearances: indexed.size, uncertainNameGroups: after.relationships.length,
    preservedNativeConnections: connections.size, movedConnections, retainedCuratedConnections: curated.length,
    preservedItems: itemIndex.size, previousAcquisitions: oldItems.stats.acquisitionRecords, currentAcquisitions: items.stats.acquisitionRecords,
    identicalAcquisitions: preservedAcquisitions, updatedAcquisitions: updated.length, remappedAcquisitions,
    retiredFalseAppearanceAcquisitions: retiredAcquisitions.length, newSceneAcquisitionsPendingSourceReview: added.length },
  indexChanges, updated, retiredAcquisitions, pendingNewAcquisitions: added, markerStats: markerAudit.stats,
  hashes, errors: [], requiresNewAcquisitionSourceAudit: added.length > 0,
  scope: "Every actual index pin/group and previous native connection preserved or source-audited remapped. Curated endpoints exist; prior curated direction semantics not reapproved. Every item fact and old acquisition retained except the false appearance, with exact scene conditions/name changes. New acquisition scene bindings verified but individual new item/method/source completeness still pending. No live publication or full-goal approval." };
writeGeneratedFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ stats: result.stats, hashes: Object.keys(hashes).length, errors: [], requiresNewAcquisitionSourceAudit: result.requiresNewAcquisitionSourceAudit }));
