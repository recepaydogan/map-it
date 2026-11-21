import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Deliberately does not import the routing implementation. Derive permitted
// changes again from raw documents, the hierarchy and retained identities.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 3) throw new Error("Usage: node scripts/audit-staged-placement-routing.mjs <routed-stage>");
const stageRoot = path.resolve(root, process.argv[2]);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const manifest = read(path.join(stageRoot, "stage-manifest.json"));
if (manifest.kind !== "routed-placement-stage") throw new Error("Expected a routed placement stage");
const sourceRoot = manifest.sourceStageRoot;
const config = read(manifest.configPath), routing = read(path.join(stageRoot, manifest.routingReport));
const errors = [], removed = [], prunedLinks = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const before = new Map(), after = new Map(), parents = new Map();
for (const map of config.maps) for (const child of map.supersededBy ?? []) {
  parents.set(child, [...(parents.get(child) ?? []), map.id]);
}
const ancestorsOf = (id) => {
  const pending = [...(parents.get(id) ?? [])], visited = new Set();
  while (pending.length) {
    const parent = pending.pop();
    if (parent === id) throw new Error(`Cyclic map hierarchy: ${id}`);
    if (visited.has(parent)) continue;
    visited.add(parent);
    pending.push(...(parents.get(parent) ?? []));
  }
  return visited;
};
const ancestors = new Map(config.maps.map(({ id }) => [id, ancestorsOf(id)]));
check(isDeepStrictEqual([...manifest.maps].sort(), config.maps.map(({ id }) => id).sort()), "Incomplete configured map set");
for (const mapId of manifest.maps) {
  const load = (directory) => ({ content: read(path.join(directory, "public/maps", mapId, "content.json")),
    locations: read(path.join(directory, "public/maps", mapId, "locations.json")),
    placement: read(path.join(directory, "map-sources/catalog", `${mapId}-placements.json`)) });
  before.set(mapId, load(sourceRoot));
  after.set(mapId, load(stageRoot));
}
const available = new Set([...after.values()].flatMap(({ content }) => content.entities.map(({ id }) => id)));
const originalIds = new Set([...before.values()].flatMap(({ content }) => content.entities.map(({ id }) => id)));
const retainedById = new Map();
const entityIndexes = new Map();
for (const [mapId, { content }] of after) {
  const index = new Map();
  for (const entity of content.entities) {
    check(!index.has(entity.id), `Duplicate retained entity: ${mapId}/${entity.id}`);
    index.set(entity.id, entity);
    retainedById.set(entity.id, [...(retainedById.get(entity.id) ?? []), { mapId, entity }]);
  }
  entityIndexes.set(mapId, index);
}
check(isDeepStrictEqual([...originalIds].sort(), [...available].sort()), "Routing changed the global content identity set");
for (const [mapId, raw] of before) {
  const routed = after.get(mapId), removedHere = new Set();
  const expectedEntities = raw.content.entities.filter((entity) => {
    const retainedBelow = (retainedById.get(entity.id) ?? []).filter(({ mapId: childId }) => ancestors.get(childId).has(mapId));
    if (!retainedBelow.length) return true;
    for (const { mapId: childId, entity: duplicate } of retainedBelow) {
      check(isDeepStrictEqual(duplicate.worldPosition, entity.worldPosition)
        && duplicate.templateId === entity.templateId && duplicate.statsId === entity.statsId, `Different native placement routed away: ${mapId}/${childId}/${entity.id}`);
    }
    removedHere.add(entity.id);
    removed.push({ mapId, id: entity.id, retainedOnMaps: retainedBelow.map(({ mapId: id }) => id).sort(), worldPosition: entity.worldPosition });
    return false;
  });
  check(isDeepStrictEqual(expectedEntities.map(({ id }) => id), routed.content.entities.map(({ id }) => id)), `Wrong retained entity identities/order: ${mapId}`);
  check(isDeepStrictEqual(omit(raw.content, ["entities", "relationships"]), omit(routed.content, ["entities", "relationships"])), `Content metadata changed: ${mapId}`);
  for (const original of expectedEntities) {
    const actual = entityIndexes.get(mapId).get(original.id);
    if (!actual) continue;
    const expected = structuredClone(original);
    for (const field of ["access", "puzzleCombinations", "mechanism"]) if (expected[field]?.related) {
      expected[field].related = expected[field].related.filter((link) => {
        if (available.has(link.contentId)) return true;
        prunedLinks.push({ mapId, id: original.id, field: `${field}.related`, reason: "unavailable-target", link });
        return false;
      });
    }
    check(isDeepStrictEqual(expected, actual), `Retained entity content/position changed: ${mapId}/${original.id}`);
  }
  const relationships = raw.content.relationships?.filter((link) => {
    const reason = removedHere.has(link.fromId) ? "superseded-source"
      : !available.has(link.fromId) || !available.has(link.toId) ? "unavailable-endpoint" : null;
    if (!reason) return true;
    prunedLinks.push({ mapId, field: "relationships", reason, link });
    return false;
  });
  check(isDeepStrictEqual(relationships, routed.content.relationships), `Relationship change not justified by availability/routing: ${mapId}`);
  check(isDeepStrictEqual({ ...raw.locations, locations: raw.locations.locations.filter(({ contentId }) => !removedHere.has(contentId)) }, routed.locations), `Unrelated location content/order changed: ${mapId}`);
  const candidates = raw.placement.candidates.filter(({ id }) => !removedHere.has(id));
  check(isDeepStrictEqual({ ...raw.placement, stats: { ...raw.placement.stats, candidates: candidates.length }, candidates }, routed.placement), `Unrelated candidate/catalog data changed: ${mapId}`);
  check(hash(path.join(sourceRoot, "map-sources/catalog", `${mapId}-placement-rejections.json`))
    === hash(path.join(stageRoot, "map-sources/catalog", `${mapId}-placement-rejections.json`)), `Rejection evidence changed: ${mapId}`);
}
const canonical = (entries) => entries.map((entry) => JSON.stringify(entry)).sort();
const destinationEvidence = (documents) => {
  const evidence = new Map();
  for (const [mapId, { content }] of documents) for (const entity of content.entities) {
    const profile = entity.storyDestination;
    if (!profile) continue;
    for (const destination of [{ anchorContentId: profile.anchorContentId, evidence: profile.evidence }, ...(profile.alternateDestinations ?? [])]) {
      for (const source of destination.evidence ?? []) {
        const entry = { characterId: profile.characterContentId, anchorId: destination.anchorContentId,
          sourcePath: source.sourcePath, sourceLine: source.sourceLine, statement: source.statement };
        const key = JSON.stringify(entry);
        if (!evidence.has(key)) evidence.set(key, { ...entry, maps: [] });
        evidence.get(key).maps.push(mapId);
      }
    }
  }
  return evidence;
};
const previousDestinationEvidence = destinationEvidence(before), retainedDestinationEvidence = destinationEvidence(after);
const lostDestinationEvidence = [...previousDestinationEvidence].filter(([key]) => !retainedDestinationEvidence.has(key)).map(([, entry]) => entry);
for (const entry of lostDestinationEvidence) check(false, `Routing lost selected/alternate story destination evidence: ${entry.characterId}/${entry.anchorId}`);
const retainedRelationships = new Set([...after.values()].flatMap(({ content }) => (content.relationships ?? []).map((link) => JSON.stringify(link))));
const lostAvailableRelationships = [...before].flatMap(([mapId, { content }]) => (content.relationships ?? [])
  .filter((link) => available.has(link.fromId) && available.has(link.toId) && !retainedRelationships.has(JSON.stringify(link)))
  .map((link) => ({ mapId, link })));
for (const { mapId, link } of lostAvailableRelationships) check(false, `Routing lost a relationship between retained identities: ${mapId}/${link.id}`);
check(isDeepStrictEqual(canonical(removed), canonical(routing.removedAppearances.map((entry) => ({ ...entry, retainedOnMaps: [...entry.retainedOnMaps].sort() })))), "Duplicate-removal report differs from independently derived removals");
check(isDeepStrictEqual(canonical(prunedLinks), canonical(routing.removedLinks)), "Link cleanup report differs from actual changes");
for (const [relative, expected] of Object.entries(routing.sourceHashes)) check(hash(path.join(sourceRoot, relative)) === expected, `Raw source changed after finalization: ${relative}`);
for (const [relative, expected] of Object.entries(routing.outputHashes)) check(hash(path.join(stageRoot, relative)) === expected, `Routed output changed: ${relative}`);
check(hash(manifest.configPath) === routing.inputHashes.config, "Placement config changed after finalization");
check(hash(manifest.sourceAuditPath) === routing.inputHashes.sourceAudit, "Source audit changed after finalization");
check(hash(path.join(sourceRoot, "stage-manifest.json")) === routing.inputHashes.manifest, "Raw stage manifest changed after finalization");
const report = { scope: "Complete raw-to-routed identity, native-position, retained-content, location, candidate and rejection conservation; independently derived hierarchy removals and unavailable-link cleanup. Not live publication or complete source-coverage proof.",
  sourceRoot, stageRoot, stats: { maps: manifest.maps.length, originalIdentities: originalIds.size, retainedIdentities: available.size,
    originalAppearances: [...before.values()].reduce((count, { content }) => count + content.entities.length, 0),
    retainedAppearances: [...after.values()].reduce((count, { content }) => count + content.entities.length, 0),
    removedDuplicateAppearances: removed.length, prunedLinks: prunedLinks.length },
  lostDestinationEvidence, lostAvailableRelationships,
  hashes: { manifest: hash(path.join(stageRoot, "stage-manifest.json")), routingReport: hash(path.join(stageRoot, manifest.routingReport)) },
  errors };
writeGeneratedFile(path.join(stageRoot, "routing-conservation-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
