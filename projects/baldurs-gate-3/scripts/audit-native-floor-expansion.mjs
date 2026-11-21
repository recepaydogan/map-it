import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import { verifyNativeEntranceAnchor } from "./lib/native-entrance-audit.mjs";

// Audit completed files without importing the composer, routing or floor selector.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 3, "Usage: audit-native-floor-expansion.mjs <stage>");
const stage = path.resolve(root, process.argv[2]), hashes = {};
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const index = (rows) => {
  const result = new Map(rows.map((row) => [row.id, row])); assert.equal(result.size, rows.length); return result;
};
const manifest = read(path.join(stage, "stage-manifest.json"));
assert.equal(manifest.kind, "native-floor-expansion-stage");
const baseline = manifest.baselineRoot, previous = read(path.join(baseline, "stage-manifest.json"));
const config = read(manifest.configPath), catalog = read(config.floorVolumes ?? "map-sources/catalog/floor-volumes.json");
const report = read(manifest.conservationAuditPath), newMaps = config.maps.filter(({ id }) => !previous.maps.includes(id));
assert.deepEqual([...manifest.maps].sort(), config.maps.map(({ id }) => id).sort());
for (const [directory, document] of [[stage, manifest], [baseline, previous]]) for (const [file, expected] of Object.entries(document.outputHashes)) {
  assert.equal(digest(bytes(path.join(directory, file))), expected, `Changed stage artifact: ${file}`);
}
for (const [file, expected] of Object.entries(manifest.hashes)) assert.equal(digest(bytes(file)), expected, `Stale expansion input: ${file}`);
const contains = (volume, point) => {
  if (!point || point.y < volume.minHeight || point.y >= volume.maxHeight) return false;
  let winding = 0;
  for (let i = 0; i < volume.polygon.length; i += 1) {
    const a = volume.polygon[i], b = volume.polygon[(i + 1) % volume.polygon.length];
    const cross = (b.x - a.x) * (point.z - a.z) - (point.x - a.x) * (b.z - a.z);
    if (Math.abs(cross) < 1e-8 && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
      && point.z >= Math.min(a.z, b.z) && point.z <= Math.max(a.z, b.z)) return true;
    if (a.z <= point.z && b.z > point.z && cross > 0) winding += 1;
    if (a.z > point.z && b.z <= point.z && cross < 0) winding -= 1;
  }
  return winding !== 0;
};
const onFloor = (map, point) => {
  const selection = map.floorVolumeSelection;
  const entries = catalog.entries.filter((entry) => entry.mapId === selection.mapId && entry.status === "resolved-native-volume");
  const selected = entries.filter(({ volume }) => selection.patchIds.includes(volume.id));
  assert.equal(selected.length, selection.patchIds.length);
  const buildings = new Set(selected.map(({ volume }) => volume.buildingId));
  const containing = entries.filter(({ volume }) => buildings.has(volume.buildingId) && contains(volume, point))
    .map(({ volume }) => volume).sort((a, b) => b.minHeight - a.minHeight || a.id.localeCompare(b.id, "en"));
  return selection.patchIds.includes(containing[0]?.id);
};
const load = (directory, id) => {
  const content = read(path.join(directory, "public/maps", id, "content.json"));
  const locations = read(path.join(directory, "public/maps", id, "locations.json"));
  const placement = read(path.join(directory, "map-sources/catalog", `${id}-placements.json`));
  return { content, locations, placement, entities: index(content.entities), markers: index(locations.locations), candidates: index(placement.candidates) };
};
const after = new Map(manifest.maps.map((id) => [id, load(stage, id)]));
const oldIds = new Set(), currentIds = new Set(), actualMoves = [], actualArrivals = [];
let oldCount = 0, currentCount = 0, immutableFiles = 0;
const before = new Map(previous.maps.map((id) => [id, load(baseline, id)]));
for (const [mapId, old] of before) {
  const retained = after.get(mapId), movedHere = new Set();
  for (const entity of old.content.entities) {
    oldCount += 1; oldIds.add(entity.id);
    const floorPosition = old.candidates.get(entity.id)?.navigationPortal?.sourcePosition ?? entity.worldPosition;
    const destinations = newMaps.filter((map) => map.floorVolumeSelection.mapId === mapId && onFloor(map, floorPosition));
    assert(destinations.length <= 1, `Ambiguous floor: ${mapId}/${entity.id}`);
    const destination = destinations[0]?.id ?? mapId, current = after.get(destination);
    assert.deepEqual(current.entities.get(entity.id), entity, `Gameplay/native position changed: ${destination}/${entity.id}`);
    if (destination !== mapId) {
      assert(!retained.entities.has(entity.id)); movedHere.add(entity.id);
      actualMoves.push({ fromMap: mapId, toMap: destination, id: entity.id, worldPosition: entity.worldPosition });
      assert.deepEqual(omit(current.markers.get(entity.id), ["x", "y", "region", "regionId"]), omit(old.markers.get(entity.id), ["x", "y", "region", "regionId"]));
      assert.deepEqual(omit(current.candidates.get(entity.id), ["mapPosition", "mapPositionAdjustment"]), omit(old.candidates.get(entity.id), ["mapPosition", "mapPositionAdjustment"]));
    } else {
      assert.deepEqual(current.markers.get(entity.id), old.markers.get(entity.id));
      assert.deepEqual(current.candidates.get(entity.id), old.candidates.get(entity.id));
    }
  }
  assert.deepEqual(retained.content.entities.map(({ id }) => id), old.content.entities.filter(({ id }) => !movedHere.has(id)).map(({ id }) => id));
  assert.deepEqual(omit(retained.content, ["entities", "relationships"]), omit(old.content, ["entities", "relationships"]));
  assert.deepEqual(retained.content.relationships, old.content.relationships?.filter(({ fromId }) => !movedHere.has(fromId)));
  assert.deepEqual(retained.locations, { ...old.locations, locations: old.locations.locations.filter(({ contentId }) => !movedHere.has(contentId)) });
  assert.deepEqual(retained.placement, { ...old.placement, stats: { ...old.placement.stats, candidates: old.placement.candidates.length - movedHere.size },
    candidates: old.placement.candidates.filter(({ id }) => !movedHere.has(id)) });
}
const adjustments = [];
for (const map of newMaps) {
  const current = after.get(map.id), raw = load(manifest.sourceStageRoot, map.id);
  const metadata = read(path.join(stage, "public/maps", map.id, "metadata.json"));
  const { data, info } = await sharp(bytes(`public/maps/${map.id}/overview.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { worldBounds: world, imageBounds: image, flipY } = metadata.coordinateReference;
  assert.deepEqual([...current.entities.keys()].sort(), [...raw.entities.keys()].sort());
  for (const entity of current.content.entities) {
    const marker = current.markers.get(entity.id), candidate = current.candidates.get(entity.id);
    assert(marker && candidate && marker.contentId === entity.id);
    assert(onFloor(map, candidate.navigationPortal?.sourcePosition ?? entity.worldPosition));
    const u = (entity.worldPosition.x - world.x) / world.width, v = (entity.worldPosition.z - world.y) / world.height;
    const projected = { x: image.x + u * image.width, y: image.y + (flipY ? 1 - v : v) * image.height };
    const adjustment = candidate.mapPositionAdjustment, original = adjustment?.original ?? marker;
    assert(Math.abs(original.x - projected.x) <= 0.001 && Math.abs(original.y - projected.y) <= 0.001, `Projection differs: ${map.id}/${entity.id}`);
    assert.deepEqual(candidate.mapPosition, { x: marker.x, y: marker.y });
    if (adjustment) {
      if (adjustment.kind === "native-navigation-entrance") {
        verifyNativeEntranceAnchor(candidate, { readJson: read, sourceRoot: path.join(root, "map-sources/converted/navigation-portals"),
          reference: metadata.coordinateReference, mask: { data, width: info.width, height: info.height, channels: info.channels },
          onFloor: (point) => onFloor(map, point) });
      } else {
        assert.equal(adjustment.kind, "nearest-visible-pixel"); assert(adjustment.distance <= 2);
        assert(Math.hypot(marker.x - original.x, marker.y - original.y) <= 2);
      }
      adjustments.push({ mapId: map.id, id: entity.id, adjustment });
    }
    const px = Math.round((marker.x - image.x) / image.width * (info.width - 1));
    const py = Math.round((marker.y - image.y) / image.height * (info.height - 1));
    assert(px >= 0 && py >= 0 && px < info.width && py < info.height && data[(py * info.width + px) * info.channels + 3] > 16, `Transparent floor pin: ${map.id}/${entity.id}`);
    if (oldIds.has(entity.id)) continue;
    assert.deepEqual(entity, raw.entities.get(entity.id)); assert.deepEqual(marker, raw.markers.get(entity.id));
    assert.deepEqual(candidate, raw.candidates.get(entity.id));
    const profile = entity.storyDestination;
    assert(profile?.evidence.length); assert(oldIds.has(profile.characterContentId));
    actualArrivals.push({ mapId: map.id, id: entity.id, worldPosition: entity.worldPosition, evidence: profile.evidence });
  }
  const moved = new Set(actualMoves.filter(({ toMap }) => toMap === map.id).map(({ id }) => id));
  assert.deepEqual(current.content.relationships, (before.get(map.floorVolumeSelection.mapId).content.relationships ?? []).filter(({ fromId }) => moved.has(fromId)));
}
for (const current of after.values()) {
  assert.equal(current.entities.size, current.markers.size); assert.equal(current.entities.size, current.candidates.size);
  assert.equal(current.placement.stats.candidates, current.candidates.size);
  for (const entity of current.content.entities) { currentCount += 1; currentIds.add(entity.id); }
}
for (const file of Object.keys(previous.outputHashes)) if (file.startsWith("baseline/") || file.endsWith("/metadata.json") || file.endsWith("-placement-rejections.json")) {
  assert.equal(manifest.outputHashes[file], previous.outputHashes[file], `Changed immutable artifact: ${file}`); immutableFiles += 1;
}
const sorted = (rows) => rows.map((row) => JSON.stringify(row)).sort();
assert.deepEqual(sorted(actualMoves), sorted(report.relocations)); assert.deepEqual(sorted(actualArrivals), sorted(report.newArrivals));
assert.equal(currentCount, oldCount + actualArrivals.length); assert.equal(currentIds.size, oldIds.size + actualArrivals.length);
for (const id of oldIds) assert(currentIds.has(id));
bytes(import.meta.filename);
bytes("scripts/lib/native-entrance-audit.mjs");
const result = { kind: "independent-native-floor-expansion-audit", stage, errors: [],
  stats: { maps: after.size, preservedAppearances: oldCount, appearances: currentCount, identities: currentIds.size,
    relocatedAppearances: actualMoves.length, newArrivals: actualArrivals.length, immutableFiles, transparentFloorPins: 0 }, adjustments, hashes,
  scope: "Independent winding-number floor membership and completed-file conservation. Every accepted entity and candidate gameplay field survives; changed icon coordinates match native projection and visible pixels. Does not prove complete room coverage, native volume extraction, arrival scene content, atlas/index/item integration or publication readiness." };
writeGeneratedFile(path.join(stage, "independent-floor-expansion-audit.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ stats: result.stats, adjustments: adjustments.length, errors: [] }, null, 2));
