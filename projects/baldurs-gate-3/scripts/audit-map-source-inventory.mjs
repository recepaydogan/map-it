import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { inspectBc3Raster } from "./lib/dds-source-inspection.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const arguments_ = process.argv.slice(2);
const options = {};
for (let index = 0; index < arguments_.length; index += 2) {
  const key = arguments_[index], value = arguments_[index + 1];
  assert(["--output", "--placement-stage-root"].includes(key) && value && !value.startsWith("--")
    && !Object.hasOwn(options, key), "Expected unique --output <report-path> and/or --placement-stage-root <complete-stage>");
  options[key] = value;
}
const stageRoot = options["--placement-stage-root"] ? path.resolve(projectRoot, options["--placement-stage-root"]) : null;
if (stageRoot) assert(options["--output"], "Staged inventory requires a separate --output report");
const outputPath = path.resolve(projectRoot, options["--output"] ?? "public/maps/source-inventory-report.json");
if (stageRoot) {
  const relativeOutput = path.relative(path.join(projectRoot, "map-sources/audits"), outputPath);
  assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput), "Staged reports must stay in map-sources/audits");
  assert(!fs.existsSync(outputPath), "Preserve existing audit artifacts; choose a new report path");
}
const hashes = {};
const readBuffer = (file) => {
  const fullPath = path.resolve(projectRoot, file);
  const buffer = fs.readFileSync(fullPath);
  hashes[path.relative(projectRoot, fullPath).split(path.sep).join("/")] = createHash("sha256").update(buffer).digest("hex");
  return buffer;
};
const read = (file) => JSON.parse(readBuffer(file).toString("utf8"));
const world = read("map-sources/catalog/world-map.json");
const placements = read("map-sources/config/placement-maps.json");
const rasters = new Map(read("map-sources/config/bc3-maps.json").maps.map((map) => [map.id, map]));
const registered = new Set(readRegisteredMapIds(readBuffer("src/features/map/map-registry.ts").toString("utf8")));
const configuredIds = placements.maps.map(({ id }) => id);
assert.equal(new Set(configuredIds).size, configuredIds.length, "Duplicate placement map IDs");
assert(configuredIds.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)), "Invalid configured map ID");
assert([...registered].every((id) => configuredIds.includes(id)), "Registered map has no placement recipe");
const manifest = stageRoot ? read(path.join(stageRoot, "stage-manifest.json")) : null;
let selectedIds = registered;
if (manifest) {
  assert(["native-floor-expansion-stage", "canonical-role-stock-refresh-stage", "canonical-acquisition-search-stage",
    "canonical-navigation-repair-stage"].includes(manifest.kind), "Expected a complete canonical stage");
  assert.deepEqual([...manifest.maps].sort(), [...configuredIds].sort(), "Stage must contain the complete configured map set");
  selectedIds = new Set(manifest.maps);
  for (const id of selectedIds) for (const file of [
    `public/maps/${id}/metadata.json`, `public/maps/${id}/content.json`, `public/maps/${id}/locations.json`,
    `map-sources/catalog/${id}-placements.json`, `map-sources/catalog/${id}-placement-rejections.json`,
  ]) {
    const digest = createHash("sha256").update(readBuffer(path.join(stageRoot, file))).digest("hex");
    assert.equal(digest, manifest.outputHashes?.[file], `Changed or untracked stage file: ${file}`);
  }
}
const textureId = (source) => /([0-9a-f]{32})_0\.dds$/i.exec(source ?? "")?.[1].toLowerCase();
const rasterInspections = new Map();
const nativeTextures = new Map(read("map-sources/catalog/virtual-textures-exact.json").textures.map((texture) => [texture.textureName, texture]));
const inspectTexture = (id) => {
  if (!id) return { status: "unassigned" };
  if (!rasterInspections.has(id)) {
    const source = path.join(projectRoot, "map-sources/processed/minimaps-exact", `${id}_0.dds`);
    try {
      if (!nativeTextures.has(id)) throw new Error("Original texture descriptor is missing");
      rasterInspections.set(id, inspectBc3Raster(readBuffer(source), nativeTextures.get(id)));
    } catch (error) {
      throw new Error(`Cannot audit native texture ${id}: ${error.message}`, { cause: error });
    }
  }
  return rasterInspections.get(id);
};
const maps = placements.maps.filter((map) => selectedIds.has(map.id)).map((map) => {
  const raster = rasters.get(map.id);
  const metadata = read(`public/maps/${map.id}/metadata.json`);
  assert(raster, `Missing raster recipe: ${map.id}`);
  if (stageRoot) assert.deepEqual(metadata, read(path.join(stageRoot, `public/maps/${map.id}/metadata.json`)),
    `Current raster metadata disagrees with staged coordinate reference: ${map.id}`);
  const reference = metadata.coordinateReference.worldBounds;
  return {
    id: map.id,
    levelPattern: map.levelPattern ? new RegExp(map.levelPattern) : null,
    patches: new Set(map.sourcePatchIds ?? []),
    textures: new Set((raster?.layers ?? (raster ? [raster] : [])).map(({ source }) => textureId(source)).filter(Boolean)),
    bounds: { minX: reference.x, minZ: reference.y, maxX: reference.x + reference.width, maxZ: reference.y + reference.height },
  };
});
const patches = world.levels.flatMap((level) => level.patches.map((patch) => {
  const bounds = patch.worldBounds;
  const sourceRaster = inspectTexture(patch.gTex);
  const center = { x: bounds.centerX, z: bounds.centerY };
  const matchingMaps = maps.filter((map) => !map.levelPattern || map.levelPattern.test(level.level));
  // Placement provenance is not proof that the patch's image is rendered.
  // Only an actual raster recipe may count toward image-source coverage.
  const declaredMaps = matchingMaps.filter((map) => map.patches.has(patch.id));
  const sourceMaps = matchingMaps.filter((map) => map.textures.has(patch.gTex));
  const spatialMaps = matchingMaps.filter(({ bounds: mapBounds }) => center.x >= mapBounds.minX && center.x <= mapBounds.maxX
    && center.z >= mapBounds.minZ && center.z <= mapBounds.maxZ);
  // Containment is only a candidate relationship. It cannot prove that a
  // building interior or another floor was actually painted into the raster.
  if (sourceMaps.length && sourceRaster.status !== "visible") throw new Error(`Configured patch ${level.id}/${patch.id} has no visible native raster.`);
  const status = sourceMaps.length > 0 ? "configured-source"
    : sourceRaster.status !== "visible" ? "no-raster-source"
      : spatialMaps.length > 0 ? "requires-floor-review" : "requires-map-review";
  return {
    identity: `${level.module}/${level.level}/${patch.id}`,
    module: level.module,
    level: level.level,
    id: patch.id,
    name: patch.internalName,
    floor: patch.floor,
    buildingId: patch.buildingId,
    renderPatches: patch.renderPatches,
    texture: patch.gTex,
    sourceRaster,
    worldBounds: bounds,
    status,
    configuredMapIds: sourceMaps.map(({ id }) => id),
    declaredPlacementMapIds: declaredMaps.map(({ id }) => id),
    declaredWithoutRasterMapIds: declaredMaps.filter((map) => !map.textures.has(patch.gTex)).map(({ id }) => id),
    spatialCandidateMapIds: spatialMaps.map(({ id }) => id),
    provenance: patch.provenance,
  };
}));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: "Every extracted world-map patch, including levels without navigation portals. Configured source coverage is not a pixel/floor fidelity claim.",
  selection: { mode: stageRoot ? "complete-stage" : "registered", stageRoot, stageKind: manifest?.kind ?? null,
    mapIds: [...selectedIds], unregisteredMapIds: [...selectedIds].filter((id) => !registered.has(id)) },
  stats: {
    registeredMaps: registered.size,
    auditedMaps: maps.length,
    sourcePatches: patches.length,
    configuredSourcePatches: patches.filter(({ status }) => status === "configured-source").length,
    requiresFloorReview: patches.filter(({ status }) => status === "requires-floor-review").length,
    requiresMapReview: patches.filter(({ status }) => status === "requires-map-review").length,
    noRasterSource: patches.filter(({ status }) => status === "no-raster-source").length,
    declaredWithoutRasterAppearances: patches.reduce((sum, patch) => sum + patch.declaredWithoutRasterMapIds.length, 0),
  },
  hashes,
  patches,
};
writeGeneratedFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log("Source map inventory:", report.stats);
