import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import sharp from "sharp";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Inspect completed real documents. Do not import their producer, routing,
// scene decorator, floor selector or coordinate projection implementation.
assert.equal(process.argv.length, 4, "Usage: audit-canonical-map-reconciliation.mjs <stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [stage, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outputRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outputRelative && !outputRelative.startsWith("..") && !path.isAbsolute(outputRelative) && !fs.existsSync(output));
const hashes = {};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  const key = path.relative(root, absolute).replaceAll("\\", "/"), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash, `Input changed during audit: ${key}`);
  hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const verify = (entries, directory = root) => {
  assert(Object.keys(entries ?? {}).length);
  for (const [file, expected] of Object.entries(entries)) assert.equal(digest(bytes(path.resolve(directory, file))), expected, `Stale input: ${file}`);
};
const keyed = (rows) => {
  const index = new Map(rows.map((row) => [row.id, row]));
  assert.equal(index.size, rows.length); assert(!index.has(undefined)); return index;
};
const sorted = (rows) => rows.map((row) => JSON.stringify(row)).sort();
const omit = (value, fields) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
const manifest = read(path.join(stage, "stage-manifest.json"));
assert.equal(manifest.kind, "reconciled-placement-review-stage");
assert(!manifest.compositionReport && !manifest.composedFrom, "Raw composition must not masquerade as this stage's producer");
const report = read(manifest.conservationAuditPath);
assert.equal(report.kind, "canonical-map-reconciliation-review"); assert.deepEqual(report.errors, []);
assert.equal(report.raw, manifest.sourceStageRoot); assert.equal(report.canonical, manifest.canonicalRoot);
verify(manifest.hashes); verify(manifest.outputHashes, stage);
assert.deepEqual(report.outputHashes, manifest.outputHashes); verify(report.hashes);
const previous = read(path.join(manifest.canonicalRoot, "stage-manifest.json"));
verify(previous.outputHashes, manifest.canonicalRoot);
const config = read(manifest.configPath), definitions = keyed(config.maps);
assert.deepEqual([...manifest.maps].sort(), [...definitions.keys()].sort());
assert(previous.maps.every((id) => definitions.has(id)));
const profiles = read(manifest.sceneContentPath); verify(profiles.hashes);
const sceneIndex = keyed(profiles.profiles);
const bindings = read(report.bindingPath); verify(bindings.hashes); assert.deepEqual(bindings.errors, []);
const parents = new Map(config.maps.map(({ id }) => [id, []]));
for (const map of config.maps) for (const child of map.supersededBy ?? []) {
  assert(parents.has(child)); parents.get(child).push(map.id);
}
const ancestors = new Map();
for (const { id } of config.maps) {
  const queue = [...parents.get(id)], found = new Set();
  while (queue.length) {
    const current = queue.pop(); assert.notEqual(current, id, `Cyclic map hierarchy: ${id}`);
    if (found.has(current)) continue;
    found.add(current); queue.push(...parents.get(current));
  }
  ancestors.set(id, found);
}
const load = (directory, id) => {
  const content = read(path.join(directory, `public/maps/${id}/content.json`));
  const locations = read(path.join(directory, `public/maps/${id}/locations.json`));
  const placement = read(path.join(directory, `map-sources/catalog/${id}-placements.json`));
  const entities = keyed(content.entities), markers = keyed(locations.locations), candidates = keyed(placement.candidates);
  assert.deepEqual([...entities.keys()].sort(), [...markers.keys()].sort());
  assert.deepEqual([...entities.keys()].sort(), [...candidates.keys()].sort());
  for (const marker of markers.values()) {
    assert.equal(marker.contentId, marker.id);
    assert.deepEqual(candidates.get(marker.id).mapPosition, { x: marker.x, y: marker.y });
  }
  return { content, locations, placement, entities, markers, candidates };
};
const old = new Map(previous.maps.map((id) => [id, load(manifest.canonicalRoot, id)]));
const raw = new Map(manifest.maps.map((id) => [id, load(manifest.sourceStageRoot, id)]));
const actual = new Map(manifest.maps.map((id) => [id, load(stage, id)]));
const collect = (documents) => {
  const result = new Map();
  for (const [mapId, document] of documents) for (const entity of document.entities.values()) {
    const rows = result.get(entity.id) ?? []; rows.push({ mapId, entity }); result.set(entity.id, rows);
  }
  return result;
};
const rawById = collect(raw), oldById = collect(old), actualById = collect(actual);
const removed = new Map(), removedRows = [], linkRemovals = [];
for (const [mapId, document] of raw) {
  const ids = new Set();
  for (const entity of document.entities.values()) {
    const children = rawById.get(entity.id).filter((row) => ancestors.get(row.mapId).has(mapId));
    for (const child of children) for (const field of ["worldPosition", "templateId", "statsId"]) assert.deepEqual(child.entity[field], entity[field]);
    if (children.length) ids.add(entity.id);
  }
  removed.set(mapId, ids);
}
const available = new Set([...raw].flatMap(([mapId, document]) => [...document.entities.keys()].filter((id) => !removed.get(mapId).has(id))));
assert.deepEqual([...available].sort(), [...rawById.keys()].sort());
assert.deepEqual([...actualById.keys()].sort(), [...available].sort());
const oldFor = (mapId, id) => {
  const matches = (oldById.get(id) ?? []).filter((row) => row.mapId === mapId || ancestors.get(mapId).has(row.mapId));
  assert(matches.length <= 1, `Ambiguous old appearance: ${mapId}/${id}`); return matches[0];
};
let restoredSearchTerms = 0;
for (const [mapId, source] of raw) {
  const current = actual.get(mapId), removedHere = removed.get(mapId);
  for (const id of removedHere) removedRows.push({ mapId, id,
    retainedOnMaps: rawById.get(id).filter((row) => ancestors.get(row.mapId).has(mapId) && !removed.get(row.mapId).has(id)).map((row) => row.mapId).sort(),
    worldPosition: source.entities.get(id).worldPosition });
  const expectedContent = structuredClone(source.content);
  expectedContent.entities = expectedContent.entities.filter(({ id }) => !removedHere.has(id));
  for (const entity of expectedContent.entities) for (const field of ["access", "puzzleCombinations", "mechanism"]) {
    if (!entity[field]?.related) continue;
    entity[field].related = entity[field].related.filter((link) => {
      if (available.has(link.contentId)) return true;
      linkRemovals.push({ mapId, id: entity.id, field: `${field}.related`, reason: "unavailable-target", link }); return false;
    });
  }
  if (expectedContent.relationships) expectedContent.relationships = expectedContent.relationships.filter((link) => {
    const reason = removedHere.has(link.fromId) ? "superseded-source" : !available.has(link.fromId) || !available.has(link.toId) ? "unavailable-endpoint" : null;
    if (!reason) return true;
    linkRemovals.push({ mapId, field: "relationships", reason, link }); return false;
  });
  assert.deepEqual(current.content, expectedContent, `Unexpected content change: ${mapId}`);
  const expectedMarkers = structuredClone(source.locations);
  expectedMarkers.locations = expectedMarkers.locations.filter(({ id }) => !removedHere.has(id));
  for (const marker of expectedMarkers.locations) {
    const previousAppearance = oldFor(mapId, marker.id); if (!previousAppearance) continue;
    const prior = old.get(previousAppearance.mapId).markers.get(marker.id);
    assert.deepEqual([...(prior.categoryFacets ?? [])].sort(), [...(marker.categoryFacets ?? [])].sort());
    if (prior.categoryFacets) marker.categoryFacets = prior.categoryFacets;
    restoredSearchTerms += (prior.searchTerms ?? []).filter((term) => !marker.searchTerms?.includes(term)).length;
    if (prior.searchTerms || marker.searchTerms) marker.searchTerms = [...(prior.searchTerms ?? []), ...new Set((marker.searchTerms ?? []).filter((term) => !prior.searchTerms?.includes(term)))];
  }
  assert.deepEqual(current.locations, expectedMarkers, `Unexpected marker change: ${mapId}`);
  const expectedCandidates = source.placement.candidates.filter(({ id }) => !removedHere.has(id));
  assert.deepEqual(current.placement, { ...source.placement, stats: { ...source.placement.stats, candidates: expectedCandidates.length }, candidates: expectedCandidates });
  const rejection = `map-sources/catalog/${mapId}-placement-rejections.json`, metadata = `public/maps/${mapId}/metadata.json`;
  assert(bytes(path.join(stage, rejection)).equals(bytes(path.join(manifest.sourceStageRoot, rejection))));
  assert(bytes(path.join(stage, metadata)).equals(bytes(path.join(old.has(mapId) ? manifest.canonicalRoot : root, metadata))));
}
assert.deepEqual(sorted(removedRows), sorted(report.routing.removedAppearances.map((row) => ({ ...row, retainedOnMaps: [...row.retainedOnMaps].sort() }))));
assert.deepEqual(sorted(linkRemovals), sorted(report.routing.removedLinks));
const retainedLinks = new Set([...actual.values()].flatMap((document) => document.content.relationships ?? []).map((link) => JSON.stringify(link)));
for (const documents of [raw, old]) for (const document of documents.values()) for (const link of document.content.relationships ?? []) {
  if (available.has(link.fromId) && available.has(link.toId)) assert(retainedLinks.has(JSON.stringify(link)), `Lost retained relationship: ${link.id}`);
}
const nativeFiles = new Map();
const objectFor = (reference) => {
  if (!nativeFiles.has(reference.sourcePath)) nativeFiles.set(reference.sourcePath, read(reference.sourcePath).save.regions.Templates.GameObjects);
  const matches = nativeFiles.get(reference.sourcePath).filter((row) => row.MapKey?.value === reference.objectId);
  assert.equal(matches.length, 1); return matches[0];
};
const sourceEquivalentEquipment = (before, after) => {
  assert.deepEqual(omit(before, ["inventoryReferences"]), omit(after, ["inventoryReferences"]));
  const canonicalReferences = (equipment) => [...new Set(equipment.inventoryReferences.map((reference) => {
    const object = objectFor(reference), item = (object.ItemList ?? []).flatMap((list) => list.Item ?? [])[reference.index];
    assert(item); assert.equal(reference.itemName, item.ItemName?.value ?? ""); assert.equal(reference.templateId, item.TemplateID?.value?.toLowerCase() ?? "");
    assert.equal(reference.itemObjectId, item.UUID?.value ?? ""); assert.equal(reference.droppedOnDeath, item.IsDroppedOnDeath?.value);
    return JSON.stringify(omit(reference, ["sourcePath"]));
  }))].sort();
  assert.deepEqual(canonicalReferences(before), canonicalReferences(after));
  const objects = new Map();
  for (const reference of [...before.inventoryReferences, ...after.inventoryReferences]) {
    const object = objectFor(reference);
    if (objects.has(reference.objectId)) assert.deepEqual(objects.get(reference.objectId), object);
    objects.set(reference.objectId, object);
  }
};
const moves = [], retired = [], additions = [], entityChanges = [], markerChanges = [], candidateChanges = [];
const differing = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !equal(a[key], b[key]));
const allowedEntity = new Set(["storyDestination", "authoredEquipment", "title", "localizedTitles", "iconId", "deathLoot", "provenance", "sceneContext"]);
for (const [mapId, document] of old) for (const entity of document.entities.values()) {
  const destinations = (actualById.get(entity.id) ?? []).filter((row) => row.mapId === mapId || ancestors.get(row.mapId).has(mapId));
  if (!destinations.length) {
    assert(!actualById.has(entity.id));
    const proof = bindings.affectedAppearances.find((row) => row.mapId === mapId && row.id === entity.id && row.selectedRelationRemoved);
    assert(proof && proof.relations.some((id) => bindings.removals.some((row) => row.id === id && !row.proofs.length && row.contradictions.length)));
    retired.push({ mapId, id: entity.id }); continue;
  }
  assert.equal(destinations.length, 1);
  const destination = destinations[0], current = actual.get(destination.mapId), changed = differing(entity, destination.entity);
  assert(changed.every((field) => allowedEntity.has(field)), `Unreviewed old gameplay change: ${mapId}/${entity.id}/${changed}`);
  if (changed.includes("authoredEquipment")) sourceEquivalentEquipment(entity.authoredEquipment, destination.entity.authoredEquipment);
  if (changed.some((field) => !["storyDestination", "authoredEquipment", "provenance"].includes(field))) {
    const profile = sceneIndex.get(destination.entity.sceneContext?.id);
    assert(profile && profile.characterContentId === destination.entity.storyDestination.characterContentId && profile.anchorContentId === destination.entity.storyDestination.anchorContentId);
  }
  if (changed.length) entityChanges.push({ fromMap: mapId, toMap: destination.mapId, id: entity.id, fields: changed });
  const oldMarker = document.markers.get(entity.id), marker = current.markers.get(entity.id);
  const markerFields = differing(oldMarker, marker), candidateFields = differing(document.candidates.get(entity.id), current.candidates.get(entity.id));
  assert(markerFields.every((field) => ["name", "title", "localizedTitles", "searchTerms", "region", "regionId", "x", "y"].includes(field)));
  assert(candidateFields.every((field) => ["mapPosition", "storyDestination", "provenance", "sceneContent", "reviewedPresentation"].includes(field)), `Old candidate changed: ${mapId}/${entity.id}/${candidateFields}`);
  if (candidateFields.some((field) => ["sceneContent", "reviewedPresentation"].includes(field))) {
    const candidate = current.candidates.get(entity.id), profile = sceneIndex.get(destination.entity.sceneContext?.id);
    assert(profile); assert.deepEqual(candidate.sceneContent, profile);
    assert.deepEqual(candidate.reviewedPresentation, { ...document.candidates.get(entity.id).reviewedPresentation, ...(profile.kind ? { kind: profile.kind } : {}) });
  }
  if (markerFields.length) markerChanges.push({ mapId, toMap: destination.mapId, id: entity.id, fields: markerFields });
  if (candidateFields.length) candidateChanges.push({ mapId, toMap: destination.mapId, id: entity.id, fields: candidateFields });
  if (mapId === destination.mapId) {
    assert.equal(marker.x, oldMarker.x); assert.equal(marker.y, oldMarker.y);
  } else moves.push({ fromMap: mapId, toMap: destination.mapId, id: entity.id, worldPosition: entity.worldPosition });
}
for (const [mapId, document] of actual) for (const entity of document.entities.values()) {
  if (oldById.has(entity.id)) continue;
  const profile = sceneIndex.get(entity.sceneContext?.id);
  assert(profile && profile.characterContentId === entity.storyDestination?.characterContentId && profile.anchorContentId === entity.storyDestination.anchorContentId);
  assert(entity.sceneContext.evidence?.length, `New scene has no native evidence: ${mapId}/${entity.id}`);
  additions.push({ mapId, id: entity.id, profileId: profile.id, worldPosition: entity.worldPosition });
}
const volumes = read(config.floorVolumes ?? "map-sources/catalog/floor-volumes.json");
const contains = (volume, point) => {
  if (!point || point.y < volume.minHeight || point.y >= volume.maxHeight) return false;
  let winding = 0;
  for (let i = 0; i < volume.polygon.length; i++) {
    const a = volume.polygon[i], b = volume.polygon[(i + 1) % volume.polygon.length];
    const cross = (b.x - a.x) * (point.z - a.z) - (point.x - a.x) * (b.z - a.z);
    if (Math.abs(cross) < 1e-8 && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) && point.z >= Math.min(a.z, b.z) && point.z <= Math.max(a.z, b.z)) return true;
    if (a.z <= point.z && b.z > point.z && cross > 0) winding++;
    if (a.z > point.z && b.z <= point.z && cross < 0) winding--;
  }
  return winding !== 0;
};
const newMaps = config.maps.filter(({ id }) => !old.has(id));
const selectedFloor = (map, point) => {
  const selection = map.floorVolumeSelection;
  const entries = volumes.entries.filter((entry) => entry.mapId === selection.mapId && entry.status === "resolved-native-volume");
  const selected = entries.filter(({ volume }) => selection.patchIds.includes(volume.id));
  assert.equal(selected.length, selection.patchIds.length);
  const buildings = new Set(selected.map(({ volume }) => volume.buildingId));
  const hits = entries.map(({ volume }) => volume).filter((volume) => buildings.has(volume.buildingId) && contains(volume, point))
    .sort((a, b) => b.minHeight - a.minHeight || a.id.localeCompare(b.id, "en"));
  return selection.patchIds.includes(hits[0]?.id);
};
let floorAppearances = 0;
const floorCounts = [];
for (const map of newMaps) {
  const current = actual.get(map.id), metadata = read(path.join(stage, `public/maps/${map.id}/metadata.json`));
  const { worldBounds: world, imageBounds: image, flipY } = metadata.coordinateReference;
  const { data, info } = await sharp(bytes(`public/maps/${map.id}/overview.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const entity of current.entities.values()) {
    const marker = current.markers.get(entity.id), candidate = current.candidates.get(entity.id);
    assert(selectedFloor(map, candidate.navigationPortal?.sourcePosition ?? entity.worldPosition), `Wrong native floor: ${map.id}/${entity.id}`);
    const u = (entity.worldPosition.x - world.x) / world.width, v = (entity.worldPosition.z - world.y) / world.height;
    const projected = { x: image.x + u * image.width, y: image.y + (flipY ? 1 - v : v) * image.height };
    assert(!candidate.mapPositionAdjustment, `Unreviewed new floor display adjustment: ${map.id}/${entity.id}`);
    assert(Math.abs(marker.x - projected.x) <= 0.001 && Math.abs(marker.y - projected.y) <= 0.001, `Wrong projection: ${map.id}/${entity.id}`);
    const x = Math.round((marker.x - image.x) / image.width * (info.width - 1)), y = Math.round((marker.y - image.y) / image.height * (info.height - 1));
    assert(x >= 0 && y >= 0 && x < info.width && y < info.height && data[(y * info.width + x) * info.channels + 3] > 16, `Transparent floor pin: ${map.id}/${entity.id}`);
    floorAppearances++;
  }
  floorCounts.push({ mapId: map.id, appearances: current.entities.size });
}
// Check all original parent occupants, not only the producer's selected moves.
for (const parentId of new Set(newMaps.map((map) => map.floorVolumeSelection.mapId))) {
  for (const entity of old.get(parentId).entities.values()) {
    const candidate = old.get(parentId).candidates.get(entity.id), point = candidate.navigationPortal?.sourcePosition ?? entity.worldPosition;
    const destinations = newMaps.filter((map) => map.floorVolumeSelection.mapId === parentId && selectedFloor(map, point));
    assert(destinations.length <= 1);
    if (destinations.length) {
      assert(actual.get(destinations[0].id).entities.has(entity.id), `Missed floor occupant: ${parentId}/${entity.id}`);
      assert(!actual.get(parentId).entities.has(entity.id));
    } else assert(!moves.some((row) => row.fromMap === parentId && row.id === entity.id), `Unexpected moved occupant: ${parentId}/${entity.id}`);
  }
}
assert.deepEqual(sorted(moves), sorted(report.moves)); assert.deepEqual(sorted(additions), sorted(report.additions));
assert.deepEqual(sorted(retired), sorted(report.retirements.map(({ mapId, id }) => ({ mapId, id }))));
assert.deepEqual(sorted(entityChanges), sorted(report.changes));
const count = (documents) => [...documents.values()].reduce((sum, document) => sum + document.entities.size, 0);
const stats = { maps: actual.size, appearances: count(actual), identities: actualById.size, relocatedAppearances: moves.length,
  newIdentityAppearances: additions.length, retiredFalseAppearances: retired.length, suppressedParentCopies: removedRows.length,
  sceneProfiles: sceneIndex.size, restoredSearchTerms };
assert.equal(stats.appearances, count(old) + additions.length - retired.length); assert.deepEqual(stats, report.stats);
assert.deepEqual(stats, manifest.stats); assert.equal(Object.keys(manifest.outputHashes).length, actual.size * 5);
bytes(import.meta.filename);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const result = { kind: "independent-canonical-map-reconciliation-audit", stage, stats,
  geometry: { newMaps: newMaps.length, floorAppearances, floorCounts, transparentFloorPins: 0, missedOldFloorOccupants: 0 },
  entityChanges, markerChanges, candidateChanges, retired, hashes, errors: [],
  scope: "Actual full raw-to-routed and old-to-new conservation, independent ancestor routing, native inventory citation equivalence, five new floor winding/height/projection/silhouette checks. No tests or manual application checks. Does not prove all native rooms/scenes, all-map image fidelity, final index/items, saved-state migration, atlas integration or publication readiness." };
writeGeneratedFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ stats, geometry: result.geometry, hashes: Object.keys(hashes).length, errors: [] }));
