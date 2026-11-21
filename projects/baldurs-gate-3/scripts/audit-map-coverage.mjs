import fs from "node:fs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPortalEndpointNormalizer } from "./lib/navigation-portal.mjs";
import { createFloorSelector } from "./lib/floor-volume.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    result.set(key.slice(2), value);
  }
  return result;
};

const arguments_ = parseArguments(process.argv.slice(2));
const resolveProjectPath = (value) => path.resolve(projectRoot, value);
const readJson = (value) => JSON.parse(fs.readFileSync(resolveProjectPath(value), "utf8"));
const writeRetryBuffer = new Int32Array(new SharedArrayBuffer(4));
const writeFileWithRetry = (filePath, contents) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      writeGeneratedFile(filePath, contents);
      return;
    } catch (error) {
      const transientLock = ["EBUSY", "EPERM", "UNKNOWN"].includes(error.code);
      if (!transientLock || attempt === 19) throw error;
      Atomics.wait(writeRetryBuffer, 0, 0, 250);
    }
  }
};

const placementConfigPath = arguments_.get("placement-config") ?? "map-sources/config/placement-maps.json";
const rasterConfigPath = arguments_.get("raster-config") ?? "map-sources/config/bc3-maps.json";
const navigationPortalPath = arguments_.get("navigation-portals") ?? "map-sources/catalog/navigation-portals.json";
const worldMapPath = arguments_.get("world-map") ?? "map-sources/catalog/world-map.json";
const outputPath = resolveProjectPath(arguments_.get("output") ?? "public/maps/coverage-report.json");

const placementConfig = readJson(placementConfigPath);
const floorVolumeCatalog = placementConfig.maps.some((map) => map.floorVolumeSelection)
  ? readJson(placementConfig.floorVolumes ?? "map-sources/catalog/floor-volumes.json") : null;
const rasterConfig = readJson(rasterConfigPath);
const navigationPortalCatalog = readJson(navigationPortalPath);
const worldMapCatalog = readJson(worldMapPath);
const normalizePortalEndpoint = createPortalEndpointNormalizer(worldMapCatalog, readJson(placementConfig.levelTransforms));
const rasterMapsById = new Map((rasterConfig.maps ?? []).map((map) => [map.id, map]));

const patchesById = new Map();
const patchesByTexture = new Map();
for (const level of worldMapCatalog.levels ?? []) {
  for (const patch of level.patches ?? []) {
    const normalizedPatch = { ...patch, module: level.module, level: level.level };
    patchesById.set(patch.id, [...(patchesById.get(patch.id) ?? []), normalizedPatch]);
    if (patch.gTex) {
      const matches = patchesByTexture.get(patch.gTex) ?? [];
      matches.push(normalizedPatch);
      patchesByTexture.set(patch.gTex, matches);
    }
  }
}

const sourceTextureId = (source) => /([0-9a-f]{32})_0\.dds$/i.exec(source ?? "")?.[1].toLowerCase() ?? null;

const configuredMaps = (placementConfig.maps ?? []).map((map) => {
  const rasterMap = rasterMapsById.get(map.id);
  const metadataPath = path.join(projectRoot, "public", "maps", map.id, "metadata.json");
  const metadataBounds = !rasterMap && fs.existsSync(metadataPath)
    ? JSON.parse(fs.readFileSync(metadataPath, "utf8")).coordinateReference?.worldBounds
    : null;
  const bounds = rasterMap
    ? Array.isArray(rasterMap.layers)
      ? rasterMap.layers.map((layer) => layer.worldBounds)
      : [rasterMap.worldBounds]
    : metadataBounds ? [{
      centerX: metadataBounds.x + metadataBounds.width / 2,
      centerY: metadataBounds.y + metadataBounds.height / 2,
      width: metadataBounds.width,
      height: metadataBounds.height,
    }] : [];
  if (bounds.some((candidate) => !candidate)) {
    throw new Error(`Raster map ${map.id} has no auditable world bounds.`);
  }
  if (bounds.length === 0) throw new Error(`Placement map ${map.id} has no raster configuration or public metadata.`);
  const levelPattern = map.levelPattern ? new RegExp(map.levelPattern) : null;
  const configuredPatchIds = new Set(map.sourcePatchIds ?? []);
  const textureIds = rasterMap
    ? (Array.isArray(rasterMap.layers) ? rasterMap.layers.map(({ source }) => source) : [rasterMap.source])
      .map(sourceTextureId)
      .filter(Boolean)
    : [];
  for (const textureId of textureIds) {
    for (const patch of patchesByTexture.get(textureId) ?? []) {
      if (!levelPattern || levelPattern.test(patch.level)) configuredPatchIds.add(patch.id);
    }
  }
  for (const patchId of configuredPatchIds) {
    if (!patchesById.has(patchId)) throw new Error(`Map ${map.id} references unknown source patch ${patchId}.`);
  }
  return {
    id: map.id,
    levelPattern,
    minHeight: Number.isFinite(map.minHeight) ? map.minHeight : null,
    maxHeight: Number.isFinite(map.maxHeight) ? map.maxHeight : null,
    hasFloorSelection: Boolean(map.floorVolumeSelection),
    matchesFloor: createFloorSelector(map.floorVolumeSelection, floorVolumeCatalog),
    bounds,
    patchIds: configuredPatchIds,
  };
});

const containsPosition = (bounds, position) => position.x >= bounds.centerX - bounds.width / 2
  && position.x <= bounds.centerX + bounds.width / 2
  && position.z >= bounds.centerY - bounds.height / 2
  && position.z <= bounds.centerY + bounds.height / 2;

const regionMapOverrides = placementConfig.coverage?.regionMapOverrides ?? {};
const mapsCovering = (portal, position, regionId) => {
  const spatialMatches = configuredMaps.filter((map) => (!map.levelPattern || map.levelPattern.test(portal.level))
    && (map.minHeight === null || position.y >= map.minHeight)
    && (map.maxHeight === null || position.y <= map.maxHeight)
    && map.matchesFloor(position)
    && map.bounds.some((bounds) => containsPosition(bounds, position)));

  const overrideIds = new Set(regionMapOverrides[regionId] ?? []);
  const overriddenMatches = spatialMatches.filter(({ id }) => overrideIds.has(id));
  if (overriddenMatches.length > 0) {
    return overriddenMatches.map(({ id }) => id).sort((left, right) => left.localeCompare(right, "en"));
  }

  // A height-bounded raster represents a specific floor. When one contains an
  // endpoint it wins over a broad parent-region raster at the same X/Z.
  const floorMatches = spatialMatches.filter((map) => (map.hasFloorSelection || map.minHeight !== null || map.maxHeight !== null)
    && [...map.patchIds].some((patchId) => {
      return (patchesById.get(patchId) ?? []).some((patch) => (!map.levelPattern || map.levelPattern.test(patch.level))
        && containsPosition(patch.worldBounds, position));
    }));
  if (floorMatches.length > 0) {
    return floorMatches.map(({ id }) => id).sort((left, right) => left.localeCompare(right, "en"));
  }

  const exactPatchMatches = spatialMatches.filter(({ patchIds }) => patchIds.has(regionId));
  if (exactPatchMatches.length > 0) {
    return exactPatchMatches.map(({ id }) => id).sort((left, right) => left.localeCompare(right, "en"));
  }

  // Navigation regions that have no world-map patch identity can only be
  // resolved spatially. Known patch UUIDs never take this fallback, which is
  // what prevents one floor from masquerading as another at the same X/Z.
  if (patchesById.has(regionId)) return [];
  return spatialMatches
    .map(({ id }) => id)
    .sort((left, right) => left.localeCompare(right, "en"));
};

const describePatch = (portal, regionId) => {
  if (!regionId) return null;
  const candidates = patchesById.get(regionId) ?? [];
  const matchingLevel = candidates.filter((patch) => patch.level === portal.level && patch.module === portal.module);
  const patch = matchingLevel.length === 1 ? matchingLevel[0] : candidates.length === 1 ? candidates[0] : null;
  if (!patch) return null;
  return {
    id: patch.id,
    module: patch.module,
    level: patch.level,
    internalName: patch.internalName,
    texture: patch.gTex ? `${patch.gTex}_0.dds` : null,
    worldBounds: patch.worldBounds,
  };
};

const inspectedPortals = [];
const invalidPortals = [];
const excludedPortalIds = placementConfig.coverage?.excludedPortalIds ?? {};
for (const key of Object.keys(excludedPortalIds)) {
  if (key.split("/").length !== 3) {
    throw new Error(`Portal exclusion ${key} must identify module/level/UUID, not a reusable UUID alone.`);
  }
}
const excludedPortals = [];
const technicalLevelPattern = placementConfig.coverage?.technicalLevelPattern
  ? new RegExp(placementConfig.coverage.technicalLevelPattern) : null;
for (const portal of navigationPortalCatalog.portals ?? []) {
  if (!portal.sourcePosition || !portal.targetPosition) {
    invalidPortals.push({ id: portal.id, module: portal.module, level: portal.level, reason: "Missing source or target coordinates." });
    continue;
  }
  const exclusionReason = excludedPortalIds[`${portal.module}/${portal.level}/${portal.id}`]
    ?? placementConfig.coverage?.excludedSourceLevels?.[portal.level]
    ?? (technicalLevelPattern?.test(portal.level) ? "Cinematic/staging source level, not a playable map placement." : null);
  if (exclusionReason) {
    excludedPortals.push({ id: portal.id, module: portal.module, level: portal.level, reason: exclusionReason });
    continue;
  }
  const sourceEndpoint = normalizePortalEndpoint(portal, portal.sourcePosition, portal.sourceRegionId);
  const targetEndpoint = normalizePortalEndpoint(portal, portal.targetPosition, portal.targetRegionId);
  const sourcePosition = sourceEndpoint.position;
  const targetPosition = targetEndpoint.position;
  const sourceMapIds = mapsCovering({ ...portal, level: sourceEndpoint.level ?? portal.level }, sourcePosition, portal.sourceRegionId);
  const targetMapIds = mapsCovering({ ...portal, level: targetEndpoint.level ?? portal.level }, targetPosition, portal.targetRegionId);
  inspectedPortals.push({
    id: portal.id,
    module: portal.module,
    level: portal.level,
    source: {
      position: sourcePosition,
      authoredPosition: portal.sourcePosition,
      transformId: sourceEndpoint.transformId,
      coordinateSpace: sourceEndpoint.coordinateSpace,
      worldLevel: sourceEndpoint.level ?? portal.level,
      regionId: portal.sourceRegionId ?? null,
      mapIds: sourceMapIds,
      suggestedPatch: sourceMapIds.length === 0 ? describePatch(portal, portal.sourceRegionId) : null,
    },
    target: {
      position: targetPosition,
      authoredPosition: portal.targetPosition,
      transformId: targetEndpoint.transformId,
      coordinateSpace: targetEndpoint.coordinateSpace,
      worldLevel: targetEndpoint.level ?? portal.level,
      regionId: portal.targetRegionId ?? null,
      mapIds: targetMapIds,
      suggestedPatch: targetMapIds.length === 0 ? describePatch(portal, portal.targetRegionId) : null,
    },
    status: sourceMapIds.length > 0 && targetMapIds.length > 0 ? "covered" : "missing-map",
  });
}

inspectedPortals.sort((left, right) => left.id.localeCompare(right.id, "en"));
const gaps = inspectedPortals.filter(({ status }) => status === "missing-map");
const suggestedPatches = [...new Map(gaps.flatMap(({ source, target }) => [source, target])
  .map(({ suggestedPatch }) => suggestedPatch)
  .filter(Boolean)
  .map((patch) => [`${patch.module}/${patch.level}/${patch.id}`, patch])).values()]
  .sort((left, right) => left.internalName.localeCompare(right.internalName, "en"));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileWithRetry(outputPath, `${JSON.stringify({
  schemaVersion: 3,
  stats: {
    sourcePortals: (navigationPortalCatalog.portals ?? []).length,
    registeredMaps: configuredMaps.length,
    registeredSourcePatches: new Set(configuredMaps.flatMap(({ patchIds }) => [...patchIds])).size,
    heightSlicedMaps: configuredMaps.filter(({ minHeight, maxHeight, hasFloorSelection }) => hasFloorSelection || minHeight !== null || maxHeight !== null).length,
    inspectedPortals: inspectedPortals.length,
    coveredPortals: inspectedPortals.length - gaps.length,
    missingMapPortals: gaps.length,
    suggestedMapPatches: suggestedPatches.length,
    excludedTechnicalPortals: excludedPortals.length,
    invalidSourcePortals: invalidPortals.length,
    whollyUnmappedPortals: gaps.filter(({ source, target }) => source.mapIds.length === 0 && target.mapIds.length === 0).length,
  },
  invalidPortals,
  excludedPortals,
  suggestedPatches,
  portals: inspectedPortals,
}, null, 2)}\n`);

console.log(`Map coverage audit: ${inspectedPortals.length - gaps.length} covered portals, ${gaps.length} missing-map portals, ${excludedPortals.length} reviewed technical portals excluded.`);
if (invalidPortals.length > 0) throw new Error(`Map coverage has ${invalidPortals.length} invalid source portal records.`);
const maximumMissingMapPortals = placementConfig.coverage?.maximumMissingMapPortals;
if (Number.isInteger(maximumMissingMapPortals) && gaps.length > maximumMissingMapPortals) {
  throw new Error(`Map coverage regressed: ${gaps.length} missing-map portals exceeds the configured maximum of ${maximumMissingMapPortals}.`);
}
