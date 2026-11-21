import fs from "node:fs";
import { writeGeneratedFile, withTransientFileRetry } from "./lib/write-generated-file.mjs";
import path from "node:path";
import sharp from "sharp";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { createFloorSelector } from "./lib/floor-volume.mjs";
import { verifyNativeEntranceAnchor } from "./lib/native-entrance-audit.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const publicMapsRoot = path.join(projectRoot, "public", "maps");
const catalogRoot = path.join(projectRoot, "map-sources", "catalog");
const overrideArgument = process.argv.indexOf("--raster-overrides-root");
const outputArgument = process.argv.indexOf("--output");
const placementStageArgument = process.argv.indexOf("--placement-stage-root");
const placementStageRoot = placementStageArgument >= 0
  ? path.resolve(projectRoot, process.argv[placementStageArgument + 1]) : null;
if (placementStageRoot && outputArgument < 0) throw new Error("A staged placement audit requires a separate --output report.");
const placementStageManifest = placementStageRoot
  ? JSON.parse(fs.readFileSync(path.join(placementStageRoot, "stage-manifest.json"), "utf8")) : null;
const placementStageMaps = new Set(placementStageManifest?.maps ?? []);
const overrideMapsArgument = process.argv.indexOf("--raster-overrides-maps");
const overrideMapIds = overrideMapsArgument >= 0
  ? new Set(process.argv[overrideMapsArgument + 1].split(",").filter(Boolean)) : null;
const rasterOverridesRoot = overrideArgument >= 0
  ? path.resolve(projectRoot, process.argv[overrideArgument + 1]) : null;
if (rasterOverridesRoot && outputArgument < 0) {
  throw new Error("A staged raster audit requires a separate --output report.");
}
const rasterOverrideMaps = [];
const configArgument = process.argv.indexOf("--placement-config");
const placementConfig = JSON.parse(fs.readFileSync(
  configArgument >= 0
    ? path.resolve(projectRoot, process.argv[configArgument + 1])
    : path.join(projectRoot, "map-sources", "config", "placement-maps.json"),
  "utf8",
));
const registrySource = fs.readFileSync(
  path.join(projectRoot, "src", "features", "map", "map-registry.ts"),
  "utf8",
);
const registeredMapIds = readRegisteredMapIds(registrySource);
let mapIds = registeredMapIds;
const completeStageKinds = ["native-floor-expansion-stage", "canonical-role-stock-refresh-stage", "canonical-acquisition-search-stage", "canonical-navigation-repair-stage", "reconciled-placement-review-stage"];
if (completeStageKinds.includes(placementStageManifest?.kind)) {
  // A complete floor expansion may contain not-yet-registered maps. Require
  // its full configured set and immutable outputs, never a partial substitute.
  const configuredIds = placementConfig.maps.map(({ id }) => id);
  assert.deepEqual([...placementStageMaps].sort(), [...configuredIds].sort());
  assert.equal(placementStageMaps.size, placementStageManifest.maps.length);
  assert(registeredMapIds.every((id) => placementStageMaps.has(id)));
  assert(configuredIds.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
  for (const id of configuredIds) for (const file of [
    `public/maps/${id}/metadata.json`, `public/maps/${id}/content.json`, `public/maps/${id}/locations.json`,
    `map-sources/catalog/${id}-placements.json`, `map-sources/catalog/${id}-placement-rejections.json`,
  ]) {
    assert.equal(createHash("sha256").update(fs.readFileSync(path.join(placementStageRoot, file))).digest("hex"),
      placementStageManifest.outputHashes?.[file], `Changed or untracked stage file: ${file}`);
  }
  mapIds = [...registeredMapIds, ...configuredIds.filter((id) => !registeredMapIds.includes(id))];
}
if (placementStageManifest && (!["unfinalized-placement-stage", "routed-placement-stage", "stat-expression-map-refresh-stage", "native-navigation-refresh-stage"].includes(placementStageManifest.kind)
  && !completeStageKinds.includes(placementStageManifest.kind)
  || !placementStageMaps.size || [...placementStageMaps].some((id) => !mapIds.includes(id)))) {
  throw new Error("Invalid placement-stage manifest or unknown staged map IDs");
}
if (overrideMapIds && (!rasterOverridesRoot || [...overrideMapIds].some((id) => !mapIds.includes(id)))) {
  throw new Error("Raster override map IDs require an override root and registered maps");
}
const tolerance = placementConfig.coverage?.silhouetteTolerance ?? 24;
if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 128) {
  throw new Error("The silhouette audit tolerance must be an integer from 0 through 128.");
}
const technicalLevelPattern = new RegExp(
  placementConfig.coverage?.technicalLevelPattern ?? "(?:^|_)(?:CIN|Cinematic)(?:_|$)",
  "i",
);

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const acceptedMapsById = new Map();
const publishedOutside = [];
const publishedOnTransparentPixels = [];
let transparentPublishedMarkers = 0;
let publishedMarkers = 0;

const isVisibleWithin = (mask, centerX, centerY, maximumRadius) => {
  for (let radius = 0; radius <= maximumRadius; radius += 1) {
    for (let deltaY = -radius; deltaY <= radius; deltaY += 1) {
      for (const deltaX of radius === 0 ? [0] : [-radius, radius]) {
        const x = centerX + deltaX;
        const y = centerY + deltaY;
        if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) continue;
        if (mask.data[(y * mask.width + x) * mask.channels + 3] > 16) return true;
      }
    }
    for (let deltaX = -radius + 1; deltaX < radius; deltaX += 1) {
      for (const deltaY of [-radius, radius]) {
        const x = centerX + deltaX;
        const y = centerY + deltaY;
        if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) continue;
        if (mask.data[(y * mask.width + x) * mask.channels + 3] > 16) return true;
      }
    }
  }
  return false;
};

for (const mapId of mapIds) {
  const mapRoot = path.join(publicMapsRoot, mapId);
  const stagedRoot = rasterOverridesRoot && (!overrideMapIds || overrideMapIds.has(mapId)) && path.join(rasterOverridesRoot, mapId);
  const rasterRoot = stagedRoot && fs.existsSync(stagedRoot) ? stagedRoot : mapRoot;
  if (rasterRoot !== mapRoot) rasterOverrideMaps.push(mapId);
  const metadata = readJson(path.join(rasterRoot, "metadata.json"));
  const locationRoot = placementStageMaps.has(mapId) ? path.join(placementStageRoot, "public/maps", mapId) : mapRoot;
  const locations = readJson(path.join(locationRoot, "locations.json")).locations ?? [];
  publishedMarkers += locations.length;
  const { data, info } = await sharp(path.join(rasterRoot, "overview.webp"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = { data, width: info.width, height: info.height, channels: info.channels };
  const imageBounds = metadata.coordinateReference?.imageBounds ?? metadata.bounds;
  const imageWidth = imageBounds.width ?? imageBounds.maxX - imageBounds.minX;
  const imageHeight = imageBounds.height ?? imageBounds.maxY - imageBounds.minY;
  const imageX = imageBounds.x ?? imageBounds.minX;
  const imageY = imageBounds.y ?? imageBounds.minY;
  for (const location of locations) {
    const maps = acceptedMapsById.get(location.contentId) ?? new Set();
    maps.add(mapId);
    acceptedMapsById.set(location.contentId, maps);
    const centerX = Math.round((location.x - imageX) / imageWidth * (mask.width - 1));
    const centerY = Math.round((location.y - imageY) / imageHeight * (mask.height - 1));
    if (!isVisibleWithin(mask, centerX, centerY, 0)) {
      transparentPublishedMarkers += 1;
      publishedOnTransparentPixels.push({ mapId, id: location.id, title: location.name });
    }
    if (!isVisibleWithin(mask, centerX, centerY, tolerance)) {
      publishedOutside.push({
        mapId,
        id: location.id,
        contentId: location.contentId,
        title: location.name,
        category: location.category,
        mapPosition: { x: location.x, y: location.y },
      });
    }
  }
}

const rejectedById = new Map();
const adjustedCandidates = [];
const verifiedNativeAnchors = new Set();
const mapsMissingRejectionCatalogs = [];
for (const mapId of mapIds) {
  const rejectionRoot = placementStageMaps.has(mapId) ? path.join(placementStageRoot, "map-sources/catalog") : catalogRoot;
  const rejectionPath = path.join(rejectionRoot, `${mapId}-placement-rejections.json`);
  if (!fs.existsSync(rejectionPath)) {
    mapsMissingRejectionCatalogs.push(mapId);
    continue;
  }
  const rejectionCatalog = readJson(rejectionPath);
  const nativeAnchors = (rejectionCatalog.adjustedCandidates ?? []).filter(({ adjustment }) => adjustment.kind === "native-navigation-entrance");
  if (nativeAnchors.length) {
    const directory = placementStageMaps.has(mapId) ? path.join(placementStageRoot, "public/maps", mapId) : path.join(publicMapsRoot, mapId);
    const candidates = readJson(path.join(rejectionRoot, `${mapId}-placements.json`)).candidates;
    const locations = readJson(path.join(directory, "locations.json")).locations;
    const useOverride = rasterOverridesRoot && (!overrideMapIds || overrideMapIds.has(mapId))
      && fs.existsSync(path.join(rasterOverridesRoot, mapId));
    const rasterRoot = path.join(useOverride ? rasterOverridesRoot : publicMapsRoot, mapId);
    const metadata = readJson(path.join(rasterRoot, "metadata.json"));
    const { data, info } = await sharp(path.join(rasterRoot, "overview.webp")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const selection = placementConfig.maps.find(({ id }) => id === mapId)?.floorVolumeSelection;
    const onFloor = createFloorSelector(selection, selection
      ? readJson(path.resolve(projectRoot, placementConfig.floorVolumes ?? "map-sources/catalog/floor-volumes.json")) : null);
    for (const row of nativeAnchors) {
      const candidate = candidates.find(({ id }) => id === row.id), location = locations.find(({ id }) => id === row.id);
      assert(candidate && location, `Native entrance anchor has no published candidate: ${mapId}/${row.id}`);
      assert.deepEqual(candidate.mapPositionAdjustment, row.adjustment);
      assert.deepEqual(candidate.mapPosition, { x: location.x, y: location.y });
      verifyNativeEntranceAnchor(candidate, { readJson, sourceRoot: path.join(projectRoot, "map-sources/converted/navigation-portals"),
        reference: metadata.coordinateReference, mask: { data, width: info.width, height: info.height, channels: info.channels }, onFloor });
      verifiedNativeAnchors.add(`${mapId}/${row.id}`);
    }
  }
  adjustedCandidates.push(...(rejectionCatalog.adjustedCandidates ?? []).map((candidate) => ({ mapId, ...candidate })));
  for (const candidate of rejectionCatalog.rejectedCandidates ?? []) {
    const entry = rejectedById.get(candidate.id) ?? { ...candidate, rejectedFromMaps: [] };
    entry.rejectedFromMaps.push(mapId);
    rejectedById.set(candidate.id, entry);
  }
}

const unresolvedRejected = [...rejectedById.values()]
  .filter(({ id }) => !acceptedMapsById.has(id))
  .map((candidate) => ({
    ...candidate,
    rejectedFromMaps: [...new Set(candidate.rejectedFromMaps)].sort((left, right) => left.localeCompare(right, "en")),
  }))
  .sort((left, right) => left.level.localeCompare(right.level, "en")
    || left.title.localeCompare(right.title, "en"));
const isTechnical = ({ level, authoredLevel }) => technicalLevelPattern.test(authoredLevel ?? level);
const technicalRejected = unresolvedRejected.filter(isTechnical);
const reviewedExcluded = unresolvedRejected.filter((candidate) => !isTechnical(candidate) && candidate.exclusionReason);
const actionableRejected = unresolvedRejected.filter((candidate) => !isTechnical(candidate) && !candidate.exclusionReason);
const routingViolations = (placementConfig.coverage?.markerPlacementExpectations ?? []).flatMap(({ id, mapId, absentFromMaps }) => {
  const actualMaps = acceptedMapsById.get(id) ?? new Set();
  return [
    ...(!actualMaps.has(mapId) ? [{ id, mapId, reason: "missing-expected-map" }] : []),
    ...(absentFromMaps ?? []).filter((otherMapId) => actualMaps.has(otherMapId))
      .map((otherMapId) => ({ id, mapId: otherMapId, reason: "unexpected-map" })),
  ];
});
const unreviewedAdjustments = adjustedCandidates.filter(({ mapId, id, adjustment }) =>
  adjustment.kind === "native-navigation-entrance" ? !verifiedNativeAnchors.has(`${mapId}/${id}`)
    : !adjustment.reviewReason || (adjustment.distance > tolerance
      && !placementConfig.maps.find((map) => map.id === mapId)?.reviewedSilhouetteAdjustments?.[id]));
const publishedExcludedObjects = Object.keys(placementConfig.coverage?.excludedOffMapObjectIds ?? {})
  .filter((id) => acceptedMapsById.has(id));

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  tolerance,
  ...(rasterOverridesRoot ? { rasterOverridesRoot, rasterOverrideMaps } : {}),
  ...(placementStageRoot ? { placementStageRoot, placementStageMaps: [...placementStageMaps],
    scope: `Staged placements (${placementStageManifest.kind}) overlaid on published rasters; silhouette and configured routing audit, not proof of complete source coverage or publication readiness.` } : {}),
  stats: {
    registeredMaps: registeredMapIds.length,
    auditedMaps: mapIds.length,
    publishedMarkers,
    uniquePublishedContentIds: acceptedMapsById.size,
    transparentPublishedMarkers,
    distantPublishedMarkers: publishedOutside.length,
    rejectedCandidateIds: rejectedById.size,
    unresolvedRejectedCandidates: unresolvedRejected.length,
    actionableRejectedCandidates: actionableRejected.length,
    technicalRejectedCandidates: technicalRejected.length,
    reviewedExcludedCandidates: reviewedExcluded.length,
    adjustedCandidates: adjustedCandidates.length,
    nativeNavigationEntranceAnchors: verifiedNativeAnchors.size,
    boundaryAnchoredCandidates: adjustedCandidates.filter(({ adjustment }) => adjustment.kind !== "native-navigation-entrance" && adjustment.distance <= tolerance).length,
    reviewedAnchoredCandidates: adjustedCandidates.filter(({ adjustment }) => adjustment.kind !== "native-navigation-entrance" && adjustment.distance > tolerance).length,
    routingViolations: routingViolations.length,
    unreviewedAdjustments: unreviewedAdjustments.length,
    publishedExcludedObjects: publishedExcludedObjects.length,
    mapsMissingRejectionCatalogs: mapsMissingRejectionCatalogs.length,
  },
  mapsMissingRejectionCatalogs,
  publishedOutside,
  publishedOnTransparentPixels,
  actionableRejected,
  technicalRejected,
  reviewedExcluded,
  adjustedCandidates,
  routingViolations,
  unreviewedAdjustments,
  publishedExcludedObjects,
};
const outputPath = outputArgument >= 0 ? path.resolve(projectRoot, process.argv[outputArgument + 1])
  : path.join(publicMapsRoot, "marker-placement-report.json");
const reportJson = `${JSON.stringify(report, null, 2)}\n`;
await withTransientFileRetry(() => writeGeneratedFile(outputPath, reportJson), {
  onRetry: (error, attempt) => console.warn(`Retrying marker report after ${error.code} (attempt ${attempt}).`),
});

console.log(`Marker placement audit: ${publishedOutside.length} distant published, ${actionableRejected.length} unresolved playable, ${technicalRejected.length} technical/staging rejected.`);
if (mapsMissingRejectionCatalogs.length > 0) {
  throw new Error(`Marker audit is incomplete: missing rejection catalogs for ${mapsMissingRejectionCatalogs.join(", ")}.`);
}
if (routingViolations.length || unreviewedAdjustments.length || publishedExcludedObjects.length) {
  throw new Error(`Marker provenance regressed: ${routingViolations.length} routing violations, ${unreviewedAdjustments.length} unreviewed adjustments, ${publishedExcludedObjects.length} excluded objects published.`);
}
const maximumDistant = placementConfig.coverage?.maximumDistantPublishedMarkers;
if (Number.isInteger(maximumDistant) && publishedOutside.length > maximumDistant) {
  throw new Error(`Marker placement regressed: ${publishedOutside.length} distant published markers exceeds ${maximumDistant}.`);
}
const maximumTransparent = placementConfig.coverage?.maximumTransparentPublishedMarkers;
if (Number.isInteger(maximumTransparent) && transparentPublishedMarkers > maximumTransparent) {
  throw new Error(`Marker anchors regressed: ${transparentPublishedMarkers} pin centers on transparent pixels exceeds ${maximumTransparent}.`);
}
const maximumActionable = placementConfig.coverage?.maximumUnresolvedPlayableMarkers;
if (Number.isInteger(maximumActionable) && actionableRejected.length > maximumActionable) {
  throw new Error(`Marker routing regressed: ${actionableRejected.length} unresolved playable markers exceeds ${maximumActionable}.`);
}
