import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(projectRoot, ...parts), "utf8"));
const catalog = readJson("map-sources", "catalog", "level-transforms.json");
const worldMapCatalog = readJson("map-sources", "catalog", "world-map.json");
const bc3MapConfig = readJson("map-sources", "config", "bc3-maps.json");
const placementMapConfig = readJson("map-sources", "config", "placement-maps.json");

const allTransforms = [...catalog.transforms, ...catalog.spatialTransforms];
assert.ok(catalog.stats.transforms >= 120);
assert.ok(catalog.stats.globalTransforms >= 100);
assert.ok(catalog.stats.spatialTransforms >= 5);
assert.ok(catalog.stats.spatialTransforms <= 15, "Authored template rotations must keep regions of the same level in one transform.");
assert.ok(catalog.stats.translatedLevels >= 100);
assert.equal(catalog.stats.ambiguousLevels, catalog.ambiguous.length);
assert.ok(catalog.ambiguous.every(({ id }) => !catalog.transforms.some((transform) => transform.id === id)));

// The chapel's extents trigger and its polygon crypt trigger describe the same
// level translation once polygon regions use their bounds centre.
const chapelTransform = catalog.transforms.find(({ id }) => id === "Gustav/WLD_Chapel_Push");
assert.ok(chapelTransform, "The chapel level must resolve to a single level-wide transform.");
assert.ok(Math.abs(chapelTransform.offset.x + 327.95148) < 0.001);
assert.ok(Math.abs(chapelTransform.offset.z + 291.254795) < 0.001);
assert.equal(chapelTransform.matchCount, 2);
assert.ok(chapelTransform.maxDeviation < 0.001);
assert.ok(chapelTransform.evidence.some(({ localBounds }) => localBounds.kind === "polygon"));

// The Undercity region is authored in world space: its polygon centre equals
// the world-map patch centre, so its objects must not be translated.
const undercityEvidence = allTransforms.flatMap(({ evidence }) => evidence)
  .find(({ triggerName }) => triggerName === "RegionTrigger_Undercity");
assert.ok(undercityEvidence, "The Undercity region trigger must match its world-map patch.");
assert.ok(Math.hypot(undercityEvidence.offset.x, undercityEvidence.offset.z) < 0.25);

const elfsongTransform = catalog.transforms.find(({ id }) => id === "GustavDev/BGO_ElfsongBasement_A");
assert.ok(elfsongTransform);
assert.ok(Math.abs(elfsongTransform.offset.x + 730) < 0.001);
assert.ok(Math.abs(elfsongTransform.offset.z - 525) < 0.001);
assert.ok(elfsongTransform.matchCount >= 2);
assert.ok(elfsongTransform.maxDeviation < 0.001);

for (const transform of allTransforms) {
  assert.ok(transform.evidence.length > 0);
  assert.ok(transform.maxDeviation <= 0.25);
  for (const evidence of transform.evidence) {
    const tolerance = evidence.localBounds.kind === "polygon"
      ? 1.5
      : Math.max(0.25, Math.max(evidence.dimensions.worldWidth, evidence.dimensions.worldHeight) * 0.02);
    assert.ok(evidence.dimensions.widthError <= tolerance);
    assert.ok(evidence.dimensions.heightError <= tolerance);
  }
}

const wellDepthsTransform = catalog.transforms.find(({ id }) => id === "GustavDev/BGO_WellDepths_A");
assert.ok(wellDepthsTransform, "Rotated trigger bounds must resolve the Rivington Well minimap.");
assert.equal(wellDepthsTransform.rotationQuarterTurns, 0);
assert.ok(Math.abs(wellDepthsTransform.offset.z + 889.999951) < 0.001);

const smugglerTunnelTransform = catalog.transforms.find(({ id }) => id === "GustavDev/BGO_SmugglerTunnel_A");
assert.ok(smugglerTunnelTransform, "Quarter-turned official rasters must retain a rigid placement transform.");
assert.equal(smugglerTunnelTransform.rotationQuarterTurns, 1);

const transformByTriggerId = new Map(allTransforms.flatMap((transform) => transform.evidence
  .map(({ triggerId }) => [triggerId.toLocaleLowerCase("en-US"), transform])));
const worldMapPatches = worldMapCatalog.levels.flatMap(({ patches }) => patches);
const resolvesToConfiguredLevel = (module, level, pattern, visited = new Set()) => {
  if (pattern.test(level)) return true;
  const key = `${module}/${level}`;
  if (visited.has(key)) return false;
  const nextVisited = new Set([...visited, key]);
  return catalog.templateTransforms
    .filter(({ childModule, childLevel }) => childModule === module && childLevel === level)
    .some(({ parentModule, parentLevel }) => resolvesToConfiguredLevel(parentModule, parentLevel, pattern, nextVisited));
};
let verifiedRasterSourceLevels = 0;
for (const map of bc3MapConfig.maps) {
  const placementConfig = placementMapConfig.maps.find(({ id }) => id === map.id);
  assert.ok(placementConfig, `Missing placement config for BC3 map ${map.id}.`);
  const sourcePaths = map.layers?.map(({ source }) => source) ?? [map.source];
  const sourceTextures = sourcePaths.map((sourcePath) => /([0-9a-f]{32})_0\.dds$/i.exec(sourcePath)?.[1]).filter(Boolean);
  const sourceTransforms = worldMapPatches
    .filter(({ gTex }) => sourceTextures.includes(gTex))
    .map(({ triggerId }) => transformByTriggerId.get(triggerId.toLocaleLowerCase("en-US")))
    .filter(Boolean);
  for (const transform of sourceTransforms) {
    assert.ok(
      resolvesToConfiguredLevel(transform.module, transform.level, new RegExp(placementConfig.levelPattern, "i")),
      `${map.id} excludes its exact raster source level ${transform.id}.`,
    );
    verifiedRasterSourceLevels += 1;
  }
}
assert.ok(verifiedRasterSourceLevels >= 25);

const goblinCampTransforms = allTransforms
  .filter(({ levelTransformId }) => levelTransformId === "Gustav/WLD_GoblinCamp_D");
assert.equal(goblinCampTransforms.length, 1);
assert.ok(goblinCampTransforms.some(({ offset, rotationQuarterTurns }) => rotationQuarterTurns === 1
  && Math.abs(offset.x - 311.302578) < 0.00001
  && Math.abs(offset.z + 38.361019) < 0.0001));
assert.ok(goblinCampTransforms[0].evidence.every(({ rotationSource }) => rotationSource === "template-hierarchy"));
const rootTemplates = readJson("map-sources", "catalog", "root-templates.json").templates;
const authoritativeInstances = catalog.templateTransforms.filter(({ levelIdentitySource }) => levelIdentitySource === "root-template-sublevel");
assert.ok(authoritativeInstances.length >= 800, "Template identity must use the source SubLevelName, not a display-name heuristic.");
for (const instance of authoritativeInstances) {
  assert.equal(instance.childLevel.toLowerCase(), rootTemplates[instance.templateId].subLevelName.toLowerCase());
}

const chapelPlacements = readJson("map-sources", "catalog", "chapel-refectory-placements.json");
const gateId = "1c9609ee-fc96-4826-bac1-856a609564ac";
const gate = chapelPlacements.candidates.find(({ id }) => id === gateId);
assert.ok(gate);
assert.deepEqual(gate.positionTransform?.offset, chapelTransform.offset);
assert.ok(Math.abs(gate.position.x + 173.41992) < 0.0001);
assert.ok(Math.abs(gate.position.z + 303.14426) < 0.0001);
const chapelMetadata = readJson("public", "maps", "chapel-refectory", "metadata.json");
assert.ok(gate.mapPosition.x >= chapelMetadata.bounds.minX && gate.mapPosition.x <= chapelMetadata.bounds.maxX);
assert.ok(gate.mapPosition.y >= chapelMetadata.bounds.minY && gate.mapPosition.y <= chapelMetadata.bounds.maxY);

const chapelContent = readJson("public", "maps", "chapel-refectory", "content.json");
const chapelEntities = new Map(chapelContent.entities.map((entity) => [entity.id, entity]));
for (const id of [
  gateId,
  "41140570-efdb-44d0-8943-8ea29584dd42",
  "7c41cd46-c233-438c-ad5b-03d79cac9a44",
]) {
  assert.ok(chapelEntities.has(id), `Missing transformed chapel mechanism ${id}.`);
}

const prisonMetadata = readJson("public", "maps", "house-of-hope-prison", "metadata.json");
assert.equal(prisonMetadata.bounds.maxX, 2603);
assert.equal(prisonMetadata.bounds.maxY, 2764);
assert.ok(Math.abs(prisonMetadata.coordinateReference.worldBounds.width - 130.1412025) < 0.0001);
assert.ok(Math.abs(prisonMetadata.coordinateReference.worldBounds.height - 138.19965) < 0.0001);
const prisonLocations = readJson("public", "maps", "house-of-hope-prison", "locations.json").locations;
for (const id of [
  "74f9b2b5-204c-4f8c-9fef-499c67ab3ac0",
  "4c8ad2ce-685a-4afc-9de2-e2f259f9b214",
  "641d6a8a-1376-4232-a65f-71e06d3b48dd",
]) {
  const location = prisonLocations.find((entry) => entry.id === id);
  assert.ok(location, `Missing House of Hope prison mechanism ${id}.`);
  assert.ok(location.x > 1400 && location.x < 1650);
  assert.ok(location.y > 1300 && location.y < 1550);
}

const defiledTempleContent = readJson("public", "maps", "defiled-temple", "content.json");
const templeDoor = defiledTempleContent.entities.find(({ id }) => id === "7241f91d-e34f-4615-b484-3b338c109d55");
assert.ok(templeDoor?.hiddenPassage, "The Temple Access door must use the authored level rotation.");
assert.ok(templeDoor.worldPosition.x > 436 && templeDoor.worldPosition.x < 437);
assert.ok(templeDoor.worldPosition.z > 71 && templeDoor.worldPosition.z < 74);
assert.ok(readJson("public", "maps", "morphic-pool", "locations.json").locations.length >= 10,
  "Objects outside known spatial-transform regions must retain their authored world coordinates.");

for (const { id, mapId, absentFromMaps } of placementMapConfig.coverage.markerPlacementExpectations ?? []) {
  const locations = readJson("public", "maps", mapId, "locations.json").locations;
  assert.ok(locations.some(({ contentId }) => contentId === id), `Expected routed marker ${id} in ${mapId}.`);
  for (const otherMapId of absentFromMaps) {
    const otherLocations = readJson("public", "maps", otherMapId, "locations.json").locations;
    assert.ok(!otherLocations.some(({ contentId }) => contentId === id), `Raw local coordinates leaked ${id} into ${otherMapId}.`);
  }
}

console.log(`Level transforms: ${catalog.stats.globalTransforms} global and ${catalog.stats.spatialTransforms} spatial transforms across ${catalog.stats.translatedLevels} translated streaming levels verified.`);
