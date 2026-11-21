import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { finalizePlacementRouting } from "./lib/placement-routing.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 5, "Usage: audit-native-raster-normal-generation.mjs <integration-proof> <normal-stage> <fresh-report>");
const root = path.resolve(import.meta.dirname, ".."), [proofPath, generatedStage, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
assert(!fs.existsSync(output));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => { const data = fs.readFileSync(path.resolve(root, file)); hashes[relative(file)] = digest(data); return data; };
const read = (file) => JSON.parse(bytes(file)), proof = read(proofPath);
assert.deepEqual(proof.errors, []);
for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), hash, `Changed integration evidence: ${file}`);
const stage = path.resolve(root, proof.stage), canonical = read(path.join(stage, "stage-manifest.json"));
const normal = read(path.join(generatedStage, "stage-manifest.json")), config = read(normal.configPath);
assert.equal(normal.kind, "unfinalized-placement-stage");
assert.equal(normal.recordsIncluded, false);
assert.equal(path.resolve(root, normal.previousStageRoot), stage);
assert.equal(path.resolve(root, normal.rasterOverridesRoot), path.resolve(root, proof.rasterOverridesRoot));
const generatedIds = new Set(normal.maps);
for (const mapId of generatedIds) for (const child of config.maps.find((map) => map.id === mapId).supersededBy ?? []) {
  assert(generatedIds.has(child), `Missing regenerated dependency: ${mapId}/${child}`);
}
for (const change of canonical.changes) assert(generatedIds.has(change.mapId), `Affected map was not regenerated: ${change.mapId}`);
const documents = new Map(), originals = new Map();
for (const mapId of canonical.maps) {
  const load = (directory) => ({ content: read(path.join(directory, `public/maps/${mapId}/content.json`)),
    locations: read(path.join(directory, `public/maps/${mapId}/locations.json`)),
    placement: read(path.join(directory, `map-sources/catalog/${mapId}-placements.json`)) });
  const before = load(stage); originals.set(mapId, before);
  documents.set(mapId, generatedIds.has(mapId) ? load(generatedStage) : structuredClone(before));
}
const duplicates = [];
for (const mapId of generatedIds) {
  const accepted = new Set(originals.get(mapId).content.entities.map((row) => row.id));
  for (const entity of documents.get(mapId).content.entities) if (!accepted.has(entity.id)) {
    const descendants = new Set(config.maps.find((map) => map.id === mapId).supersededBy ?? []);
    for (const child of descendants) for (const nested of config.maps.find((map) => map.id === child).supersededBy ?? []) descendants.add(nested);
    const destinations = [...descendants].flatMap((child) => documents.get(child).content.entities
      .filter((row) => row.id === entity.id).map((row) => ({ mapId: child, entity: row })));
    assert(destinations.length, `New source object lacks a reviewed child placement: ${mapId}/${entity.id}`);
    const match = destinations.find(({ entity: child }) => equal(entity, child)
      || equal({ ...entity, sourceLevel: child.sourceLevel, tags: entity.tags.map((tag) => tag === entity.sourceLevel ? child.sourceLevel : tag) }, child));
    assert(match, `Parent and child disagree beyond the source-level context: ${mapId}/${entity.id}`);
    duplicates.push({ mapId, id: entity.id, retainedMapId: match.mapId,
      parentSourceLevel: entity.sourceLevel, childSourceLevel: match.entity.sourceLevel,
      onlySourceLevelContextDiffers: !equal(entity, match.entity) });
  }
}
const routing = finalizePlacementRouting(config.maps, documents);
assert.deepEqual(new Set(routing.removedAppearances.map((row) => `${row.mapId}/${row.id}`)),
  new Set(duplicates.map((row) => `${row.mapId}/${row.id}`)));
let normalEntities = 0;
const differences = [];
const compareRows = (mapId, field, actual, expected) => {
  if (equal(actual, expected)) return;
  if (!Array.isArray(actual) || !Array.isArray(expected)) {
    differences.push({ mapId, field, reason: "different-document-value" }); return;
  }
  const byId = new Map(expected.map((row) => [row.id, row]));
  if (!equal(actual.map((row) => row.id), expected.map((row) => row.id))) differences.push({ mapId, field, reason: "different-identity-order-or-set" });
  for (const row of actual) if (!equal(row, byId.get(row.id))) {
    const before = byId.get(row.id);
    differences.push({ mapId, field, id: row.id,
      changes: Object.keys({ ...before, ...row }).filter((key) => !equal(before?.[key], row[key]))
        .map((key) => ({ field: key, before: before?.[key], after: row[key] })) });
  }
};
for (const [mapId, document] of documents) {
  const before = originals.get(mapId);
  compareRows(mapId, "entities", document.content.entities, before.content.entities);
  compareRows(mapId, "relationships", document.content.relationships, before.content.relationships);
  compareRows(mapId, "locations", document.locations.locations, before.locations.locations);
  compareRows(mapId, "candidates", document.placement.candidates, before.placement.candidates);
  if (generatedIds.has(mapId)) normalEntities += document.content.entities.length;
}
for (const file of [import.meta.filename, "scripts/build-placement-catalog.mjs", "scripts/build-registered-placement-maps.mjs",
  "scripts/lib/native-raster-anchor.mjs", "scripts/lib/placement-routing.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), hash, `Input changed during normal-generation review: ${file}`);
const report = { kind: "independent-native-raster-normal-generation-audit", stage: relative(stage), itemsPath: proof.itemsPath, indexPath: proof.indexPath,
  integrationProof: relative(proofPath), generatedStage: relative(generatedStage), rasterOverridesRoot: proof.rasterOverridesRoot,
  stats: { combinedMaps: documents.size, normalMaps: generatedIds.size, normalEntities, comparedEntities: routing.stats.retainedAppearances,
    routedDuplicateParentAppearances: duplicates.length, sourceLevelContextVariants: duplicates.filter((row) => row.onlySourceLevelContextDiffers).length,
    preservedIdentities: routing.stats.retainedIdentities, differingRows: differences.length }, duplicates, routing, differences,
  errors: differences.length ? [{ kind: "normal-output-differences", count: differences.length }] : [], hashes, publicationReady: false,
  limitations: ["Normal generation covers every affected map and all its configured child dependencies, not all 165 maps.",
    "Routing occurs only in memory for comparison. No source, stored stage, canonical pin, or published pin was deleted.",
    "Full native map/scene coverage, saved-state migration, atlas/raster publication and final goal audit remain open."] };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, hashes: Object.keys(hashes).length, output: relative(output) }));
if (differences.length) process.exitCode = 1;
