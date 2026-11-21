import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createFloorSelector } from "./lib/floor-volume.mjs";
import { finalizePlacementRouting } from "./lib/placement-routing.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 6, "Usage: stage-native-floor-expansion.mjs <canonical> <new-floor-stage> <previous-config> <output-stage>");
const [canonical, rawRoot, previousConfig, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outputRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outputRelative && !outputRelative.startsWith("..") && !path.isAbsolute(outputRelative) && !fs.existsSync(output), "Use a fresh audit directory");
const hashes = {}, outputHashes = {}, pending = new Map();
const digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = relative(absolute);
  const hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash, `Input changed: ${key}`);
  hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const serialize = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const keyed = (rows) => {
  const result = new Map(rows.map((row) => [row.id, row]));
  assert.equal(rows.length, result.size, "Duplicate identity"); return result;
};
const filesFor = (id) => ({ content: `public/maps/${id}/content.json`, locations: `public/maps/${id}/locations.json`,
  placement: `map-sources/catalog/${id}-placements.json` });
const load = (directory, id) => Object.fromEntries(Object.entries(filesFor(id)).map(([key, file]) => [key, read(path.join(directory, file))]));
const baseline = read(path.join(canonical, "stage-manifest.json")), rawManifest = read(path.join(rawRoot, "stage-manifest.json"));
assert.equal(rawManifest.kind, "unfinalized-placement-stage");
assert.equal(rawManifest.recordsIncluded, true, "Native floor review requires source records");
const config = read(rawManifest.configPath), oldConfig = read(previousConfig);
const floorCatalog = read(config.floorVolumes ?? "map-sources/catalog/floor-volumes.json");
assert.deepEqual([...baseline.maps].sort(), oldConfig.maps.map(({ id }) => id).sort());
const existingIds = new Set(baseline.maps), additions = config.maps.filter(({ id }) => !existingIds.has(id));
assert.deepEqual(additions.map(({ id }) => id).sort(), [...rawManifest.maps].sort());
assert(additions.length, "No new floor definitions");
assert.deepEqual(omit(config, ["maps"]), omit(oldConfig, ["maps"]), "Unrelated configuration changed");
for (const before of oldConfig.maps) {
  const after = config.maps.find(({ id }) => id === before.id);
  assert(after);
  const children = additions.filter(({ floorVolumeSelection }) => floorVolumeSelection?.mapId === before.id).map(({ id }) => id);
  assert.deepEqual(omit(before, ["supersededBy"]), omit(after, ["supersededBy"]));
  assert.deepEqual((after.supersededBy ?? []).filter((id) => !children.includes(id)), before.supersededBy ?? []);
  for (const id of children) assert(after.supersededBy.includes(id));
}
for (const key of ["storyLocationsPath", "dialogCatalogPath", "sceneContentPath", "equipmentItemPath", "gameplayStatsPath"]) {
  assert.equal(rawManifest[key], baseline[key], `Different source catalog: ${key}`);
  if (rawManifest[key]) bytes(rawManifest[key]);
}
for (const [file, expected] of Object.entries(baseline.outputHashes)) {
  const data = bytes(path.join(canonical, file));
  assert.equal(digest(data), expected, `Changed accepted artifact: ${file}`); pending.set(file, data);
}
const originals = new Map(baseline.maps.map((id) => [id, load(canonical, id)]));
const documents = structuredClone(originals), relocations = [], newArrivals = [], deferredContentDifferences = [];
const oldIdentities = new Set([...originals.values()].flatMap(({ content }) => content.entities.map(({ id }) => id)));
for (const definition of additions) {
  const { id: mapId, floorVolumeSelection: selection } = definition;
  assert(selection && existingIds.has(selection.mapId), "A new floor must have an accepted parent");
  const matches = createFloorSelector(selection, floorCatalog), parent = originals.get(selection.mapId);
  const raw = load(rawRoot, mapId), next = structuredClone(raw);
  const entities = keyed(parent.content.entities), markers = keyed(parent.locations.locations), candidates = keyed(parent.placement.candidates);
  const generatedEntities = keyed(raw.content.entities), generatedMarkers = keyed(raw.locations.locations), records = keyed(raw.placement.records);
  // Passage pivots can lie in a wall while the usable entrance is outside it.
  // Follow the same bound source endpoint as native placement generation.
  const expected = parent.content.entities.filter((entity) => matches(candidates.get(entity.id)?.navigationPortal?.sourcePosition ?? entity.worldPosition));
  for (const entity of expected) assert(generatedEntities.has(entity.id), `Generated floor lost a canonical occupant: ${mapId}/${entity.id}`);
  for (const entity of raw.content.entities) {
    const sourceCandidate = raw.placement.candidates.find(({ id }) => id === entity.id);
    assert(matches(sourceCandidate?.navigationPortal?.sourcePosition ?? entity.worldPosition), `Wrong native floor: ${mapId}/${entity.id}`);
    const previous = entities.get(entity.id);
    if (previous) {
      assert.deepEqual(previous.worldPosition, entity.worldPosition);
      assert.equal(previous.templateId, entity.templateId); assert.equal(previous.statsId, entity.statsId);
      const changedFields = [...new Set([...Object.keys(previous), ...Object.keys(entity)])].filter((key) => !isDeepStrictEqual(previous[key], entity[key]));
      if (changedFields.length) deferredContentDifferences.push({ mapId, id: entity.id, title: entity.title, changedFields,
        fields: Object.fromEntries(changedFields.map((key) => [key, { accepted: previous[key], generated: entity[key] }])) });
      relocations.push({ fromMap: selection.mapId, toMap: mapId, id: entity.id, worldPosition: entity.worldPosition });
      continue;
    }
    assert(!oldIdentities.has(entity.id), `New floor duplicates a non-parent identity: ${entity.id}`);
    const profile = entity.storyDestination;
    assert(profile?.evidence?.length, `New identity needs authored arrival evidence: ${entity.id}`);
    assert.equal(entity.id, `${profile.characterContentId}:destination:${profile.anchorContentId}`);
    assert.deepEqual(records.get(profile.anchorContentId)?.position, entity.worldPosition);
    const character = records.get(profile.characterContentId);
    assert(character && character.templateId === entity.templateId && character.stats === entity.statsId);
    assert(!matches(character.position), "Same-floor authored actor must not gain a redundant arrival");
    for (const evidence of profile.evidence) {
      const line = bytes(evidence.sourcePath).toString("utf8").split(/\r?\n/)[evidence.sourceLine - 1];
      assert.equal(line?.trim().replace(/;$/, ""), evidence.statement.trim().replace(/;$/, ""), "Arrival statement differs from native script");
      assert(line.includes(profile.characterContentId) && line.includes(profile.anchorContentId));
    }
    newArrivals.push({ mapId, id: entity.id, worldPosition: entity.worldPosition, evidence: profile.evidence });
  }
  // A floor expansion changes presentation coordinates, not accepted gameplay.
  // Keep any newly observed classification/content disagreements explicit.
  next.content.entities = raw.content.entities.map((entity) => structuredClone(entities.get(entity.id) ?? entity));
  next.locations.locations = raw.locations.locations.map((marker) => {
    const previous = markers.get(marker.id);
    if (!previous) return marker;
    assert.equal(previous.contentId, marker.contentId);
    return { ...previous, ...Object.fromEntries(["x", "y", "region", "regionId"].filter((key) => Object.hasOwn(marker, key)).map((key) => [key, marker[key]])) };
  });
  next.placement = { ...omit(raw.placement, ["records"]), recordsOmitted: true,
    candidates: raw.placement.candidates.map((candidate) => {
      const previous = candidates.get(candidate.id);
      if (!previous) return candidate;
      const current = { ...omit(previous, ["mapPositionAdjustment"]), mapPosition: candidate.mapPosition };
      if (candidate.mapPositionAdjustment) current.mapPositionAdjustment = candidate.mapPositionAdjustment;
      assert.deepEqual({ x: generatedMarkers.get(candidate.id).x, y: generatedMarkers.get(candidate.id).y }, current.mapPosition);
      return current;
    }) };
  const movedIds = new Set(expected.map(({ id }) => id));
  next.content.relationships = (parent.content.relationships ?? []).filter(({ fromId }) => movedIds.has(fromId));
  documents.set(mapId, next);
  for (const file of [`public/maps/${mapId}/metadata.json`, `map-sources/catalog/${mapId}-placement-rejections.json`]) {
    pending.set(file, bytes(file.endsWith("metadata.json") ? path.join(root, file) : path.join(rawRoot, file)));
  }
  bytes(`public/maps/${mapId}/overview.webp`);
}
const routed = finalizePlacementRouting(config.maps, documents);
assert.equal(routed.stats.removedDuplicateAppearances, relocations.length);
assert(routed.removedLinks.every(({ reason }) => reason === "superseded-source"), "Expansion discarded a retained relationship");
const allLinks = new Set([...documents.values()].flatMap(({ content }) => (content.relationships ?? []).map((link) => JSON.stringify(link))));
for (const { content } of originals.values()) for (const link of content.relationships ?? []) assert(allLinks.has(JSON.stringify(link)), "Expansion lost an existing relationship");
for (const [mapId, document] of documents) for (const [key, file] of Object.entries(filesFor(mapId))) {
  if (!originals.has(mapId) || !isDeepStrictEqual(document[key], originals.get(mapId)[key])) pending.set(file, serialize(document[key]));
}
bytes(import.meta.filename); bytes("scripts/lib/floor-volume.mjs"); bytes("scripts/lib/placement-routing.mjs");
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Changed input: ${file}`);
const stats = { maps: config.maps.length, appearances: routed.stats.retainedAppearances, identities: routed.stats.retainedIdentities,
  relocatedAppearances: relocations.length, newArrivals: newArrivals.length,
  deferredContentDifferences: deferredContentDifferences.length,
  preservedHistoricalFiles: [...pending.keys()].filter((file) => file.startsWith("baseline/")).length };
assert.equal(stats.appearances, [...originals.values()].reduce((count, { content }) => count + content.entities.length, 0) + newArrivals.length);
assert.equal(stats.identities, oldIdentities.size + newArrivals.length);
for (const [file, data] of pending) {
  const target = path.join(output, file); fs.mkdirSync(path.dirname(target), { recursive: true });
  writeGeneratedFile(target, data); outputHashes[file] = digest(data);
}
const report = { kind: "native-floor-expansion-conservation", stats, relocations, newArrivals, deferredContentDifferences,
  routing: routed, hashes, outputHashes, errors: [],
  scope: "Native floor-volume assignment with accepted gameplay retained, exact source-backed new arrivals, complete identity and relationship conservation. Draft: disposition, scene content, independent raster/index/item review and live publication remain open." };
writeGeneratedFile(path.join(output, "floor-expansion-report.json"), serialize(report));
writeGeneratedFile(path.join(output, "stage-manifest.json"), serialize({ ...baseline, kind: "native-floor-expansion-stage",
  maps: config.maps.map(({ id }) => id), configPath: rawManifest.configPath,
  baselineRoot: canonical, sourceStageRoot: rawRoot, previousConfigPath: previousConfig,
  conservationAuditPath: path.join(output, "floor-expansion-report.json"), stats, hashes, outputHashes,
  requiresRoutingAndConservationReview: true, requiresItemAcquisitionReview: true, requiresSceneContentReview: true,
  newMapsWithoutHistoricalBaseline: additions.map(({ id }) => id), publishedDataUnchanged: true, scope: report.scope }));
console.log(JSON.stringify(stats, null, 2));
