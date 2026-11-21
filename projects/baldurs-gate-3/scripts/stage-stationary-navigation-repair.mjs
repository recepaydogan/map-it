import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { finalizePlacementRouting } from "./lib/placement-routing.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 6, "Usage: stage-stationary-navigation-repair.mjs <canonical> <region-raw> <native-audit> <fresh-output>");
const root = path.resolve(import.meta.dirname, "..");
const [canonical, raw, auditPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relativeOutput = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput) && !fs.existsSync(output));
const hashes = {}, outputHashes = {}, pending = new Map(), digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file)), serialize = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const proof = read(auditPath), baseline = read(path.join(canonical, "stage-manifest.json")), rawManifest = read(path.join(raw, "stage-manifest.json"));
assert.equal(proof.kind, "stationary-navigation-source-and-delta-audit"); assert.equal(proof.after, raw); assert.deepEqual(proof.errors, []);
for (const [file, expected] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), expected, `Stale native proof: ${file}`);
const review = proof.review, config = read(rawManifest.configPath);
assert.deepEqual([...baseline.maps].sort(), config.maps.map(({ id }) => id).sort());
for (const [file, hash] of Object.entries(baseline.outputHashes)) {
  const data = bytes(path.join(canonical, file)); assert.equal(digest(data), hash, `Changed canonical artifact: ${file}`); pending.set(file, data);
}
const files = (mapId) => ({ content: `public/maps/${mapId}/content.json`, locations: `public/maps/${mapId}/locations.json`,
  placement: `map-sources/catalog/${mapId}-placements.json`, rejections: `map-sources/catalog/${mapId}-placement-rejections.json` });
const originals = new Map(), documents = new Map(), rawDocuments = new Map();
for (const mapId of baseline.maps) {
  const old = Object.fromEntries(Object.entries(files(mapId)).map(([key, file]) => [key, read(path.join(canonical, file))]));
  originals.set(mapId, old); documents.set(mapId, structuredClone(old));
  if (rawManifest.maps.includes(mapId)) rawDocuments.set(mapId,
    Object.fromEntries(Object.entries(files(mapId)).map(([key, file]) => [key, read(path.join(raw, file))])));
  assert(!(old.content.relationships ?? []).some((link) => link.fromId === review.retiredId || link.toId === review.retiredId));
}
const oldIds = new Set([...originals.values()].flatMap(({ content }) => content.entities.map(({ id }) => id)));
const sourceOld = originals.get(review.parentMap), sourceNew = rawDocuments.get(review.sourceMap), child = documents.get(review.sourceMap);
const entity = sourceOld.content.entities.find(({ id }) => id === review.portalId);
const marker = sourceOld.locations.locations.find(({ id }) => id === review.portalId);
const candidate = sourceOld.placement.candidates.find(({ id }) => id === review.portalId);
const generatedEntity = sourceNew.content.entities.find(({ id }) => id === review.portalId);
const generatedMarker = sourceNew.locations.locations.find(({ id }) => id === review.portalId);
const generatedCandidate = sourceNew.placement.candidates.find(({ id }) => id === review.portalId);
assert.deepEqual(entity, generatedEntity); assert(marker && candidate && generatedMarker && generatedCandidate);
assert.deepEqual(omit(candidate, ["mapPosition", "mapPositionAdjustment"]), omit(generatedCandidate, ["mapPosition", "mapPositionAdjustment"]));
assert.equal(generatedCandidate.mapPositionAdjustment.portalInstanceId, review.portalInstanceId);
assert(!child.content.entities.some(({ id }) => id === review.portalId));
let removedCanonicalAppearances = 0;
for (const [mapId, document] of documents) {
  const retired = document.content.entities.filter(({ id }) => id === review.retiredId);
  if (retired.length) {
    assert.equal(mapId, review.sourceMap); assert.equal(retired.length, 1);
    assert.equal(retired[0].navigationDestination.instanceId, review.portalInstanceId);
    assert.deepEqual(retired[0].navigationDestination.sourcePosition, retired[0].navigationDestination.targetPosition);
    removedCanonicalAppearances++;
  }
  for (const [section, field] of [["content", "entities"], ["locations", "locations"], ["placement", "candidates"]]) {
    const index = document[section][field].findIndex(({ id }) => id === review.retiredId);
    if (index >= 0) {
      assert.equal(mapId, review.sourceMap);
      const replacement = section === "content" ? structuredClone(entity) : section === "placement" ? structuredClone(generatedCandidate)
        : { ...structuredClone(marker), x: generatedMarker.x, y: generatedMarker.y, region: generatedMarker.region, regionId: generatedMarker.regionId };
      document[section][field].splice(index, 1, replacement);
    }
  }
  if (rawDocuments.has(mapId)) {
    const oldRaw = read(path.join(proof.before, files(mapId).placement));
    assert.deepEqual(omit(document.placement.stats, ["candidates", "silhouetteRejectedCandidates"]), omit(oldRaw.stats, ["candidates", "silhouetteRejectedCandidates"]));
    document.placement.stats.uniqueObjects = rawDocuments.get(mapId).placement.stats.uniqueObjects;
    document.placement.stats.localizedObjects = rawDocuments.get(mapId).placement.stats.localizedObjects;
  }
}
assert.equal(removedCanonicalAppearances, 1);
const rejected = child.rejections.rejectedCandidates.filter(({ id }) => id === review.portalId);
assert.equal(rejected.length, 1); assert.deepEqual(rejected[0].worldPosition, candidate.position);
child.rejections.rejectedCandidates = child.rejections.rejectedCandidates.filter(({ id }) => id !== review.portalId);
const adjustment = sourceNew.rejections.adjustedCandidates.find(({ id }) => id === review.portalId); assert(adjustment);
child.rejections.adjustedCandidates.push(structuredClone(adjustment));
child.placement.silhouetteRejectedCandidates = child.placement.silhouetteRejectedCandidates.filter(({ id }) => id !== review.portalId);
child.placement.stats.silhouetteRejectedCandidates = child.placement.silhouetteRejectedCandidates.length;
const routing = finalizePlacementRouting(config.maps, documents);
assert.equal(routing.stats.removedDuplicateAppearances, 1); assert.equal(routing.stats.removedLinks, 0);
assert.deepEqual(routing.removedAppearances.map(({ mapId, id, retainedOnMaps }) => ({ mapId, id, retainedOnMaps })),
  [{ mapId: review.parentMap, id: review.portalId, retainedOnMaps: [review.sourceMap] }]);
const ids = new Set([...documents.values()].flatMap(({ content }) => content.entities.map(({ id }) => id)));
assert.deepEqual([...ids].sort(), [...oldIds].filter((id) => id !== review.retiredId).sort());
const changedFiles = [];
for (const [mapId, document] of documents) for (const [key, file] of Object.entries(files(mapId))) {
  if (!isDeepStrictEqual(document[key], originals.get(mapId)[key])) { pending.set(file, serialize(document[key])); changedFiles.push(file); }
}
const stats = { maps: baseline.maps.length, appearances: routing.stats.retainedAppearances, identities: ids.size,
  relocatedSourceAppearances: 1, removedSyntheticAppearances: removedCanonicalAppearances, newNativeIdentities: 0,
  immutableFiles: pending.size - changedFiles.length };
assert.equal(stats.appearances, [...originals.values()].reduce((sum, { content }) => sum + content.entities.length, 0) - 1);
bytes(import.meta.filename); bytes("scripts/lib/placement-routing.mjs");
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Changed input: ${file}`);
fs.mkdirSync(output);
const write = (file, value) => {
  const data = Buffer.isBuffer(value) ? value : serialize(value), target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true }); writeGeneratedFile(target, data); outputHashes[file] = digest(data);
};
for (const [file, data] of pending) write(file, data);
write("stationary-navigation-repair-report.json", { kind: "canonical-stationary-navigation-repair", canonical, raw, auditPath,
  stats, review, hashes, changedFiles, routing, outputHashes: { ...outputHashes }, errors: [] });
write("stage-manifest.json", { ...baseline, kind: "canonical-navigation-repair-stage", previousNavigationStage: canonical,
  navigationAuditPath: auditPath, navigationRawStage: raw, outputHashes: { ...outputHashes },
  pendingNavigationReview: (baseline.pendingNavigationReview ?? []).filter(({ id }) => id !== review.portalId),
  publishedDataUnchanged: true, requiresRoutingAndConservationReview: true });
console.log(JSON.stringify({ output, stats }, null, 2));
