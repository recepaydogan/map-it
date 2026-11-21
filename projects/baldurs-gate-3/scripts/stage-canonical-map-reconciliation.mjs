import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { finalizePlacementRouting } from "./lib/placement-routing.mjs";
import { readVerifiedSceneContentCatalog } from "./lib/scene-content-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Reconcile actual full stages without overwriting either input or published data.
// The output still requires independent geometry, navigation and item audits.
assert.equal(process.argv.length, 7,
  "Usage: stage-canonical-map-reconciliation.mjs <canonical> <full-raw> <raw-record-audit> <binding-audit> <fresh-stage>");
const root = path.resolve(import.meta.dirname, "..");
const [canonical, raw, recordPath, bindingPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relativeOutput = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput) && !fs.existsSync(output));
const hashes = {}, outputHashes = {}, pending = new Map();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const serialized = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const verify = (proof) => {
  assert.deepEqual(proof.errors, []); assert(Object.keys(proof.hashes ?? {}).length);
  for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), hash, `Stale reconciliation proof: ${file}`);
};
const keyed = (rows) => { const index = new Map(rows.map((row) => [row.id, row])); assert.equal(index.size, rows.length); return index; };
const fields = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !equal(a[key], b[key]));
const nativeObjects = new Map();
const nativeObject = (file, id) => {
  if (!nativeObjects.has(file)) {
    const index = new Map();
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (value.MapKey?.value) {
        const entries = index.get(value.MapKey.value) ?? [];
        entries.push(value); index.set(value.MapKey.value, entries);
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(read(file)); nativeObjects.set(file, index);
  }
  const matches = nativeObjects.get(file).get(id) ?? [];
  assert.equal(matches.length, 1, `Ambiguous inventory source: ${file}/${id}`);
  return matches[0];
};
const baseline = read(path.join(canonical, "stage-manifest.json")), manifest = read(path.join(raw, "stage-manifest.json"));
const recordProof = read(recordPath), bindingProof = read(bindingPath); verify(recordProof); verify(bindingProof);
assert.equal(recordProof.afterRoot, raw); assert.equal(recordProof.kind, "transient-arrival-source-record-audit");
assert.equal(bindingProof.canonical, canonical); assert.equal(bindingProof.kind, "story-binding-delta-audit");
assert.equal(manifest.previousStageRoot, canonical); assert.equal(manifest.kind, "unfinalized-placement-stage");
for (const [file, hash] of Object.entries(baseline.outputHashes)) assert.equal(digest(bytes(path.join(canonical, file))), hash);
const config = read(manifest.configPath), definitions = keyed(config.maps);
assert.deepEqual([...manifest.maps].sort(), [...definitions.keys()].sort());
assert(baseline.maps.every((id) => definitions.has(id)));
const scenes = readVerifiedSceneContentCatalog(manifest.sceneContentPath, root); bytes(manifest.sceneContentPath);
for (const file of Object.keys(scenes.hashes)) bytes(file);
const profiles = keyed(scenes.profiles);
const descendants = (id) => (definitions.get(id).supersededBy ?? []).flatMap((child) => [child, ...descendants(child)]);
const files = (id) => ({ content: `public/maps/${id}/content.json`, locations: `public/maps/${id}/locations.json`,
  placement: `map-sources/catalog/${id}-placements.json`, rejections: `map-sources/catalog/${id}-placement-rejections.json` });
const load = (directory, id) => Object.fromEntries(Object.entries(files(id)).map(([key, file]) => [key, read(path.join(directory, file))]));
const previous = new Map(baseline.maps.map((id) => [id, load(canonical, id)]));
const documents = new Map(manifest.maps.map((id) => [id, load(raw, id)]));
const routing = finalizePlacementRouting(config.maps, documents);
const beforeIds = new Set([...previous.values()].flatMap((document) => document.content.entities.map(({ id }) => id)));
const all = new Map();
for (const [mapId, document] of documents) {
  document.entities = keyed(document.content.entities); document.markers = keyed(document.locations.locations);
  document.candidates = keyed(document.placement.candidates);
  assert.deepEqual([...document.entities.keys()].sort(), [...document.markers.keys()].sort());
  assert.deepEqual([...document.entities.keys()].sort(), [...document.candidates.keys()].sort());
  for (const entity of document.content.entities) {
    const matches = all.get(entity.id) ?? []; matches.push({ mapId, entity }); all.set(entity.id, matches);
  }
}
const changes = [], moves = [], retirements = [], additions = [], preservation = [];
const allowedEntityFields = new Set(["authoredEquipment", "storyDestination", "title", "localizedTitles", "iconId", "deathLoot", "provenance", "sceneContext"]);
const allowedMarkerFields = new Set(["searchTerms", "categoryFacets", "title", "localizedTitles", "name", "region", "regionId", "x", "y"]);
for (const [mapId, document] of previous) {
  const oldMarkers = keyed(document.locations.locations);
  for (const old of document.content.entities) {
    const present = documents.get(mapId).entities.get(old.id);
    const candidates = present ? [{ mapId, entity: present }] : (all.get(old.id) ?? []).filter((entry) => descendants(mapId).includes(entry.mapId));
    if (candidates.length !== 1) {
      assert.equal(candidates.length, 0); assert(!all.has(old.id));
      const explanation = bindingProof.affectedAppearances.find((row) => row.mapId === mapId && row.id === old.id && row.selectedRelationRemoved);
      assert(explanation && explanation.relations.some((id) => bindingProof.removals.some((row) => row.id === id && !row.proofs.length && row.contradictions.length)));
      retirements.push({ mapId, id: old.id, entity: old, marker: oldMarkers.get(old.id), sourceContradiction: explanation,
        publishedRetirementRequiresSavedStateMigration: true });
      continue;
    }
    const target = candidates[0], current = target.entity, targetDocument = documents.get(target.mapId);
    for (const field of ["worldPosition", "templateId", "statsId"]) assert.deepEqual(current[field], old[field]);
    const changedFields = fields(old, current);
    assert(changedFields.every((field) => allowedEntityFields.has(field)), `Unreviewed gameplay field: ${mapId}/${old.id}/${changedFields}`);
    if (changedFields.some((field) => ["title", "localizedTitles", "iconId", "deathLoot", "sceneContext"].includes(field))) {
      const profile = profiles.get(current.sceneContext?.id);
      assert(profile && profile.characterContentId === current.storyDestination.characterContentId && profile.anchorContentId === current.storyDestination.anchorContentId);
    }
    if (changedFields.includes("authoredEquipment")) {
      // Multiple extraction paths can cite the same native object. Prove the
      // complete objects agree before treating those citations as equivalent.
      const inventorySources = new Map();
      for (const reference of [...old.authoredEquipment.inventoryReferences, ...current.authoredEquipment.inventoryReferences]) {
        const object = nativeObject(reference.sourcePath, reference.objectId);
        if (inventorySources.has(reference.objectId)) assert.deepEqual(object, inventorySources.get(reference.objectId));
        inventorySources.set(reference.objectId, object);
      }
      const normalize = (equipment) => ({ ...equipment, inventoryReferences: [...new Set(equipment.inventoryReferences.map((reference) => {
        const fields = { ...reference }; delete fields.sourcePath; return JSON.stringify(fields);
      }))].sort() });
      assert.deepEqual(normalize(old.authoredEquipment), normalize(current.authoredEquipment));
      preservation.push({ mapId: target.mapId, id: old.id, field: "authoredEquipment", reason: "identical-native-object-in-multiple-extractions",
        previousReferences: old.authoredEquipment.inventoryReferences, currentReferences: current.authoredEquipment.inventoryReferences });
    }
    const oldMarker = oldMarkers.get(old.id), marker = targetDocument.markers.get(old.id);
    assert(fields(oldMarker, marker).every((field) => allowedMarkerFields.has(field)), `Unreviewed marker change: ${mapId}/${old.id}`);
    assert.deepEqual([...(oldMarker.categoryFacets ?? [])].sort(), [...(marker.categoryFacets ?? [])].sort());
    if (oldMarker.categoryFacets) marker.categoryFacets = structuredClone(oldMarker.categoryFacets);
    const missingTerms = (oldMarker.searchTerms ?? []).filter((term) => !marker.searchTerms?.includes(term));
    const newTerms = [...new Set(marker.searchTerms ?? [])].filter((term) => !oldMarker.searchTerms?.includes(term));
    if (oldMarker.searchTerms || marker.searchTerms) marker.searchTerms = [...(oldMarker.searchTerms ?? []), ...newTerms];
    if (missingTerms.length) preservation.push({ mapId: target.mapId, id: old.id, field: "searchTerms", terms: missingTerms });
    if (target.mapId !== mapId) moves.push({ fromMap: mapId, toMap: target.mapId, id: old.id, worldPosition: old.worldPosition });
    if (changedFields.length) changes.push({ fromMap: mapId, toMap: target.mapId, id: old.id, fields: fields(old, current) });
  }
}
for (const [mapId, document] of documents) for (const entity of document.content.entities) {
  const marker = document.markers.get(entity.id), candidate = document.candidates.get(entity.id);
  assert.equal(marker.contentId, entity.id); assert.deepEqual(candidate.mapPosition, { x: marker.x, y: marker.y });
  if (!beforeIds.has(entity.id)) {
    const profile = profiles.get(entity.sceneContext?.id);
    assert(profile && profile.characterContentId === entity.storyDestination?.characterContentId && profile.anchorContentId === entity.storyDestination.anchorContentId,
      `New appearance has no reviewed scene: ${mapId}/${entity.id}`);
    additions.push({ mapId, id: entity.id, profileId: profile.id, worldPosition: entity.worldPosition });
  }
}
const links = new Set([...documents.values()].flatMap((document) => document.content.relationships ?? []).map((link) => JSON.stringify(link)));
for (const document of previous.values()) for (const link of document.content.relationships ?? []) assert(links.has(JSON.stringify(link)), "Existing relationship lost");
for (const [mapId, document] of documents) {
  for (const [key, file] of Object.entries(files(mapId))) pending.set(file, serialized(document[key]));
  const metadataFile = `public/maps/${mapId}/metadata.json`;
  pending.set(metadataFile, bytes(path.join(baseline.maps.includes(mapId) ? canonical : root, metadataFile)));
}
for (const file of [import.meta.filename, "scripts/lib/placement-routing.mjs", "scripts/lib/scene-content-profile.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const stats = { maps: manifest.maps.length, appearances: routing.stats.retainedAppearances, identities: all.size,
  relocatedAppearances: moves.length, newIdentityAppearances: additions.length, retiredFalseAppearances: retirements.length,
  suppressedParentCopies: routing.stats.removedDuplicateAppearances, sceneProfiles: profiles.size,
  restoredSearchTerms: preservation.filter((row) => row.field === "searchTerms").reduce((sum, row) => sum + row.terms.length, 0) };
assert.equal(stats.appearances, [...previous.values()].reduce((sum, document) => sum + document.content.entities.length, 0) + additions.length - retirements.length);
for (const [file, data] of pending) {
  const target = path.join(output, file); fs.mkdirSync(path.dirname(target), { recursive: true });
  writeGeneratedFile(target, data); outputHashes[file] = digest(data);
}
const report = { kind: "canonical-map-reconciliation-review", canonical, raw, recordPath, bindingPath,
  stats, changes, moves, retirements, additions, preservation, routing, hashes, outputHashes, errors: [],
  scope: "Actual routed map/content reconciliation. Not independent acceptance, navigation/item publication, complete source coverage or raster-quality approval." };
writeGeneratedFile(path.join(output, "reconciliation-report.json"), serialized(report));
const sourceInputs = Object.fromEntries(["configPath", "storyLocationsPath", "dialogCatalogPath", "sceneContentPath", "equipmentItemPath", "gameplayStatsPath"]
  .map((key) => [key, manifest[key]]));
writeGeneratedFile(path.join(output, "stage-manifest.json"), serialized({ ...sourceInputs, kind: "reconciled-placement-review-stage", maps: manifest.maps,
  canonicalRoot: canonical, sourceStageRoot: raw, conservationAuditPath: path.join(output, "reconciliation-report.json"), stats,
  requiresRoutingAndConservationReview: true, requiresItemAcquisitionReview: true, requiresSceneContentReview: true,
  requiresSavedStateMigrationBeforePublication: retirements.length > 0, publishedDataUnchanged: true, hashes, outputHashes }));
console.log(JSON.stringify({ output, stats }));
