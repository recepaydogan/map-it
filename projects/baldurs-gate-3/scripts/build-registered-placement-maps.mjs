import { spawn } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import { assertScriptedDestinationsReviewed, createScriptedDestinationReview } from "./lib/scripted-destination-review.mjs";
import { createReviewedDestinationCorrections } from "./lib/reviewed-destination-corrections.mjs";
import { readVerifiedSceneContentCatalog } from "./lib/scene-content-profile.mjs";

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
const finalizeOnly = arguments_.get("finalize-only") === "true";
const stageRoot = arguments_.has("stage-root") ? path.resolve(projectRoot, arguments_.get("stage-root")) : null;
const stageRecords = arguments_.get("stage-records") ?? "full";
if (!["full", "omit"].includes(stageRecords) || stageRecords === "omit" && !stageRoot) {
  throw new Error("--stage-records accepts full or omit; omit requires an isolated --stage-root");
}
if (stageRoot) {
  const auditsRoot = path.join(projectRoot, "map-sources", "audits");
  const relative = path.relative(auditsRoot, stageRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("A stage root must be a child directory of map-sources/audits");
  if (finalizeOnly) throw new Error("Staged generation cannot run published-data finalization");
}
const outputRoot = stageRoot ?? projectRoot;
const rasterOverridesRoot = arguments_.has("raster-overrides-root")
  ? fs.realpathSync(path.resolve(projectRoot, arguments_.get("raster-overrides-root"))) : null;
if (rasterOverridesRoot) {
  assert(stageRoot, "Raster overrides require isolated placement generation");
  assert(rasterOverridesRoot.startsWith(`${fs.realpathSync(path.join(projectRoot, "map-sources"))}${path.sep}`),
    "Raster overrides must stay inside map-sources");
}
const configPath = path.resolve(projectRoot, arguments_.get("config") ?? "map-sources/config/placement-maps.json");
const concurrency = Number(arguments_.get("concurrency") ?? 3);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  throw new Error("--concurrency must be an integer from 1 through 8.");
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (!Array.isArray(config.maps) || config.maps.length === 0) {
  throw new Error("The placement build config needs a non-empty maps array.");
}
const previousStageRoot = arguments_.has("previous-stage-root")
  ? path.resolve(projectRoot, arguments_.get("previous-stage-root")) : null;
const previousContentHashes = {};
let previousStageMaps = null;
if (previousStageRoot) {
  assert(stageRoot && !finalizeOnly, "Previous canonical stages are only accepted for isolated generation");
  assert.notEqual(previousStageRoot, stageRoot, "Previous and output stages must differ");
  const previousManifest = JSON.parse(fs.readFileSync(path.join(previousStageRoot, "stage-manifest.json"), "utf8"));
  assert(["native-floor-expansion-stage", "canonical-role-stock-refresh-stage", "canonical-acquisition-search-stage",
    "canonical-navigation-repair-stage", "canonical-scene-availability-review-stage", "canonical-inventory-condition-stage", "canonical-scene-item-transfer-stage", "canonical-native-raster-anchor-stage"]
    .includes(previousManifest.kind), "Previous content must be canonical");
  previousStageMaps = new Set(previousManifest.maps);
  assert(previousStageMaps.size && previousStageMaps.size === previousManifest.maps.length);
  for (const id of previousStageMaps) {
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && config.maps.some((map) => map.id === id), "Unknown previous map");
    const relativeFile = `public/maps/${id}/content.json`, file = path.join(previousStageRoot, relativeFile);
    const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert.equal(hash, previousManifest.outputHashes?.[relativeFile], `Changed previous content: ${id}`);
    previousContentHashes[file] = hash;
  }
}
const previousContentFor = (map) => {
  // A new floor inherits its parent's source-valid anchors. A floor split must
  // not change content IDs merely because its own content file does not exist.
  const base = previousStageRoot ?? projectRoot;
  for (const id of [map.id, map.floorVolumeSelection?.mapId].filter(Boolean)) {
    const file = path.join(base, "public/maps", id, "content.json");
    if (previousStageMaps ? previousStageMaps.has(id) : fs.existsSync(file)) return file;
  }
  if (previousStageRoot && map.floorVolumeSelection) throw new Error(`Previous stage has no floor parent: ${map.id}`);
  return null;
};
const requestedMapIds = new Set((arguments_.get("maps") ?? "")
  .split(",")
  .map((mapId) => mapId.trim())
  .filter(Boolean));
const debugObjectId = arguments_.get("debug-object-id");
if (requestedMapIds.size > 0) {
  const knownIds = new Set(config.maps.map((map) => map.id));
  const unknownIds = [...requestedMapIds].filter((mapId) => !knownIds.has(mapId));
  if (unknownIds.length) throw new Error(`Unknown configured map ids: ${unknownIds.join(", ")}.`);
  // New arrivals on a refreshed parent must not be deduplicated against stale
  // child exports. Rebuild all descendants from the same source catalog first.
  if (!finalizeOnly) {
    const added = [];
    for (const mapId of requestedMapIds) {
      for (const childId of config.maps.find(({ id }) => id === mapId).supersededBy ?? []) {
        if (!knownIds.has(childId)) throw new Error(`${mapId} references unknown superseding map ${childId}.`);
        if (!requestedMapIds.has(childId)) {
          requestedMapIds.add(childId);
          added.push(childId);
        }
      }
    }
    if (added.length) console.log(`Including dependent child maps: ${added.join(", ")}.`);
  }
}
const maps = requestedMapIds.size > 0
  ? config.maps.filter((map) => requestedMapIds.has(map.id))
  : config.maps;

const resolveProjectPath = (value) => path.resolve(projectRoot, value);
const storyLocationsPath = resolveProjectPath(arguments_.get("story-location-relation-catalog") ?? config.storyLocations);
const dialogCatalogPath = resolveProjectPath(arguments_.get("dialog-catalog") ?? config.dialogChecks);
const gameplayStatsPath = resolveProjectPath(arguments_.get("stats-catalog") ?? config.gameplayStats);
const sceneContentInput = arguments_.get("scene-content-catalog") ?? config.sceneContent;
const sceneContentPath = sceneContentInput ? resolveProjectPath(sceneContentInput) : null;
const equipmentItemInput = arguments_.get("equipment-item-catalog") ?? config.equipmentItems;
const equipmentItemPath = equipmentItemInput ? resolveProjectPath(equipmentItemInput) : null;
if (sceneContentPath) readVerifiedSceneContentCatalog(sceneContentPath, projectRoot);
const storyLocations = JSON.parse(fs.readFileSync(storyLocationsPath, "utf8"));
const corrections = createReviewedDestinationCorrections(config.scriptedDestinationCorrections, storyLocations);
const rebuildMapIds = new Set(maps.map(({ id }) => id));
const readPublishedEntities = (mapId) => {
  if (!config.maps.some(({ id }) => id === mapId)) throw new Error(`Correction references unknown map ${mapId}`);
  const filename = path.join(projectRoot, "public", "maps", mapId, "content.json");
  return fs.existsSync(filename) ? Object.values(JSON.parse(fs.readFileSync(filename, "utf8")).entities) : [];
};
// Run before starting any workers, so an unresolved source-rule change cannot
// partially rebuild the requested set or silently drop an existing destination.
if (!finalizeOnly) {
  const review = createScriptedDestinationReview(storyLocations);
  corrections.assertRebuildScope(rebuildMapIds, readPublishedEntities);
  for (const map of maps) {
    const filename = path.join(projectRoot, "public", "maps", map.id, "content.json");
    if (!fs.existsSync(filename)) continue;
    assertScriptedDestinationsReviewed(map.id, readPublishedEntities(map.id), review, map.excludedObjectIds, corrections);
  }
}
const buildScript = path.join(scriptDirectory, "build-placement-catalog.mjs");
const coverageAuditScript = path.join(scriptDirectory, "audit-map-coverage.mjs");
const markerAuditScript = path.join(scriptDirectory, "audit-map-marker-placement.mjs");
const retryBuffer = new Int32Array(new SharedArrayBuffer(4));
const writeFileWithRetry = (filePath, contents) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      writeGeneratedFile(filePath, contents);
      return;
    } catch (error) {
      const isTransientLock = ["EBUSY", "EPERM", "UNKNOWN"].includes(error.code);
      if (!isTransientLock || attempt === 19) throw error;
      Atomics.wait(retryBuffer, 0, 0, 250);
    }
  }
};

const buildMap = (map) => new Promise((resolve, reject) => {
  const sourceParent = config.maps.find(({ id }) => id === map.floorVolumeSelection?.mapId);
  const candidateKindOverrides = { ...sourceParent?.candidateKindOverrides, ...map.candidateKindOverrides };
  const candidateTitleOverrides = { ...sourceParent?.candidateTitleOverrides, ...map.candidateTitleOverrides };
  const placementRoot = config.placementRoots?.[map.placementRoot];
  if (!placementRoot) {
    reject(new Error(`Unknown placement root "${map.placementRoot}" for ${map.id}.`));
    return;
  }
  const overrideDirectory = rasterOverridesRoot && path.join(rasterOverridesRoot, map.id);
  const publicDirectory = overrideDirectory && fs.existsSync(overrideDirectory)
    ? fs.realpathSync(overrideDirectory) : path.join(projectRoot, "public", "maps", map.id);
  if (overrideDirectory && fs.existsSync(overrideDirectory)) {
    assert(publicDirectory.startsWith(`${rasterOverridesRoot}${path.sep}`), "Raster map escaped override root");
  }
  const outputDirectory = path.join(outputRoot, "public", "maps", map.id);
  const childArguments = [
    buildScript,
    "--placements", resolveProjectPath(placementRoot),
    "--localization-en", resolveProjectPath(config.localization.en),
    "--localization-tr", resolveProjectPath(config.localization.tr),
    "--stats-catalog", gameplayStatsPath,
    "--root-template-catalog", resolveProjectPath(config.rootTemplates),
    "--treasure-catalog", resolveProjectPath(config.treasureTables),
    "--dialog-catalog", dialogCatalogPath,
    "--dialog-item-requirement-catalog", resolveProjectPath(config.dialogItemRequirements),
    "--corpse-dialog-catalog", resolveProjectPath(config.corpseDialogs),
    "--quest-catalog", resolveProjectPath(config.questJournal),
    "--world-check-catalog", resolveProjectPath(config.worldChecks),
    "--story-risk-catalog", resolveProjectPath(config.storyRisks),
    "--permanent-bonus-catalog", resolveProjectPath(config.permanentBonuses),
    "--rescue-plan-catalog", resolveProjectPath(config.rescuePlans),
    "--party-member-catalog", resolveProjectPath(config.partyMembers),
    "--item-database", resolveProjectPath(config.itemDatabase),
    "--waypoint-catalog", resolveProjectPath(config.waypoints),
    "--navigation-portal-catalog", resolveProjectPath(config.navigationPortals),
    "--world-map-catalog", resolveProjectPath(config.worldMap ?? "map-sources/catalog/world-map.json"),
    "--inspiration-catalog", resolveProjectPath(config.inspirationEvents),
    "--puzzle-combination-catalog", resolveProjectPath(config.puzzleCombinations),
    "--readable-impact-catalog", resolveProjectPath(config.readableImpacts),
    "--item-story-impact-catalog", resolveProjectPath(config.itemStoryImpacts),
    "--story-location-relation-catalog", storyLocationsPath,
    "--scripted-destination-corrections", JSON.stringify(config.scriptedDestinationCorrections ?? []),
    "--diggable-secret-catalog", resolveProjectPath(config.diggableSecrets),
    "--mechanism-link-catalog", resolveProjectPath(config.mechanismLinks),
    "--level-transform-catalog", resolveProjectPath(config.levelTransforms),
    "--story-secret-door-catalog", resolveProjectPath(config.storySecretDoors),
    "--story-interaction-catalog", resolveProjectPath(config.storyInteractions),
    "--story-ownership-zone-catalog", resolveProjectPath(config.storyOwnershipZones),
    "--adamantine-forge-catalog", resolveProjectPath(config.adamantineForge),
    "--secret-puzzle-catalog", resolveProjectPath(config.secretPuzzles),
    "--wyrmway-puzzle-catalog", resolveProjectPath(config.wyrmwayPuzzles),
    "--creche-puzzle-catalog", resolveProjectPath(config.crechePuzzles),
    "--arcane-tower-transport-catalog", resolveProjectPath(config.arcaneTowerTransport),
    "--shar-entrance-puzzle-catalog", resolveProjectPath(config.sharEntrancePuzzle),
    "--balthazar-secret-room-catalog", resolveProjectPath(config.balthazarSecretRoom),
    "--minsc-sluice-puzzle-catalog", resolveProjectPath(config.minscSluicePuzzle),
    "--output", path.join(outputRoot, "map-sources", "catalog", `${map.id}-placements.json`),
    "--map-metadata", path.join(publicDirectory, "metadata.json"),
    "--map-overview", path.join(publicDirectory, "overview.webp"),
    "--locations-output", path.join(outputDirectory, "locations.json"),
    "--content-output", path.join(outputDirectory, "content.json"),
    "--rejections-output", path.join(outputRoot, "map-sources", "catalog", `${map.id}-placement-rejections.json`),
  ];
  const previousContent = previousContentFor(map);
  if (previousContent) {
    if (previousStageRoot) assert.equal(createHash("sha256").update(fs.readFileSync(previousContent)).digest("hex"),
      previousContentHashes[previousContent], `Previous content changed during generation: ${map.id}`);
    childArguments.push("--previous-content", previousContent);
  }
  if (map.supersededBy?.length) {
    childArguments.push("--superseding-content", JSON.stringify(map.supersededBy.map((id) =>
      path.join(outputRoot, "public", "maps", id, "content.json"))));
  }
  if (config.sceneVendors) childArguments.push("--scene-vendor-catalog", resolveProjectPath(config.sceneVendors));
  if (sceneContentPath) childArguments.push("--scene-content-catalog", sceneContentPath);
  if (equipmentItemPath) childArguments.push("--equipment-item-catalog", equipmentItemPath);
  if (Array.isArray(config.supplementaryPlacementRoots) && config.supplementaryPlacementRoots.length > 0) {
    childArguments.push("--supplementary-placements", JSON.stringify(config.supplementaryPlacementRoots.map(resolveProjectPath)));
  }
  if (Array.isArray(config.difficultyClasses) && config.difficultyClasses.length > 0) {
    childArguments.push("--difficulty-classes", JSON.stringify(config.difficultyClasses.map(resolveProjectPath)));
  }
  if (map.levelPattern) childArguments.push("--level-pattern", map.levelPattern);
  if (map.floorVolumeSelection) childArguments.push(
    "--floor-volume-selection", JSON.stringify(map.floorVolumeSelection),
    "--floor-volume-catalog", resolveProjectPath(config.floorVolumes ?? "map-sources/catalog/floor-volumes.json"),
  );
  if (map.excludeNamePattern) childArguments.push("--exclude-name-pattern", map.excludeNamePattern);
  if (Object.keys(candidateKindOverrides).length) {
    childArguments.push("--candidate-kind-overrides", JSON.stringify(candidateKindOverrides));
  }
  if (Object.keys(candidateTitleOverrides).length) {
    childArguments.push("--candidate-title-overrides", JSON.stringify(candidateTitleOverrides));
  }
  if (map.candidatePositionOverrides) {
    childArguments.push("--candidate-position-overrides", JSON.stringify(map.candidatePositionOverrides));
  }
  if (map.forcedObjectIds) {
    childArguments.push("--forced-object-ids", JSON.stringify(map.forcedObjectIds));
  }
  if (map.excludedObjectIds) {
    childArguments.push("--excluded-object-ids", JSON.stringify(map.excludedObjectIds));
  }
  const silhouetteTolerance = map.silhouetteTolerance ?? config.coverage?.silhouetteTolerance;
  const silhouetteSnapTolerance = map.silhouetteSnapTolerance ?? config.coverage?.silhouetteSnapTolerance;
  if (Number.isFinite(silhouetteTolerance)) childArguments.push("--silhouette-tolerance", String(silhouetteTolerance));
  if (Number.isFinite(silhouetteSnapTolerance)) childArguments.push("--silhouette-snap-tolerance", String(silhouetteSnapTolerance));
  if (config.coverage?.technicalLevelPattern) childArguments.push("--technical-source-level-pattern", config.coverage.technicalLevelPattern);
  if (config.coverage?.excludedSourceLevels) childArguments.push("--excluded-source-levels", JSON.stringify(config.coverage.excludedSourceLevels));
  if (config.coverage?.excludedOffMapObjectIds) childArguments.push("--reviewed-object-exclusions", JSON.stringify(config.coverage.excludedOffMapObjectIds));
  if (map.reviewedSilhouetteAdjustments) childArguments.push("--reviewed-silhouette-adjustments", JSON.stringify(map.reviewedSilhouetteAdjustments));
  if (Number.isFinite(map.minHeight)) childArguments.push("--min-height", String(map.minHeight));
  if (Number.isFinite(map.maxHeight)) childArguments.push("--max-height", String(map.maxHeight));
  if (debugObjectId) childArguments.push("--debug-object-id", debugObjectId);
  if (stageRecords === "omit") childArguments.push("--omit-records", "true");

  const child = spawn(process.execPath, childArguments, {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errorOutput = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { errorOutput += chunk; });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code !== 0) {
      reject(new Error(`${map.id} placement build failed.\n${errorOutput || output}`));
      return;
    }
    process.stdout.write(`[${map.id}] ${output}`);
    resolve();
  });
});

const runMapAudit = (script, label) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    script,
    "--placement-config", configPath,
  ], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errorOutput = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { errorOutput += chunk; });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code !== 0) {
      reject(new Error(`${label} audit failed.\n${errorOutput || output}`));
      return;
    }
    process.stdout.write(output);
    resolve();
  });
});

const pruneUnavailableRelationshipLinks = () => {
  const contentPaths = config.maps.map(({ id }) => path.join(projectRoot, "public", "maps", id, "content.json"));
  const catalogs = contentPaths.map((filePath) => ({ filePath, catalog: JSON.parse(fs.readFileSync(filePath, "utf8")) }));
  const availableContentIds = new Set(catalogs.flatMap(({ catalog }) => {
    const entities = Array.isArray(catalog.entities) ? catalog.entities : Object.values(catalog.entities ?? {});
    return entities.map(({ id }) => id);
  }));

  for (const { filePath, catalog } of catalogs) {
    const previousJson = `${JSON.stringify(catalog, null, 2)}\n`;
    const entities = Array.isArray(catalog.entities) ? catalog.entities : Object.values(catalog.entities ?? {});
    for (const entity of entities) {
      if (entity.access) {
        entity.access.related = (entity.access.related ?? [])
          .filter(({ contentId }) => availableContentIds.has(contentId));
      }
      if (entity.puzzleCombinations) {
        entity.puzzleCombinations.related = (entity.puzzleCombinations.related ?? [])
          .filter(({ contentId }) => availableContentIds.has(contentId));
      }
      if (entity.mechanism) {
        entity.mechanism.related = (entity.mechanism.related ?? [])
          .filter(({ contentId }) => availableContentIds.has(contentId));
      }
    }
    catalog.relationships = (catalog.relationships ?? [])
      .filter(({ fromId, toId }) => availableContentIds.has(fromId) && availableContentIds.has(toId));
    const nextJson = `${JSON.stringify(catalog, null, 2)}\n`;
    if (nextJson !== previousJson) writeFileWithRetry(filePath, nextJson);
  }
};

const mapDefinitions = new Map(config.maps.map((map) => [map.id, map]));
const buildDepths = new Map(), visitingMaps = new Set();
const buildDepth = (id) => {
  if (visitingMaps.has(id)) throw new Error(`Cyclic superseding maps: ${id}`);
  if (buildDepths.has(id)) return buildDepths.get(id);
  const map = mapDefinitions.get(id);
  if (!map) throw new Error(`Unknown superseding map: ${id}`);
  visitingMaps.add(id);
  const depth = Math.max(-1, ...(map.supersededBy ?? []).map(buildDepth)) + 1;
  visitingMaps.delete(id);
  buildDepths.set(id, depth);
  return depth;
};
for (const map of maps) buildDepth(map.id);
// Every child must finish before its parent chooses an uncovered story arrival.
// Keep bounded concurrency within each dependency level and drain failures.
for (const depth of finalizeOnly ? [] : [...new Set(maps.map(({ id }) => buildDepths.get(id)))].sort((a, b) => a - b)) {
  const batch = maps.filter(({ id }) => buildDepths.get(id) === depth);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
    while (nextIndex < batch.length) {
      const map = batch[nextIndex++];
      await buildMap(map);
    }
  });
  const results = await Promise.allSettled(workers);
  const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (failures.length) throw new AggregateError(failures, `${failures.length} placement build worker(s) failed.`);
}
const pruneSupersededPlacements = () => {
  // Partial rebuilds must also maintain parent/child routing invariants.
  for (const map of config.maps.filter(({ supersededBy }) => Array.isArray(supersededBy) && supersededBy.length > 0)) {
    const supersedingIds = new Set(map.supersededBy.flatMap((mapId) => {
      const contentPath = path.join(projectRoot, "public", "maps", mapId, "content.json");
      if (!fs.existsSync(contentPath)) throw new Error(`${map.id} references unavailable superseding map ${mapId}.`);
      const catalog = JSON.parse(fs.readFileSync(contentPath, "utf8"));
      const entities = Array.isArray(catalog.entities) ? catalog.entities : Object.values(catalog.entities ?? {});
      return entities.map(({ id }) => id);
    }));
    const contentPath = path.join(projectRoot, "public", "maps", map.id, "content.json");
    const locationsPath = path.join(projectRoot, "public", "maps", map.id, "locations.json");
    const placementPath = path.join(projectRoot, "map-sources", "catalog", `${map.id}-placements.json`);
    const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
    const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
    const placement = JSON.parse(fs.readFileSync(placementPath, "utf8"));
    const previousCount = content.entities.length;
    const supersededEntities = content.entities.filter(({ id }) => supersedingIds.has(id));
    const supersededTrapCount = supersededEntities.filter(({ trap }) => trap).length;
    if (!supersededEntities.length
      && !locations.locations.some(({ contentId }) => supersedingIds.has(contentId))
      && !placement.candidates.some(({ id }) => supersedingIds.has(id))) continue;

    content.entities = content.entities.filter(({ id }) => !supersedingIds.has(id));
    content.relationships = (content.relationships ?? []).filter(({ fromId }) => !supersedingIds.has(fromId));
    locations.locations = locations.locations.filter(({ contentId }) => !supersedingIds.has(contentId));
    placement.candidates = placement.candidates.filter(({ id }) => !supersedingIds.has(id));
    placement.stats.candidates = placement.candidates.length;

    writeFileWithRetry(contentPath, `${JSON.stringify(content, null, 2)}\n`);
    writeFileWithRetry(locationsPath, `${JSON.stringify(locations, null, 2)}\n`);
    writeFileWithRetry(placementPath, `${JSON.stringify(placement, null, 2)}\n`);
    console.log(`[${map.id}] Removed ${previousCount - content.entities.length} placements superseded by ${map.supersededBy.join(", ")} (${supersededTrapCount} duplicate traps).`);
  }
};

if (stageRoot) {
  // These are raw generator outputs, not a publication or a coverage pass.
  // Parent/child routing and relationship availability must be compared before
  // any staged file is promoted. Never finalize against the live output paths.
  writeGeneratedFile(path.join(stageRoot, "stage-manifest.json"), `${JSON.stringify({
    kind: "unfinalized-placement-stage", maps: maps.map(({ id }) => id), configPath, storyLocationsPath, dialogCatalogPath,
    sceneContentPath,
    equipmentItemPath,
    gameplayStatsPath,
    rasterOverridesRoot,
    recordsIncluded: stageRecords !== "omit",
    previousAnchorContext: previousStageRoot ? "canonical stage with parent-floor inheritance" : "published content with parent-floor inheritance",
    previousStageRoot,
    previousContentHashes,
    storyDestinationRouting: "superseding-map-first",
    publishedDataUnchanged: true, requiresRoutingAndConservationReview: true,
  }, null, 2)}\n`);
  console.log(`Staged raw placement data for ${maps.length} maps in ${path.relative(projectRoot, stageRoot)}. Published data and routing were not changed.`);
} else {
  pruneSupersededPlacements();
  pruneUnavailableRelationshipLinks();
  corrections.assertPublished(rebuildMapIds, readPublishedEntities);
  await runMapAudit(coverageAuditScript, "Map coverage");
  if (requestedMapIds.size === 0) await runMapAudit(markerAuditScript, "Marker placement");
  console.log(finalizeOnly ? "Placement routing and audits finalized without regenerating map data."
    : `Placement data rebuilt for ${maps.length} maps.`);
}
