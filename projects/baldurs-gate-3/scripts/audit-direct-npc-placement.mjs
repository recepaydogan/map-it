import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 8) throw new Error("Usage: audit-direct-npc-placement.mjs <source-audit> <old-raw> <stage> <native-anchors> <items> <report>");
const [auditPath, baseline, stage, nativePath, itemsPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, entries = [], unresolved = [];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute), key = path.relative(root, absolute).split(path.sep).join("/");
  assert(!hashes[key] || hashes[key] === digest(value)); hashes[key] = digest(value); return value;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const sourceAudit = read(auditPath); assert.equal(sourceAudit.kind, "native-direct-npc-catalog-audit"); assert.deepEqual(sourceAudit.errors, []);
for (const [file, hash] of Object.entries(sourceAudit.hashes)) assert.equal(digest(bytes(file)), hash, `Stale native audit: ${file}`);
const manifest = read(path.join(stage, "stage-manifest.json")), config = read(manifest.configPath);
assert.equal(manifest.kind, "unfinalized-placement-stage");
const scenes = read(sourceAudit.scenePath), relations = read(sourceAudit.relationPath);
// The first scoped generation preceded a review-line correction. Require full
// catalog payload equality; recipe/hash metadata alone must not certify it.
assert.deepEqual(read(manifest.sceneContentPath).profiles, scenes.profiles);
assert.deepEqual(read(manifest.storyLocationsPath).scriptedDestinations, relations.scriptedDestinations);
const native = new Map(read(nativePath).save.regions.Templates.GameObjects.map((object) => [object.MapKey.value, object]));
const expected = new Map(sourceAudit.additions.map((entry) => [entry.contentId, entry]));
const metadata = new Map(config.maps.map(({ id }) => [id, read(`public/maps/${id}/metadata.json`)]));
const nativePosition = (entry) => {
  const object = native.get(entry.anchorId); assert(object?.Transform?.[0]?.Position?.value);
  const values = object.Transform[0].Position.value.split(/\s+/).map(Number);
  assert.equal(values.length, 3); assert(values.every(Number.isFinite));
  return { object, position: Object.fromEntries(["x", "y", "z"].map((key, index) => [key, values[index]])) };
};
const inMap = (position, mapId, level) => {
  const map = config.maps.find(({ id }) => id === mapId), world = metadata.get(mapId).coordinateReference.worldBounds;
  return new RegExp(map.levelPattern).test(level) && position.x >= world.x && position.x <= world.x + world.width
    && position.z >= world.y && position.z <= world.y + world.height;
};
const storageVolumesAt = (position) => [...native.values()].filter((object) => /ScriptAsylum/i.test(object.Name?.value ?? "") && object.Points?.length)
  .flatMap((object) => {
    const transform = object.Transform[0];
    assert.equal(transform.RotationQuat.value, "0 0 0 1"); assert.equal(transform.Scale.value, 1);
    const origin = transform.Position.value.split(/\s+/).map(Number);
    const points = object.Points.map(({ Object: point }) => point.value.split(/\s+/).map(Number));
    const x = position.x - origin[0], z = position.z - origin[2]; let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [a, b] = points[i], [c, d] = points[j];
      if ((b > z) !== (d > z) && x < (c - a) * (z - b) / (d - b) + a) inside = !inside;
    }
    return inside && position.y >= origin[1] && position.y <= origin[1] + object.Height.value
      ? [{ id: object.MapKey.value, name: object.Name.value, position: origin, points, height: object.Height.value }] : [];
  });
let retainedEntities = 0, retainedMarkers = 0;
for (const mapId of manifest.maps) {
  const folder = `public/maps/${mapId}`;
  const before = read(path.join(baseline, folder, "content.json")), current = read(path.join(stage, folder, "content.json"));
  const beforeMarkers = read(path.join(baseline, folder, "locations.json")), markers = read(path.join(stage, folder, "locations.json"));
  const candidates = read(path.join(stage, "map-sources/catalog", `${mapId}-placements.json`)).candidates;
  const oldIds = new Set(before.entities.map(({ id }) => id));
  const added = current.entities.filter(({ id }) => !oldIds.has(id));
  assert.equal(new Set(current.entities.map(({ id }) => id)).size, current.entities.length);
  assert.deepEqual(omit(current, ["entities"]), omit(before, ["entities"]));
  assert.deepEqual(current.entities.filter(({ id }) => oldIds.has(id)), before.entities, `Existing entity changed: ${mapId}`);
  assert.deepEqual(omit(markers, ["locations"]), omit(beforeMarkers, ["locations"]));
  assert.deepEqual(markers.locations.filter(({ contentId }) => oldIds.has(contentId)), beforeMarkers.locations, `Existing marker changed: ${mapId}`);
  assert.equal(markers.locations.length, beforeMarkers.locations.length + added.length);
  retainedEntities += before.entities.length; retainedMarkers += beforeMarkers.locations.length;
  if (!added.length) continue;
  const raster = await sharp(bytes(`public/maps/${mapId}/overview.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const entity of added) {
    const target = expected.get(entity.id); assert(target, `Unreviewed addition: ${entity.id}`);
    const profile = scenes.profiles.find(({ id }) => id === target.profileId);
    const candidate = candidates.find(({ id }) => id === entity.id); assert(candidate);
    const anchor = nativePosition(target);
    assert(!candidate.positionTransform && !candidate.templateProjection && !candidate.positionSuppressed, "A transformed native anchor needs a separate review");
    assert.deepEqual(entity.worldPosition, anchor.position); assert.deepEqual(candidate.position, anchor.position);
    assert.equal(candidate.level, anchor.object.LevelName.value);
    assert(inMap(anchor.position, mapId, candidate.level));
    assert(!config.maps.find(({ id }) => id === mapId).floorVolumeSelection, "Floor containment needs explicit review");
    assert.equal(entity.kind, target.kind); assert(!entity.partyMember, "Non-recruitment scene contains recruitment guidance");
    assert(!entity.gameplay?.combat, "Authored recruitment statistics leaked into the later scene");
    assert.deepEqual(omit(entity.sceneContext, ["authoredCombat"]), { id: profile.id, localizedDescriptions: profile.localizedDescriptions, evidence: profile.evidence });
    assert.equal(entity.authoredEquipment.scene, "requires-scene-review");
    assert(entity.authoredEquipment.groups.every(({ entries }) => entries.every(({ status }) => status === "requires-scene-review")));
    if (entity.deathLoot) assert.deepEqual(entity.deathLoot.availability, { id: profile.id, localizedConditions: profile.lootAvailability, evidence: profile.evidence });
    assert.deepEqual(entity.storyDestination.otherAnchorContentIds, []);
    assert.deepEqual(entity.storyDestination.alternateDestinations, []);
    const matching = markers.locations.filter(({ contentId }) => contentId === entity.id); assert.equal(matching.length, 1);
    const marker = matching[0]; assert.equal(marker.category, target.kind);
    const { worldBounds: world, imageBounds: image, flipY } = metadata.get(mapId).coordinateReference;
    const x = image.x + (anchor.position.x - world.x) / world.width * image.width;
    const y = image.y + (flipY ? 1 - (anchor.position.z - world.y) / world.height : (anchor.position.z - world.y) / world.height) * image.height;
    assert(Math.abs(marker.x - x) <= 0.00051 && Math.abs(marker.y - y) <= 0.00051);
    const px = Math.round((x - image.x) / image.width * (raster.info.width - 1));
    const py = Math.round((y - image.y) / image.height * (raster.info.height - 1));
    assert(px >= 0 && py >= 0 && px < raster.info.width && py < raster.info.height);
    const alpha = raster.data[(py * raster.info.width + px) * raster.info.channels + 3]; assert(alpha > 16, "Native pin lies on transparent raster pixels");
    entries.push({ mapId, contentId: entity.id, nativeAnchorId: target.anchorId, worldPosition: entity.worldPosition, mapPosition: { x: marker.x, y: marker.y }, alpha });
  }
}
assert.equal(new Set(entries.map(({ contentId }) => contentId)).size, entries.length);
const worldMap = read(config.worldMap ?? "map-sources/catalog/world-map.json");
for (const target of expected.values()) if (!entries.some(({ contentId }) => contentId === target.contentId)) {
  const anchor = nativePosition(target), level = anchor.object.LevelName.value;
  const maps = config.maps.filter(({ id }) => inMap(anchor.position, id, level)).map(({ id }) => id);
  const matchingPatches = worldMap.levels.filter((entry) => entry.level === level).flatMap(({ patches }) => patches)
    .filter(({ gTex, worldBounds: b }) => gTex && Math.abs(anchor.position.x - b.centerX) <= b.width / 2 && Math.abs(anchor.position.z - b.centerY) <= b.height / 2);
  assert.equal(maps.length, 0, "A source-backed scene inside a registered map was skipped");
  unresolved.push({ ...target, status: "active-anchor-outside-registered-maps", level, sourcePosition: anchor.position,
    matchingRegisteredMaps: maps, matchingTextureBackedPatches: matchingPatches.map(({ id }) => id),
    containingNativeStorageVolumes: storageVolumesAt(anchor.position),
    reason: "No fabricated pin or nearest-room relocation. Native off-map holding/obsolete-scene versus missing playable-area status still needs review." });
}
const items = read(itemsPath); bytes(import.meta.filename);
for (const file of ["scripts/build-placement-catalog.mjs", "scripts/lib/story-destination.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const report = { kind: "native-direct-npc-placement-audit", errors: [], sourceAuditPath: auditPath, baselineRoot: baseline, stageRoot: stage,
  verifiedStoryLocationsPath: sourceAudit.relationPath, verifiedSceneContentPath: sourceAudit.scenePath,
  stats: { maps: manifest.maps.length, retainedEntities, retainedMarkers, addedScenes: entries.length, unresolvedScenes: unresolved.length, retainedItems: items.items.length },
  entries, unresolved, hashes, requiresItemAcquisitionReview: true,
  scope: "Exact native absolute positions, opaque overview pixels, scene presentation, separate encounters and scoped raw-map conservation. Missing native scenes are explicitly unresolved. No full-map publication, item propagation, runtime test or completeness claim." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report.stats, null, 2));
