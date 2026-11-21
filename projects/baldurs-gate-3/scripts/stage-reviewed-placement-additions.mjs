import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { finalizePlacementRouting } from "./lib/placement-routing.mjs";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Compose a full regenerated set only when all previous complete records stay
// identical and every addition has an independently audited source counterpart.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 7) throw new Error("Usage: stage-reviewed-placement-additions.mjs <baseline-stage> <full-generator-stage> <source-audit> <new-stage> <report>");
const [baseline, generator, sourceAuditPath, requestedOutput, reportPath] = process.argv.slice(2).map((file) => path.resolve(root, file));
const output = path.join(fs.realpathSync(path.dirname(requestedOutput)), path.basename(requestedOutput));
const audits = fs.realpathSync(path.join(root, "map-sources/audits")), relativeOutput = path.relative(audits, output);
assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput) && !fs.existsSync(output), "Output must be a fresh audits child directory");
const hashes = {}, outputHashes = {}, errors = [], documents = new Map(), originals = new Map(), pending = [];
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute), key = relative(absolute), hash = digest(value);
  assert(!hashes[key] || hashes[key] === hash, `Input changed: ${key}`);
  hashes[key] = hash;
  return value;
};
const read = (file) => JSON.parse(bytes(file).toString("utf8"));
const equal = (actual, expected, label) => { if (!isDeepStrictEqual(actual, expected)) errors.push(label); };
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const serialized = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const reconciled = [];
const searchSet = (values) => { assert(values.every((value) => typeof value === "string")); return [...new Set(values)].sort(); };
const equivalentIndex = (value) => ({ ...value,
  ...(value.searchTerms ? { searchTerms: searchSet(value.searchTerms) } : {}),
  ...(value.categoryFacets ? { categoryFacets: searchSet(value.categoryFacets) } : {}) });
const nativeReferenceObjects = new Map();
const nativeReference = (reference) => {
  if (!nativeReferenceObjects.has(reference.sourcePath)) nativeReferenceObjects.set(reference.sourcePath,
    new Map(read(reference.sourcePath).save.regions.Templates.GameObjects.map((object) => [object.MapKey.value, object])));
  const object = nativeReferenceObjects.get(reference.sourcePath).get(reference.objectId);
  assert(object, `Missing original inventory owner: ${reference.sourcePath}/${reference.objectId}`);
  return object;
};
const preserveEquivalentReferences = (current, previous) => {
  if (!current?.authoredEquipment || !previous.authoredEquipment
    || !isDeepStrictEqual(omit(current, ["authoredEquipment"]), omit(previous, ["authoredEquipment"]))
    || !isDeepStrictEqual(omit(current.authoredEquipment, ["inventoryReferences"]), omit(previous.authoredEquipment, ["inventoryReferences"]))) return false;
  const before = previous.authoredEquipment.inventoryReferences, after = current.authoredEquipment.inventoryReferences;
  if (!before?.length || !after?.length || !after.every((reference) => before.some((old) => isDeepStrictEqual(reference, old)))) return false;
  const removed = before.filter((reference) => !after.some((next) => isDeepStrictEqual(reference, next)));
  if (!removed.length || !removed.every((reference) => after.some((next) =>
    isDeepStrictEqual(omit(reference, ["sourcePath"]), omit(next, ["sourcePath"]))
    && isDeepStrictEqual(nativeReference(reference), nativeReference(next))))) return false;
  current.authoredEquipment.inventoryReferences = before;
  return removed;
};
const sourceAudit = read(sourceAuditPath);
const directScenes = sourceAudit.kind === "native-direct-npc-placement-audit";
assert(directScenes || sourceAudit.kind === "native-reviewed-npc-scenes-audit");
assert.deepEqual(sourceAudit.errors, []);
if (directScenes) {
  // Direct scenes are compared against the preceding full raw generation;
  // canonical conservation below independently checks the routed counterpart.
  const canonicalManifest = read(path.join(baseline, "stage-manifest.json"));
  assert.equal(canonicalManifest.sourceStageRoot, sourceAudit.baselineRoot);
  assert(Array.isArray(sourceAudit.unresolved));
} else assert.equal(sourceAudit.baselineRoot, baseline);
for (const [file, hash] of Object.entries(sourceAudit.hashes)) { bytes(file); assert.equal(hashes[file], hash, `Stale source audit: ${file}`); }
const manifest = read(path.join(generator, "stage-manifest.json")), config = read(manifest.configPath);
assert.equal(manifest.kind, "unfinalized-placement-stage"); assert.equal(manifest.recordsIncluded, false);
assert.equal(manifest.storyDestinationRouting, "superseding-map-first");
const mapIds = config.maps.map(({ id }) => id);
assert.deepEqual([...manifest.maps].sort(), [...mapIds].sort());
assert.deepEqual([...readRegisteredMapIds(bytes("src/features/map/map-registry.ts").toString("utf8"))].sort(), [...mapIds].sort());
for (const file of [import.meta.filename, "scripts/lib/placement-routing.mjs", "scripts/lib/map-registry-source.mjs",
  "scripts/build-registered-placement-maps.mjs", "scripts/build-placement-catalog.mjs", "scripts/lib/placement-at-anchor.mjs"]) bytes(file);
const auditedManifest = read(path.join(sourceAudit.stageRoot, "stage-manifest.json"));
for (const key of ["configPath", "storyLocationsPath", "dialogCatalogPath", "sceneContentPath", "equipmentItemPath"]) {
  const verifiedInput = directScenes && ({ storyLocationsPath: sourceAudit.verifiedStoryLocationsPath, sceneContentPath: sourceAudit.verifiedSceneContentPath })[key];
  assert.equal(manifest[key], verifiedInput || auditedManifest[key]);
  if (manifest[key]) bytes(manifest[key]);
}
const expected = new Map(sourceAudit.entries.map((entry) => [`${entry.mapId}/${entry.contentId}`, entry]));
assert.equal(expected.size, sourceAudit.entries.length);
const expectedEntities = new Map(), expectedMarkers = new Map();
for (const mapId of new Set(sourceAudit.entries.map(({ mapId }) => mapId))) {
  const entities = read(path.join(sourceAudit.stageRoot, "public/maps", mapId, "content.json")).entities;
  const markers = read(path.join(sourceAudit.stageRoot, "public/maps", mapId, "locations.json")).locations;
  for (const entity of entities) expectedEntities.set(`${mapId}/${entity.id}`, entity);
  for (const marker of markers) expectedMarkers.set(`${mapId}/${marker.contentId}`, marker);
}
for (const mapId of mapIds) {
  const content = read(path.join(generator, "public/maps", mapId, "content.json"));
  const locations = read(path.join(generator, "public/maps", mapId, "locations.json"));
  const placement = read(path.join(generator, "map-sources/catalog", `${mapId}-placements.json`));
  assert.equal(placement.recordsOmitted, true); assert(!Object.hasOwn(placement, "records"));
  documents.set(mapId, { content, locations, placement });
  originals.set(mapId, structuredClone({ content, locations }));
}
const routing = finalizePlacementRouting(config.maps, documents);
let retainedEntities = 0, retainedMarkers = 0;
const added = [], changed = [], identities = new Set(), unchangedMaps = [];
for (const mapId of mapIds) {
  const { content, locations, placement } = documents.get(mapId), raw = originals.get(mapId);
  const oldContentBytes = bytes(path.join(baseline, "public/maps", mapId, "content.json"));
  const oldMarkerBytes = bytes(path.join(baseline, "public/maps", mapId, "locations.json"));
  const metadataBytes = bytes(path.join(baseline, "public/maps", mapId, "metadata.json"));
  const oldContent = JSON.parse(oldContentBytes), oldMarkers = JSON.parse(oldMarkerBytes);
  equal(omit(content, ["entities"]), omit(oldContent, ["entities"]), `Unreviewed content-level fields: ${mapId}`);
  equal(omit(locations, ["locations"]), omit(oldMarkers, ["locations"]), `Unreviewed location-level fields: ${mapId}`);
  const byId = new Map(content.entities.map((entity) => [entity.id, entity]));
  const byMarker = new Map(locations.locations.map((marker) => [marker.id, marker]));
  for (const entity of oldContent.entities) {
    const current = byId.get(entity.id);
    if (!isDeepStrictEqual(current, entity)) {
      const aliases = preserveEquivalentReferences(current, entity);
      if (aliases) reconciled.push({ mapId, contentId: entity.id, kind: "retained-identical-native-export-aliases", aliases });
    }
    if (!isDeepStrictEqual(current, entity)) {
      const fields = current ? [...new Set([...Object.keys(current), ...Object.keys(entity)])].filter((key) => !isDeepStrictEqual(current[key], entity[key])) : ["missing"];
      changed.push({ mapId, contentId: entity.id, fields }); errors.push(`Unreviewed existing entity: ${mapId}/${entity.id}`);
    } else retainedEntities++;
    byId.delete(entity.id);
  }
  for (const marker of oldMarkers.locations) {
    const current = byMarker.get(marker.id);
    if (current && !isDeepStrictEqual(current, marker) && isDeepStrictEqual(equivalentIndex(current), equivalentIndex(marker))) {
      // Normal generation and incremental enrichment assemble index arrays in
      // a different order. Preserve the canonical arrays only after proving
      // every term/facet and every non-index field identical.
      if (marker.searchTerms) current.searchTerms = marker.searchTerms;
      if (marker.categoryFacets) current.categoryFacets = marker.categoryFacets;
      reconciled.push({ mapId, contentId: marker.contentId, kind: "retained-equivalent-search-and-facet-arrays" });
    }
    equal(byMarker.get(marker.id), marker, `Unreviewed existing marker: ${mapId}/${marker.id}`);
    if (isDeepStrictEqual(byMarker.get(marker.id), marker)) retainedMarkers++;
    byMarker.delete(marker.id);
  }
  for (const entity of byId.values()) {
    const key = `${mapId}/${entity.id}`;
    if (!expected.has(key)) errors.push(`Unreviewed added entity: ${key}`);
    equal(entity, expectedEntities.get(key), `Addition differs from native audit: ${key}`);
    const matches = locations.locations.filter(({ contentId }) => contentId === entity.id);
    equal(matches.length, 1, `No unique marker: ${key}`);
    equal(matches[0], expectedMarkers.get(key), `Added marker differs from native audit: ${key}`);
    added.push({ mapId, contentId: entity.id });
  }
  for (const marker of byMarker.values()) if (!byId.has(marker.contentId)) errors.push(`Unreviewed added marker: ${mapId}/${marker.id}`);
  // Independently prove every removed raw appearance still has an unchanged
  // native identity/position on a declared descendant, never simply disappears.
  const descendants = (id) => (config.maps.find((map) => map.id === id).supersededBy ?? []).flatMap((child) => [child, ...descendants(child)]);
  for (const entity of raw.content.entities.filter(({ id }) => !content.entities.some((current) => current.id === id))) {
    const retained = descendants(mapId).flatMap((child) => documents.get(child).content.entities).find(({ id }) => id === entity.id);
    assert(retained, `Removed identity has no descendant: ${mapId}/${entity.id}`);
    assert(isDeepStrictEqual(retained.worldPosition, entity.worldPosition) && retained.statsId === entity.statsId && retained.templateId === entity.templateId);
  }
  for (const entity of content.entities) identities.add(entity.id);
  const unchanged = isDeepStrictEqual(content, oldContent) && isDeepStrictEqual(locations, oldMarkers);
  if (unchanged) unchangedMaps.push(mapId);
  for (const [name, value] of [["content.json", oldContentBytes], ["locations.json", oldMarkerBytes], ["metadata.json", metadataBytes]]) pending.push([`baseline/maps/${mapId}/${name}`, value]);
  pending.push([`public/maps/${mapId}/content.json`, isDeepStrictEqual(content, oldContent) ? oldContentBytes : serialized(content)],
    [`public/maps/${mapId}/locations.json`, isDeepStrictEqual(locations, oldMarkers) ? oldMarkerBytes : serialized(locations)],
    [`public/maps/${mapId}/metadata.json`, metadataBytes],
    [`map-sources/catalog/${mapId}-placements.json`, serialized(placement)],
    [`map-sources/catalog/${mapId}-placement-rejections.json`, bytes(path.join(generator, "map-sources/catalog", `${mapId}-placement-rejections.json`))]);
}
equal(added.map(({ mapId, contentId }) => `${mapId}/${contentId}`).sort(), [...expected.keys()].sort(), "Not every audited addition was preserved exactly once");
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash, `Source changed: ${file}`);
const report = { kind: "reviewed-placement-additions-conservation", baselineRoot: baseline, generatorRoot: generator, outputRoot: output, sourceAuditPath,
  ...(directScenes ? { unresolvedScenes: sourceAudit.unresolved } : {}),
  errors, changed, added, unchangedMaps, reconciled,
  stats: { maps: mapIds.length, retainedEntities, retainedMarkers, addedEntities: added.length, appearances: retainedEntities + added.length,
    identities: identities.size, unchangedMaps: unchangedMaps.length, equivalentIndexes: reconciled.filter(({ kind }) => kind === "retained-equivalent-search-and-facet-arrays").length,
    equivalentNativeAliases: reconciled.filter(({ kind }) => kind === "retained-identical-native-export-aliases").length, ...routing.stats }, hashes,
  scope: "Full registered regeneration and routing, followed only by proven index-set/native-object equivalence reconciliation. Final output preserves every previous complete entity/marker exactly and matches the independent native audit for additions. No runtime/UI test or live publication." };
writeGeneratedFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (errors.length) throw new Error(`Refresh rejected: ${errors.length} differences require review; see ${relative(reportPath)}`);
for (const [file, value] of pending) {
  const filename = path.join(output, file);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  writeGeneratedFile(filename, value);
  outputHashes[file] = digest(value);
}
writeGeneratedFile(path.join(output, "routing-report.json"), `${JSON.stringify(routing, null, 2)}\n`);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
for (const [file, hash] of Object.entries(outputHashes)) assert.equal(digest(fs.readFileSync(path.join(output, file))), hash);
writeGeneratedFile(path.join(output, "stage-manifest.json"), `${JSON.stringify({ ...manifest, kind: "reviewed-placement-additions-stage",
  ...(directScenes ? { unresolvedScenes: sourceAudit.unresolved } : {}),
  baselineRoot: baseline, sourceStageRoot: generator, sourceAuditPath, conservationAuditPath: reportPath, stats: report.stats,
  hashes, outputHashes, matches: added, publishedDataUnchanged: true, requiresRoutingAndConservationReview: false,
  requiresItemAcquisitionReview: true, scope: "Audited map refresh; item propagation and full native completeness remain open. No raster changes or publication." }, null, 2)}\n`);
console.log(JSON.stringify({ output, ...report.stats }, null, 2));
