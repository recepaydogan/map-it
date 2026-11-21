import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Review real generated records across an expanded map set. This survey does
// not modify, finalize or approve raw content. Its descendant projection is
// independent of the production routing helper.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 6, "Usage: audit-expanded-placement-delta.mjs <canonical> <full-raw> <binding-audit> <fresh-report>");
const [canonical, raw, sourceAuditPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outputRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outputRelative && !outputRelative.startsWith("..") && !path.isAbsolute(outputRelative) && !fs.existsSync(output), "Use a fresh audit report");
const hashes = {}, errors = [];
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), name = relative(absolute), hash = digest(data);
  assert(!hashes[name] || hashes[name] === hash, `Input changed: ${name}`);
  hashes[name] = hash;
  return data;
};
const read = (file) => JSON.parse(bytes(file));
const check = (condition, message) => { if (!condition) errors.push(message); };
const keyed = (rows, label) => {
  const result = new Map(rows.map((row) => [row.id, row]));
  assert(result.size === rows.length && !result.has(undefined), `Duplicate/missing ${label} identity`);
  return result;
};
const oldManifest = read(path.join(canonical, "stage-manifest.json")), manifest = read(path.join(raw, "stage-manifest.json"));
assert.equal(manifest.kind, "unfinalized-placement-stage");
assert.equal(manifest.storyDestinationRouting, "superseding-map-first");
assert.equal(manifest.previousStageRoot, canonical);
const sourceAudit = read(sourceAuditPath);
assert.equal(sourceAudit.kind, "story-binding-delta-audit");
assert.deepEqual(sourceAudit.errors, []);
assert.equal(sourceAudit.canonical, canonical);
assert.equal(sourceAudit.beforePath, oldManifest.storyLocationsPath);
for (const [file, expected] of Object.entries(sourceAudit.hashes)) assert.equal(digest(bytes(file)), expected, `Stale binding proof: ${file}`);
let composition = null;
if (sourceAudit.afterPath !== manifest.storyLocationsPath) {
  assert.equal(manifest.compositionReport, "composition-report.json", "A later source requires a verified regional composition");
  composition = read(path.join(raw, manifest.compositionReport));
  assert.equal(composition.kind, "raw-placement-checkpoint-composition");
  assert.equal(composition.inputs.length, 2);
  assert.deepEqual(manifest.composedFrom, composition.inputs);
  const upgrade = read(composition.sourceUpgradePath);
  assert.equal(upgrade.kind, "regional-placement-source-upgrade-audit");
  assert.deepEqual(upgrade.errors, []);
  assert.equal(upgrade.baseRoot, composition.inputs[0]);
  assert.equal(upgrade.overlayRoot, composition.inputs[1]);
  assert.equal(upgrade.contracts.storyLocationsPath.before, sourceAudit.afterPath);
  assert.equal(upgrade.contracts.storyLocationsPath.after, manifest.storyLocationsPath);
  assert.equal(upgrade.contracts.sceneContentPath.after, manifest.sceneContentPath);
  for (const proof of [composition, upgrade]) for (const [file, expected] of Object.entries(proof.hashes)) {
    assert.equal(digest(bytes(file)), expected, `Stale source composition proof: ${file}`);
  }
  const owners = new Map(composition.maps.map(({ mapId, sourceStage }) => [mapId, sourceStage]));
  assert.equal(owners.size, manifest.maps.length);
  for (const id of manifest.maps) assert.equal(owners.get(id),
    upgrade.overlayMaps.includes(id) ? upgrade.overlayRoot : upgrade.baseRoot, `Wrong source owner: ${id}`);
  // Independently compare actual composed bytes against the owning stage,
  // rather than accepting the composer's claimed output hashes alone.
  for (const [file, expected] of Object.entries(composition.outputHashes)) {
    const data = bytes(path.join(raw, file));
    assert.equal(digest(data), expected, `Changed composed artifact: ${file}`);
    const mapId = file.match(/^public\/maps\/([^/]+)\//)?.[1]
      ?? file.match(/^map-sources\/catalog\/(.+?)-(?:placements|placement-rejections)\.json$/)?.[1];
    assert(owners.has(mapId), `Unknown composed artifact: ${file}`);
    assert(data.equals(bytes(path.join(owners.get(mapId), file))), `Composition changed source bytes: ${file}`);
  }
  assert.equal(Object.keys(composition.outputHashes).length, manifest.maps.length * 4);
}
const config = read(manifest.configPath), definitions = keyed(config.maps, "map"), relations = read(manifest.storyLocationsPath);
assert.deepEqual([...manifest.maps].sort(), [...definitions.keys()].sort());
assert(oldManifest.maps.every((id) => definitions.has(id)), "Existing map removed from configuration");
const descendants = new Map();
const childrenOf = (id, trail = new Set()) => {
  assert(!trail.has(id), `Cyclic map family: ${id}`);
  if (descendants.has(id)) return descendants.get(id);
  assert(definitions.has(id), `Unknown map: ${id}`);
  const next = new Set([...trail, id]), result = new Set();
  for (const child of definitions.get(id).supersededBy ?? []) {
    result.add(child);
    for (const nested of childrenOf(child, next)) result.add(nested);
  }
  descendants.set(id, result);
  return result;
};
for (const id of definitions.keys()) childrenOf(id);
const load = (directory, id, accepted = false) => {
  const filenames = { content: `public/maps/${id}/content.json`, markers: `public/maps/${id}/locations.json`,
    placement: `map-sources/catalog/${id}-placements.json`, rejections: `map-sources/catalog/${id}-placement-rejections.json` };
  const result = {};
  for (const [field, file] of Object.entries(filenames)) {
    const data = bytes(path.join(directory, file));
    if (accepted) assert.equal(digest(data), oldManifest.outputHashes[file], `Changed accepted artifact: ${file}`);
    result[field] = JSON.parse(data);
  }
  result.entities = keyed(result.content.entities, `${id} entity`);
  result.locations = keyed(result.markers.locations, `${id} marker`);
  result.candidates = keyed(result.placement.candidates, `${id} candidate`);
  assert.deepEqual([...result.entities.keys()].sort(), [...result.locations.keys()].sort(), `Entity/marker mismatch: ${id}`);
  assert.deepEqual([...result.entities.keys()].sort(), [...result.candidates.keys()].sort(), `Entity/candidate mismatch: ${id}`);
  for (const [key, marker] of result.locations) assert.equal(marker.contentId, key);
  return result;
};
const before = new Map(oldManifest.maps.map((id) => [id, load(canonical, id, true)]));
const after = new Map(manifest.maps.map((id) => [id, load(raw, id)]));
const suppressed = [], surviving = new Map();
for (const [mapId, document] of after) {
  const retained = new Map();
  for (const [id, entity] of document.entities) {
    const childCopies = [...childrenOf(mapId)].filter((child) => after.get(child).entities.has(id));
    for (const child of childCopies) {
      const copy = after.get(child).entities.get(id);
      check(equal(entity.worldPosition, copy.worldPosition) && entity.templateId === copy.templateId && entity.statsId === copy.statsId,
        `Native identity differs across parent/child: ${mapId}/${child}/${id}`);
    }
    if (childCopies.length) suppressed.push({ mapId, id, childCopies });
    else retained.set(id, entity);
  }
  surviving.set(mapId, retained);
}
const collect = (maps) => {
  const result = new Map();
  for (const [mapId, entities] of maps) for (const [id, entity] of entities) {
    if (!result.has(id)) result.set(id, []);
    result.get(id).push({ mapId, entity });
  }
  return result;
};
const oldById = collect(new Map([...before].map(([id, document]) => [id, document.entities]))), newById = collect(surviving);
const differences = (old, next) => [...new Set([...Object.keys(old), ...Object.keys(next)])]
  .filter((field) => !equal(old[field], next[field]));
const changes = [], relocations = [], losses = [], addedAppearances = [], addedIdentities = [], anchorChanges = [];
const selectedRemoved = new Map(sourceAudit.affectedAppearances.filter(({ selectedRelationRemoved }) => selectedRelationRemoved)
  .map((row) => [`${row.mapId}/${row.id}`, row]));
let unchangedEntities = 0;
for (const [mapId, document] of before) for (const [id, entity] of document.entities) {
  const present = surviving.get(mapId).get(id);
  const alternatives = newById.get(id) ?? [];
  const targets = present ? [{ mapId, entity: present }] : alternatives.filter((row) => childrenOf(mapId).has(row.mapId));
  if (targets.length !== 1) {
    const explained = selectedRemoved.get(`${mapId}/${id}`);
    losses.push({ mapId, id, title: entity.title, stillPresentOn: alternatives.map((row) => row.mapId),
      sourceContradiction: explained?.relations ?? [], entity });
    check(Boolean(explained) && alternatives.length === 0, `Unexplained missing/ambiguous previous appearance: ${mapId}/${id}`);
    continue;
  }
  const target = targets[0], newDocument = after.get(target.mapId);
  if (target.mapId !== mapId) relocations.push({ fromMap: mapId, toMap: target.mapId, id, title: entity.title,
    beforePosition: entity.worldPosition, afterPosition: target.entity.worldPosition });
  const entityFields = differences(entity, target.entity), markerFields = differences(document.locations.get(id), newDocument.locations.get(id)),
    candidateFields = differences(document.candidates.get(id), newDocument.candidates.get(id));
  check(equal(entity.worldPosition, target.entity.worldPosition), `Existing native world position changed: ${mapId}/${id}`);
  if (!entityFields.length) unchangedEntities++;
  if (entityFields.length || markerFields.length || candidateFields.length) changes.push({ fromMap: mapId, toMap: target.mapId, id, title: entity.title,
    entityFields, markerFields, candidateFields,
    entityDifferences: Object.fromEntries(entityFields.map((field) => [field, { before: entity[field], after: target.entity[field] }])),
    markerDifferences: Object.fromEntries(markerFields.map((field) => [field, { before: document.locations.get(id)[field], after: newDocument.locations.get(id)[field] }])),
    candidateDifferences: Object.fromEntries(candidateFields.map((field) => [field, { before: document.candidates.get(id)[field], after: newDocument.candidates.get(id)[field] }])) });
  if (entity.storyDestination && !equal(entity.storyDestination, target.entity.storyDestination)) anchorChanges.push({ mapId: target.mapId, id,
    previous: entity.storyDestination, current: target.entity.storyDestination });
}
const relationIndex = new Map(relations.scriptedDestinations.map((row) => [row.id, row]));
for (const [mapId, entities] of surviving) for (const [id, entity] of entities) {
  if (before.get(mapId)?.entities.has(id)) continue;
  const nativeExisting = oldById.get(id), profile = entity.storyDestination;
  const supporting = profile ? profile.kinds.map((kind) => relationIndex.get(`${profile.characterContentId}:${kind}:${profile.anchorContentId}`)).filter(Boolean) : [];
  const row = { mapId, id, title: entity.title, kind: entity.kind, worldPosition: entity.worldPosition,
    previousMaps: nativeExisting?.map((entry) => entry.mapId) ?? [], sourceRelations: supporting.map((relation) => relation.id),
    storyDestination: profile, provenance: entity.provenance };
  addedAppearances.push(row);
  if (!nativeExisting) {
    addedIdentities.push(row);
    if (profile) check(supporting.length > 0, `New scripted identity lacks current source: ${mapId}/${id}`);
  }
}
const allLinks = (documents, entries) => {
  const result = new Map();
  for (const [mapId, document] of documents) for (const link of document.content.relationships ?? []) {
    if (entries && !entries.get(mapId).has(link.fromId)) continue;
    const serialized = JSON.stringify(link);
    if (!result.has(serialized)) result.set(serialized, { link, mapIds: [] });
    result.get(serialized).mapIds.push(mapId);
  }
  return result;
};
const oldLinks = allLinks(before), nextLinks = allLinks(after, surviving);
const relationshipChanges = { removed: [...oldLinks].filter(([key]) => !nextLinks.has(key)).map(([, value]) => value),
  added: [...nextLinks].filter(([key]) => !oldLinks.has(key)).map(([, value]) => value) };
const entityFieldCounts = {}, markerFieldCounts = {}, candidateFieldCounts = {};
for (const change of changes) for (const [field, counts] of [["entityFields", entityFieldCounts], ["markerFields", markerFieldCounts], ["candidateFields", candidateFieldCounts]]) {
  for (const name of change[field]) counts[name] = (counts[name] ?? 0) + 1;
}
for (const [mapId, document] of before) {
  const current = after.get(mapId);
  check(equal(document.content.map, current.content.map), `Existing content map metadata changed: ${mapId}`);
}
bytes(import.meta.filename);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Changed survey input: ${file}`);
const stats = { beforeMaps: before.size, afterMaps: after.size,
  beforeAppearances: [...before.values()].reduce((sum, document) => sum + document.entities.size, 0),
  rawAppearances: [...after.values()].reduce((sum, document) => sum + document.entities.size, 0),
  projectedAppearances: [...surviving.values()].reduce((sum, entities) => sum + entities.size, 0),
  beforeIdentities: oldById.size, projectedIdentities: newById.size, suppressedParentCopies: suppressed.length,
  relocatedAppearances: relocations.length, missingPreviousAppearances: losses.length,
  newIdentityAppearances: addedIdentities.length, addedDistinctIds: new Set(addedIdentities.map(({ id }) => id)).size,
  unchangedExistingEntities: unchangedEntities, existingEntityChanges: changes.filter(({ entityFields }) => entityFields.length).length,
  entityFieldCounts, markerFieldCounts, candidateFieldCounts,
  removedRelationships: relationshipChanges.removed.length, addedRelationships: relationshipChanges.added.length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "expanded-placement-delta-survey", canonical, raw, sourceAuditPath, stats,
  changes, relocations, losses, addedAppearances, addedIdentities, anchorChanges, relationshipChanges, suppressed, hashes, errors,
  scope: "Complete generated-versus-canonical record differences and independent descendant projection. This is a review queue, not source/scene-content approval, a canonical composition or a publication gate. Every differing gameplay field and relationship must be explained or preserved separately." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
