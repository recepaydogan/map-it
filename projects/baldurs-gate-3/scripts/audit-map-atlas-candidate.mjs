import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 4, "Usage: audit-map-atlas-candidate.mjs <candidate-manifest> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [manifestPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
assert(!fs.existsSync(output), "Refuse to replace an earlier audit");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashes = {};
const read = (file) => {
  const resolved = path.resolve(root, file), bytes = fs.readFileSync(resolved);
  hashes[relative(resolved)] = digest(bytes); return bytes;
};
const json = (file) => JSON.parse(read(file));
const manifest = json(manifestPath);
assert.equal(manifest.kind, "connected-map-atlas-candidate");
for (const [file, hash] of Object.entries(manifest.hashes)) assert.equal(digest(read(file)), hash, `Stale candidate input: ${file}`);
const snapshot = json(manifest.baselineSnapshot), proof = json(manifest.sourceProof);
assert.equal(digest(read(manifest.sourceProof)), snapshot.proofHash);
assert.deepEqual(proof.errors, []);
assert.equal(manifest.mapStage, proof.stage);
assert.equal(manifest.indexPath, proof.indexPath);
assert.equal(manifest.itemsPath, proof.itemsPath);
assert.equal(digest(read(manifest.registryPath)), manifest.registryHash);
for (const [file, hash] of Object.entries(proof.hashes)) assert.equal(digest(read(file)), hash);
for (const [file, capture] of Object.entries(snapshot.snapshots)) {
  assert.equal(digest(read(capture.path)), capture.hash);
  assert.equal(digest(read(file)), capture.hash, `Live source was changed: ${file}`);
}

// Decode literal declarations from the AST, independently of the candidate
// producer and without running the registry's own validation implementation.
const registry = (file) => {
  const tree = ts.createSourceFile(file, read(file).toString("utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(tree.parseDiagnostics.length, 0);
  const literal = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map((prop) => {
      assert(ts.isPropertyAssignment(prop)); return [prop.name.text, literal(prop.initializer)];
    }));
    if (ts.isTemplateExpression(node)) {
      assert.equal(node.head.text, ""); assert.equal(node.templateSpans.length, 1);
      assert.equal(node.templateSpans[0].expression.getText(tree), "MAP_DATA_BASE_URL");
      return `/maps${node.templateSpans[0].literal.text}`;
    }
    throw new Error(`Unexpected registry expression: ${node.getText(tree)}`);
  };
  const result = {};
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (["MAP_DEFINITIONS", "MAP_ATLASES"].includes(declaration.name.text)) result[declaration.name.text] = literal(declaration.initializer);
    }
  }
  return result;
};
const before = registry(snapshot.snapshots["src/features/map/map-registry.ts"].path);
const after = registry(manifest.registryPath);
const layout = json(manifest.layoutPath), config = json("map-sources/config/placement-maps.json");
const stage = json(`${manifest.mapStage}/stage-manifest.json`), index = json(manifest.indexPath);
const oldIds = before.MAP_DEFINITIONS.map(({ id }) => id), ids = after.MAP_DEFINITIONS.map(({ id }) => id);
assert.equal(new Set(ids).size, ids.length);
assert.deepEqual(after.MAP_DEFINITIONS.slice(0, oldIds.length), before.MAP_DEFINITIONS);
assert.deepEqual([...ids].sort(), [...stage.maps].sort());
assert.deepEqual([...ids].sort(), config.maps.map(({ id }) => id).sort());
assert.deepEqual([...ids].sort(), index.maps.map(({ id }) => id).sort());
assert.deepEqual(ids.filter((id) => !oldIds.includes(id)).sort(), [...manifest.addedMaps].sort());
assert.equal(after.MAP_ATLASES.length, before.MAP_ATLASES.length);
const placements = new Map(), oldPlacements = new Map(), metadata = new Map();
const gap = (a, b) => Math.hypot(Math.max(0, a.x - b.x - b.width, b.x - a.x - a.width), Math.max(0, a.y - b.y - b.height, b.y - a.y - a.height));
const conflicts = [];
const errors = [];
for (const atlas of before.MAP_ATLASES) for (const place of atlas.placements) oldPlacements.set(place.mapId, place);
for (const atlas of after.MAP_ATLASES) {
  const previous = before.MAP_ATLASES.find(({ id }) => id === atlas.id);
  const { placements: ignoredAfter, ...headAfter } = atlas;
  const { placements: ignoredBefore, ...headBefore } = previous;
  assert.deepEqual(headAfter, headBefore);
  if (atlas.id !== layout.atlasId) assert.deepEqual(atlas, previous);
  for (const place of atlas.placements) {
    assert(ids.includes(place.mapId) && !placements.has(place.mapId));
    placements.set(place.mapId, place);
    assert([place.x, place.y, place.width, place.height].every(Number.isFinite));
    assert(place.width > 0 && place.height > 0 && place.x >= 0 && place.y >= 0);
    assert(place.x + place.width <= atlas.width && place.y + place.height <= atlas.height);
    const meta = json(`${manifest.mapStage}/public/maps/${place.mapId}/metadata.json`);
    assert.deepEqual(json(`public/maps/${place.mapId}/metadata.json`), meta);
    metadata.set(place.mapId, meta);
    const b = meta.bounds;
    const physicalWidth = meta.tileImageSize?.width ?? b.maxX - b.minX;
    const physicalHeight = meta.tileImageSize?.height ?? b.maxY - b.minY;
    const ratioError = Math.abs(place.width / place.height - physicalWidth / physicalHeight);
    assert(ratioError < 1e-6, `Distorted aspect ratio: ${place.mapId}`);
    if (oldPlacements.has(place.mapId)) {
      const old = oldPlacements.get(place.mapId), move = layout.moves.find(({ mapId }) => mapId === place.mapId);
      assert.deepEqual(place, move ? { ...old, x: move.x, y: move.y } : old);
    } else {
      const addition = layout.additions.find(({ mapId }) => mapId === place.mapId);
      assert(addition && place.x === addition.x && place.y === addition.y && place.width === addition.width);
      const definition = after.MAP_DEFINITIONS.find(({ id }) => id === place.mapId);
      const parent = after.MAP_DEFINITIONS.find(({ id }) => id === layout.parentMapId);
      assert.deepEqual(definition, { id: place.mapId, name: meta.displayName, groupKey: parent.groupKey, dataUrl: `/maps/${place.mapId}` });
      const recipe = config.maps.find(({ id }) => id === place.mapId);
      assert.equal(recipe.floorVolumeSelection.mapId, parent.id);
      assert(recipe.floorVolumeSelection.patchIds.length > 0);
    }
  }
  for (let i = 0; i < atlas.placements.length; i++) for (const b of atlas.placements.slice(i + 1)) {
    const a = atlas.placements[i];
    if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) conflicts.push([a.mapId, b.mapId]);
  }
}
assert.equal(placements.size, ids.length);
assert.deepEqual(conflicts, []);
const nativeDistances = [];
for (const connection of index.connections) {
  assert.equal(connection.endpoints.length, 2);
  for (const endpoint of connection.endpoints) {
    assert(placements.has(endpoint.mapId));
    assert(index.locations.some((p) => p.mapId === endpoint.mapId && p.id === endpoint.locationId));
  }
  const [a, b] = connection.endpoints.map(({ mapId }) => placements.get(mapId));
  if (a.mapId === b.mapId) continue;
  const sameAtlas = after.MAP_ATLASES.some((atlas) => atlas.placements.some((p) => p.mapId === a.mapId) && atlas.placements.some((p) => p.mapId === b.mapId));
  if (!sameAtlas) continue;
  const oldA = oldPlacements.get(a.mapId), oldB = oldPlacements.get(b.mapId);
  const distance = gap(a, b), previousDistance = oldA && oldB ? gap(oldA, oldB) : null;
  const sameBuilding = layout.buildingGroups.some((group) => group.includes(a.mapId) && group.includes(b.mapId));
  if (sameBuilding && distance > layout.maximumBuildingNeighbourGap) errors.push(`Connected building parts too far apart: ${a.mapId}/${b.mapId}: ${distance}`);
  if (previousDistance !== null && distance > previousDistance + 1e-5) errors.push(`Existing connection worsened: ${connection.id}`);
  nativeDistances.push({ id: connection.id, maps: [a.mapId, b.mapId], before: previousDistance, after: distance, sameBuilding });
}
const buildingResults = [];
for (const group of layout.buildingGroups) {
  const reachable = new Set([group[0]]);
  while (true) {
    const next = group.filter((id) => !reachable.has(id) && [...reachable].some((other) => gap(placements.get(id), placements.get(other)) <= layout.maximumBuildingNeighbourGap));
    if (!next.length) break;
    for (const id of next) reachable.add(id);
  }
  assert.equal(reachable.size, group.length, `Disconnected building layout: ${group.join(", ")}`);
  const parentGap = Math.min(...group.map((id) => gap(placements.get(id), placements.get(layout.parentMapId))));
  assert(parentGap <= layout.maximumParentGap);
  buildingResults.push({ maps: group, parentGap });
}

// Inspect every actual document and use the production projection consumers
// on real marker records, not synthetic fixtures or browser tests.
const projectionContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(read("src/features/map/map-atlas-projection.ts").toString("utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, projectionContext);
const projection = projectionContext.exports, bounds = new Map([...metadata].map(([id, meta]) => [id, meta.bounds]));
let appearances = 0, newFloorPins = 0, rasters = 0;
for (const mapId of ids) {
  for (const [file, hash] of Object.entries(stage.outputHashes).filter(([file]) => file.includes(`/${mapId}/`) || file.includes(`/${mapId}-`))) {
    assert.equal(digest(read(`${manifest.mapStage}/${file}`)), hash, `Changed map-stage output: ${file}`);
  }
  const folder = `${manifest.mapStage}/public/maps/${mapId}`;
  const locations = json(`${folder}/locations.json`);
  const content = json(`${folder}/content.json`);
  const entities = new Map(content.entities.map((entity) => [entity.id, entity]));
  const points = Array.isArray(locations) ? locations : locations.locations;
  const atlas = after.MAP_ATLASES.find((a) => a.placements.some((p) => p.mapId === mapId));
  for (const point of points) {
    assert(entities.has(point.contentId ?? point.id), `Marker without content: ${mapId}/${point.id}`);
    const projected = projection.projectPointToAtlas(atlas, bounds, { ...point, mapId });
    assert(projected?.mapId === mapId && projected.id === point.id);
    const place = placements.get(mapId), frame = bounds.get(mapId);
    const expectedX = place.x + (point.x - frame.minX) * place.width / (frame.maxX - frame.minX);
    const expectedY = place.y + (point.y - frame.minY) * place.height / (frame.maxY - frame.minY);
    assert(Math.abs(projected.x - expectedX) < 1e-8 && Math.abs(projected.y - expectedY) < 1e-8);
    const restored = projection.unprojectAtlasCoordinate(atlas, bounds, projected);
    assert(restored?.mapId === mapId, `Atlas inverse selected a different map: ${mapId}/${point.id}`);
    assert(Math.abs(restored.coordinate.x - point.x) < 1e-7 && Math.abs(restored.coordinate.y - point.y) < 1e-7);
    appearances++;
    if (manifest.addedMaps.includes(mapId)) newFloorPins++;
  }
  const meta = metadata.get(mapId), frame = meta.bounds;
  const width = meta.tileImageSize?.width ?? frame.maxX - frame.minX;
  const height = meta.tileImageSize?.height ?? frame.maxY - frame.minY;
  const files = ["overview.webp"];
  for (const level of meta.detailLevels) for (let x = 0; x < Math.ceil(width / (meta.tileSize * 2 ** level)); x++) {
    for (let y = 0; y < Math.ceil(height / (meta.tileSize * 2 ** level)); y++) files.push(`tiles/${level}/tile${x}x${y}.webp`);
  }
  // Presence and content hashes for the whole registry; decode new rasters as
  // well. Pixel-source fidelity remains its own independent publication gate.
  for (const file of files) {
    const bytes = read(`public/maps/${mapId}/${file}`);
    if (manifest.addedMaps.includes(mapId)) {
      const info = await sharp(bytes).metadata(); assert.equal(info.format, "webp");
      if (file !== "overview.webp") assert(info.width === meta.tileSize && info.height === meta.tileSize);
    }
    rasters++;
  }
}
assert.equal(appearances, index.locations.length);
assert.equal(manifest.requiresGameplayAvailabilityReview, stage.requiresGameplayAvailabilityReview);
assert.equal(manifest.requiresSavedStateMigrationBeforePublication, stage.requiresSavedStateMigrationBeforePublication);
read(import.meta.filename);
read("scripts/lib/write-generated-file.mjs");
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), hash, `Input changed during audit: ${file}`);
const report = { kind: "independent-connected-atlas-audit", candidate: relative(manifestPath),
  stats: { maps: ids.length, retainedDefinitions: oldIds.length, addedMaps: manifest.addedMaps.length, movedAtlasMaps: manifest.movedAtlasMaps.length,
    appearances, newFloorPins, rasters, nativeConnections: index.connections.length, buildingGroups: buildingResults.length,
    worsenedExistingConnections: nativeDistances.filter((r) => r.before !== null && r.after > r.before + 1e-5).length },
  buildingResults, nativeDistances, errors, hashes,
  limitations: ["Not published: full gameplay review and saved-state migration remain required.", "Raster presence is not pixel-source fidelity approval.", "Geometric audit is not rendered label-overlap or application certification."] };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, errors, hashes: Object.keys(hashes).length, report: relative(output) }));
if (errors.length) process.exitCode = 1;
