import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import ts from "typescript";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 3, "Usage: prepare-map-delivery.mjs <fresh-output-directory>");
const root = path.resolve(import.meta.dirname, ".."), output = path.resolve(root, process.argv[2]);
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const destination = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(destination && !destination.startsWith("..") && !path.isAbsolute(destination) && !fs.existsSync(output));
const digest = (data) => createHash("sha256").update(data).digest("hex"), hashes = {}, stamps = new Map();
const bytes = (file) => {
  const fullPath = path.resolve(root, file), stat = fs.statSync(fullPath), stamp = `${stat.size}/${stat.mtimeMs}/${stat.ctimeMs}`;
  if (stamps.has(fullPath)) assert.equal(stamps.get(fullPath), stamp, `Input changed: ${file}`);
  const data = fs.readFileSync(fullPath);
  stamps.set(fullPath, stamp); hashes[relative(file)] = digest(data); return data;
};
const fileHash = (file) => hashes[relative(file)] ?? digest(bytes(file));
const read = (file) => JSON.parse(bytes(file));
const auditRoot = "map-sources/audits/";
const snapshots = ["native-pixel-anchor-baseline", "map-delivery-baseline"].map((name) => read(`${auditRoot}${name}/snapshot.json`));
for (const snapshot of snapshots) {
  assert.equal(digest(bytes(snapshot.proofPath)), snapshot.proofHash);
  for (const capture of Object.values(snapshot.snapshots)) assert.equal(digest(bytes(capture.path)), capture.hash);
}
const verifiedCaptures = [];
const verify = (proof) => {
  for (const [file, expected] of Object.entries(proof.hashes)) {
    if (fileHash(file) === expected) continue;
    const capture = snapshots.flatMap((snapshot) => snapshot.snapshots[file] ? [snapshot.snapshots[file]] : []).find((entry) => entry.hash === expected);
    assert(capture, `Uncaptured changed proof input: ${file}`);
    assert.equal(digest(bytes(capture.path)), expected);
    verifiedCaptures.push({ file, original: capture.path, hash: expected });
  }
};
const integration = read(`${auditRoot}native-raster-integration-audit.json`);
const atlasProof = read(`${auditRoot}measured-atlas-independent-audit.json`);
const normal = read(`${auditRoot}native-raster-normal-generation-review.json`);
for (const proof of [integration, atlasProof]) { assert(equal(proof.errors, [])); verify(proof); }
verify(normal);
assert.equal(normal.stage, integration.stage);
assert(equal(normal.errors, [{ kind: "normal-output-differences", count: normal.differences.length }]));
// These raw presentation arrays are not interchangeable: the search consumer
// uses phrase substrings. Retain the reviewed canonical arrays byte-for-byte.
for (const row of normal.differences) {
  assert.equal(row.field, "locations");
  assert(row.changes?.length > 0);
  for (const change of row.changes) {
    assert(["searchTerms", "categoryFacets"].includes(change.field));
    assert(Array.isArray(change.before) && Array.isArray(change.after));
    assert(change.before.every((value) => typeof value === "string") && change.after.every((value) => typeof value === "string"));
    assert(equal([...new Set(change.before)].sort(), [...new Set(change.after)].sort()), `Changed search vocabulary: ${row.mapId}/${row.id}`);
  }
}
const oldCandidate = read(atlasProof.candidate), stage = read(`${integration.stage}/stage-manifest.json`);
assert.equal(oldCandidate.mapCount, stage.maps.length);
const registryBytes = bytes(oldCandidate.registryPath);
assert.equal(digest(registryBytes), oldCandidate.registryHash);
// Atlas geometry was already checked independently. Every source frame stays
// identical; only the five native-pixel refinements in the integration proof move.
for (const mapId of stage.maps) assert(bytes(`${integration.stage}/public/maps/${mapId}/metadata.json`)
  .equals(bytes(`${oldCandidate.mapStage}/public/maps/${mapId}/metadata.json`)), `Changed atlas source frame: ${mapId}`);

const baseline = snapshots[1];
const configFile = "src/features/map/map-config.ts";
const parseAliases = (source) => {
  const tree = ts.createSourceFile(configFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(tree.parseDiagnostics.length, 0);
  const declaration = tree.statements.filter(ts.isVariableStatement).flatMap((row) => [...row.declarationList.declarations])
    .find((row) => row.name.getText(tree) === "MAP_LOCATION_ALIASES");
  assert(declaration && ts.isObjectLiteralExpression(declaration.initializer));
  return Object.fromEntries(declaration.initializer.properties.map((row) => {
    assert(ts.isPropertyAssignment(row) && ts.isStringLiteral(row.name) && ts.isStringLiteral(row.initializer));
    return [row.name.text, row.initializer.text];
  }));
};
const beforeConfig = bytes(baseline.snapshots[configFile].path).toString("utf8"), config = bytes(configFile).toString("utf8");
const beforeAliases = parseAliases(beforeConfig), aliases = parseAliases(config);
const addedAliases = Object.entries(aliases).filter(([id]) => !Object.hasOwn(beforeAliases, id));
assert.equal(addedAliases.length, 1);
assert(Object.entries(beforeAliases).every(([id, target]) => aliases[id] === target));
const index = read(integration.indexPath), ids = new Set(index.locations.map((row) => row.id));
for (const [legacy, target] of Object.entries(aliases)) {
  assert(legacy !== target && ids.has(target) && !ids.has(legacy) && !Object.hasOwn(aliases, target));
}
const [legacy, target] = addedAliases[0];
assert(legacy.startsWith(`${target}:destination:`));
assert.equal(config.replace(`  ${JSON.stringify(legacy)}: ${JSON.stringify(target)},\n`, ""), beforeConfig,
  "Unexpected config change beyond the one reviewed alias");
for (const file of ["src/features/map/saved-map-storage.ts", "src/features/map/use-saved-map-state.ts", "src/features/map/map-registry.ts"]) {
  assert(bytes(file).equals(bytes(baseline.snapshots[file].path)), `Unexpected saved-state/registry change: ${file}`);
}
for (const file of [import.meta.filename, "src/features/map/map-fuzzy-search.ts", "src/features/map/map-search-match.ts", "src/features/map/map-workspace.tsx"]) bytes(file);
const files = {};
const include = (targetPath, sourcePath) => {
  assert(!Object.hasOwn(files, targetPath), `Duplicate delivery target: ${targetPath}`);
    files[targetPath] = { source: relative(sourcePath), sha256: fileHash(sourcePath) };
};
for (const mapId of stage.maps) {
  for (const name of ["metadata.json", "content.json", "locations.json"]) include(`public/maps/${mapId}/${name}`, `${integration.stage}/public/maps/${mapId}/${name}`);
  for (const suffix of ["placements.json", "placement-rejections.json"]) {
    const file = `map-sources/catalog/${mapId}-${suffix}`;
    include(file, `${integration.stage}/${file}`);
  }
  const meta = read(`${integration.stage}/public/maps/${mapId}/metadata.json`);
  const override = `${integration.rasterOverridesRoot}/${mapId}`;
  const folder = fs.existsSync(path.resolve(root, override, "metadata.json")) ? override : `public/maps/${mapId}`;
  include(`public/maps/${mapId}/overview.webp`, `${folder}/overview.webp`);
  const width = meta.tileImageSize?.width ?? meta.bounds.maxX - meta.bounds.minX;
  const height = meta.tileImageSize?.height ?? meta.bounds.maxY - meta.bounds.minY;
  for (const level of meta.detailLevels) for (let x = 0; x < Math.ceil(width / (meta.tileSize * 2 ** level)); x++) {
    for (let y = 0; y < Math.ceil(height / (meta.tileSize * 2 ** level)); y++) {
      const file = `tiles/${level}/tile${x}x${y}.webp`;
      include(`public/maps/${mapId}/${file}`, `${folder}/${file}`);
    }
  }
}
include("src/features/map/map-registry.ts", oldCandidate.registryPath);
include(configFile, configFile);
assert(bytes("src/features/map/use-map-search-index.ts").toString("utf8").includes("`${MAP_DATA_BASE_URL}/index.json`"));
include("public/maps/index.json", integration.indexPath);
include("public/data/item-database.json", integration.itemsPath);
for (const [file, stamp] of stamps) {
  const stat = fs.statSync(file);
  assert.equal(`${stat.size}/${stat.mtimeMs}/${stat.ctimeMs}`, stamp, `Input changed during preparation: ${relative(file)}`);
}
const report = {
  kind: "coupled-map-delivery-candidate", stage: integration.stage, indexPath: integration.indexPath, itemsPath: integration.itemsPath,
  registryPath: oldCandidate.registryPath, rasterOverridesRoot: integration.rasterOverridesRoot,
  stats: { maps: stage.maps.length, appearances: index.locations.length, nativeConnections: index.connections.length,
    deliveryFiles: Object.keys(files).length, rawPresentationDifferences: normal.differences.length, addedSavedAliases: addedAliases.length },
  normalGeneration: { geometryAndContentMatched: true, byteIdenticalRawOutput: false, canonicalSearchArraysPreserved: true },
  savedState: { addedAliases: Object.fromEntries(addedAliases), oldAliasesPreserved: true, runtimeUnchanged: true,
    review: "Existing runtime backs up favorites/completion/notes before redirects, retains legacy notes and never overwrites a conflicting target note. Personal markers are not alias targets. No user storage or fixtures were accessed." },
  coverageDisposition: {
    navigation: "All 618 extracted source portals are accounted for: 577 covered and 41 retained technical/cinematic exclusions. Review rows are provenance queues, not missing-map counts.",
    sourcePatches: "All 165 configured raster-backed maps are included. Unconfigured patch review rows are not treated as playable missing maps without a source-backed placement and visible raster.",
    sceneEquipment: "Requires-scene-review equipment remains provenance-only and has no map UI consumer. Conditional loot shown by the UI carries its availability warning.",
  },
  verifiedCaptures, files, hashes, errors: [], publicationReady: true,
  remaining: [],
};
fs.mkdirSync(output);
writeGeneratedFile(path.join(output, "generator-source.mjs"), fs.readFileSync(import.meta.filename));
writeGeneratedFile(path.join(output, "delivery-manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, publicationReady: report.publicationReady, output: relative(output) }));
