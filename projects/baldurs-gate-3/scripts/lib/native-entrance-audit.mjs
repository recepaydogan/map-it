import assert from "node:assert/strict";
import path from "node:path";

// Read native endpoint evidence independently of portal resolution and rendering.
// Callers provide the actual map mask and their own floor-containment check.
export const verifyNativeEntranceAnchor = (candidate, { readJson, sourceRoot, reference, mask, onFloor }) => {
  const adjustment = candidate.mapPositionAdjustment, portal = candidate.navigationPortal;
  assert.equal(adjustment?.kind, "native-navigation-entrance");
  assert(portal && !portal.actionBinding);
  assert.equal(portal.id, candidate.id);
  assert.equal(portal.module, candidate.module); assert.equal(portal.level, candidate.level);
  assert.equal(portal.sourceWorldLevel, candidate.level);
  assert.equal(portal.sourceCoordinateSpace, "world-region"); assert.equal(portal.sourceTransformId, null);
  assert.equal(portal.instanceId, `${candidate.module}/${candidate.level}/${candidate.id}`);
  assert.equal(adjustment.portalInstanceId, portal.instanceId);
  assert.deepEqual(adjustment.portalProvenance, portal.provenance);
  assert.deepEqual(adjustment.sourcePosition, portal.sourcePosition);
  const relative = `Mods/${portal.module}/Levels/${portal.level}/Ai/navigationPortals.lsj`;
  assert.equal(portal.provenance.sourcePath, relative);
  assert(!relative.split("/").includes(".."));
  const native = readJson(path.join(sourceRoot, relative)).save.regions.PortalData.Portal
    .filter((row) => row.PortalUUID?.value === candidate.id);
  assert.equal(native.length, 1, "Native portal UUID must identify exactly one scene endpoint");
  const vector = (field) => {
    const values = native[0][field].value.trim().split(/\s+/).map(Number);
    assert(values.length === 3 && values.every(Number.isFinite));
    return Object.fromEntries(["x", "y", "z"].map((key, index) => [key, values[index]]));
  };
  assert.deepEqual(portal.sourcePosition, vector("Source"));
  assert.deepEqual(portal.targetPosition, vector("Target"));
  assert.equal(portal.numericId, native[0].Id.value);
  assert.equal(portal.sourceRegionId, native[0].Region.value);
  assert.equal(portal.targetRegionId, native[0].TargetRegion.value);
  const source = vector("Source"), world = reference.worldBounds, image = reference.imageBounds;
  assert(source.x >= world.x && source.x <= world.x + world.width
    && source.z >= world.y && source.z <= world.y + world.height);
  assert(onFloor(source), "Native entrance belongs to a different floor");
  const round = (number) => Math.round(number * 1000) / 1000;
  const project = (point) => ({ x: image.x + (point.x - world.x) / world.width * image.width,
    y: image.y + (reference.flipY ? 1 - (point.z - world.y) / world.height : (point.z - world.y) / world.height) * image.height });
  const original = project(candidate.position), target = project(source);
  assert.deepEqual(adjustment.original, { x: round(original.x), y: round(original.y) });
  assert.deepEqual(candidate.mapPosition, { x: round(target.x), y: round(target.y) });
  const distance = Math.hypot(source.x - candidate.position.x, source.y - candidate.position.y, source.z - candidate.position.z);
  assert(distance > 0 && distance < 10); assert.equal(adjustment.worldDistance, round(distance));
  assert.equal(adjustment.distance, Math.ceil(Math.max(
    Math.abs(target.x - adjustment.original.x) / image.width * (mask.width - 1),
    Math.abs(target.y - adjustment.original.y) / image.height * (mask.height - 1),
  )));
  const alpha = (point) => {
    const x = Math.round((point.x - image.x) / image.width * (mask.width - 1));
    const y = Math.round((point.y - image.y) / image.height * (mask.height - 1));
    return x < 0 || y < 0 || x >= mask.width || y >= mask.height ? 0 : mask.data[(y * mask.width + x) * mask.channels + 3];
  };
  assert(alpha(adjustment.original) <= 16, "A visible pivot must stay unchanged");
  assert(alpha(candidate.mapPosition) > 16, "The exact native entrance must be visible without snapping");
  return { portalInstanceId: portal.instanceId, worldDistance: distance, originalAlpha: alpha(adjustment.original), entranceAlpha: alpha(candidate.mapPosition) };
};
