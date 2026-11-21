import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { verifyNativeEntranceAnchor } from "./lib/native-entrance-audit.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Compare real generation before/after the display-only native entrance rule.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 5, "Usage: audit-native-entrance-delta.mjs <before-stage> <after-stage> <report>");
const [before, after, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
const hashes = {};
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = createHash("sha256").update(data).digest("hex"); return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const manifest = read(path.join(after, "stage-manifest.json"));
assert.deepEqual(manifest, read(path.join(before, "stage-manifest.json")));
assert.equal(manifest.kind, "unfinalized-placement-stage");
const config = read(manifest.configPath), floors = read(config.floorVolumes ?? "map-sources/catalog/floor-volumes.json");
const contains = (volume, point) => {
  if (point.y < volume.minHeight || point.y >= volume.maxHeight) return false;
  let winding = 0;
  for (let i = 0; i < volume.polygon.length; i += 1) {
    const a = volume.polygon[i], b = volume.polygon[(i + 1) % volume.polygon.length];
    const cross = (b.x - a.x) * (point.z - a.z) - (point.x - a.x) * (b.z - a.z);
    if (Math.abs(cross) < 1e-8 && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
      && point.z >= Math.min(a.z, b.z) && point.z <= Math.max(a.z, b.z)) return true;
    if (a.z <= point.z && point.z < b.z && cross > 0) winding += 1;
    if (b.z <= point.z && point.z < a.z && cross < 0) winding -= 1;
  }
  return winding !== 0;
};
let candidates = 0, records = 0;
const changes = [];
for (const mapId of manifest.maps) {
  const load = (stage, file) => read(path.join(stage, file));
  const file = `map-sources/catalog/${mapId}-placements.json`;
  const old = load(before, file), current = load(after, file);
  assert.deepEqual(omit(current, ["generatedAt", "candidates"]), omit(old, ["generatedAt", "candidates"]));
  records += current.records?.length ?? 0; candidates += current.candidates.length;
  assert.deepEqual(current.candidates.map(({ id }) => id), old.candidates.map(({ id }) => id));
  const definition = config.maps.find(({ id }) => id === mapId), selection = definition.floorVolumeSelection;
  const selected = selection ? floors.entries.filter((row) => row.mapId === selection.mapId && row.status === "resolved-native-volume"
    && selection.patchIds.includes(row.volume.id)).map(({ volume }) => volume) : [];
  if (selection) assert.equal(selected.length, selection.patchIds.length);
  const buildings = new Set(selected.map(({ buildingId }) => buildingId));
  const siblings = selection ? floors.entries.filter((row) => row.mapId === selection.mapId && row.status === "resolved-native-volume"
    && buildings.has(row.volume.buildingId)).map(({ volume }) => volume) : [];
  const onFloor = (point) => !selection || selection.patchIds.includes(siblings.filter((volume) => contains(volume, point))
    .sort((a, b) => b.minHeight - a.minHeight || a.id.localeCompare(b.id, "en"))[0]?.id);
  const metadata = read(`public/maps/${mapId}/metadata.json`);
  const { data, info } = await sharp(bytes(`public/maps/${mapId}/overview.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < current.candidates.length; i += 1) {
    const candidate = current.candidates[i], previous = old.candidates[i];
    if (isDeepStrictEqual(candidate, previous)) continue;
    assert.deepEqual(omit(candidate, ["mapPosition", "mapPositionAdjustment"]), omit(previous, ["mapPosition", "mapPositionAdjustment"]));
    const evidence = verifyNativeEntranceAnchor(candidate, { readJson: read, sourceRoot: path.join(root, "map-sources/converted/navigation-portals"),
      reference: metadata.coordinateReference, mask: { data, width: info.width, height: info.height, channels: info.channels }, onFloor });
    changes.push({ mapId, id: candidate.id, title: candidate.displayName.en, before: previous.mapPosition, after: candidate.mapPosition, evidence });
  }
  assert.deepEqual(load(after, `public/maps/${mapId}/content.json`), load(before, `public/maps/${mapId}/content.json`));
  const oldMarkers = load(before, `public/maps/${mapId}/locations.json`), newMarkers = load(after, `public/maps/${mapId}/locations.json`);
  assert.deepEqual(omit(oldMarkers, ["locations"]), omit(newMarkers, ["locations"]));
  assert.equal(oldMarkers.locations.length, newMarkers.locations.length);
  for (let i = 0; i < newMarkers.locations.length; i += 1) {
    const oldMarker = oldMarkers.locations[i], marker = newMarkers.locations[i];
    assert.deepEqual(omit(marker, ["x", "y"]), omit(oldMarker, ["x", "y"]));
    const candidate = current.candidates.find(({ id }) => id === marker.id); assert(candidate);
    assert.deepEqual({ x: marker.x, y: marker.y }, candidate.mapPosition);
    if (!changes.some((row) => row.mapId === mapId && row.id === marker.id)) assert.deepEqual(marker, oldMarker);
  }
  const rejectionPath = `map-sources/catalog/${mapId}-placement-rejections.json`;
  const previousRejections = load(before, rejectionPath), rejections = load(after, rejectionPath);
  assert.deepEqual(omit(rejections, ["adjustedCandidates"]), omit(previousRejections, ["adjustedCandidates"]));
  const changedIds = new Set(changes.filter((row) => row.mapId === mapId).map(({ id }) => id));
  assert.deepEqual(rejections.adjustedCandidates.filter(({ id }) => !changedIds.has(id)), previousRejections.adjustedCandidates.filter(({ id }) => !changedIds.has(id)));
  for (const id of changedIds) assert.deepEqual(rejections.adjustedCandidates.find((row) => row.id === id)?.adjustment,
    current.candidates.find((row) => row.id === id).mapPositionAdjustment);
}
for (const file of [import.meta.filename, "scripts/lib/native-entrance-audit.mjs", "scripts/build-placement-catalog.mjs"]) bytes(file);
const result = { kind: "native-entrance-display-delta", stats: { maps: manifest.maps.length, records, preservedAppearances: candidates, changedAnchors: changes.length },
  before, after, changes, hashes, errors: [],
  scope: "Actual before/after source records and every gameplay/identity/world-position field conserved. Changed display anchors independently checked against native portal UUID, scene, endpoints, floor and original/target pixels. This does not approve other unrebuilt maps, complete native coverage or live publication." };
writeGeneratedFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ stats: result.stats, changes, errors: [] }, null, 2));
