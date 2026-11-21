import fs from "node:fs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import path from "node:path";
import { buildFloorVolume, containsFloorPosition, floorRasterAlignment, hasNativeFloorGeometry } from "./lib/floor-volume.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (filename) => JSON.parse(fs.readFileSync(path.join(root, filename), "utf8"));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--maps")) throw new Error("Expected --maps comma-separated-ids or no arguments");
const requested = new Set((args[1] ?? "").split(",").filter(Boolean));
const inventory = read("public/maps/source-inventory-report.json");
const config = read("map-sources/config/placement-maps.json");
const rawFiles = new Map();
const rawObject = (record, mapId) => {
  // Later primary exports override supplementary fields in placement generation.
  const primary = config.placementRoots[config.maps.find(({ id }) => id === mapId).placementRoot];
  for (const { sourcePath } of [...record.provenance].reverse()) {
    const relative = sourcePath.replace(/^supplementary\//, "");
    const roots = sourcePath.startsWith("supplementary/") ? [...config.supplementaryPlacementRoots].reverse() : [primary];
    for (const sourceRoot of roots) {
      const filename = path.join(sourceRoot, relative);
      if (!fs.existsSync(path.join(root, filename))) continue;
      if (!rawFiles.has(filename)) {
        const objects = new Map();
        const visit = (value) => {
          if (!value || typeof value !== "object") return;
          if (value.MapKey?.value && value.Transform) objects.set(value.MapKey.value, value);
          for (const child of Object.values(value)) if (child && typeof child === "object") {
            if (Array.isArray(child)) child.forEach(visit);
            else visit(child);
          }
        };
        visit(read(filename));
        rawFiles.set(filename, objects);
      }
      const object = rawFiles.get(filename).get(record.id);
      if (object) return object;
    }
  }
  return null;
};

// Registered floor sources must remain reproducible after the inventory no
// longer classifies them as pending. Their parent instance supplies transforms.
const selectedParents = new Map();
for (const map of config.maps) for (const patchId of map.floorVolumeSelection?.patchIds ?? []) {
  const parents = selectedParents.get(patchId) ?? new Set();
  parents.add(map.floorVolumeSelection.mapId);
  selectedParents.set(patchId, parents);
}
const patches = inventory.patches.filter(({ id, status }) => status === "requires-floor-review" || selectedParents.has(id));
const byMap = new Map();
for (const patch of patches) for (const mapId of selectedParents.get(patch.id) ?? patch.spatialCandidateMapIds) {
  if (requested.size && !requested.has(mapId)) continue;
  byMap.set(mapId, [...(byMap.get(mapId) ?? []), patch]);
}
for (const mapId of requested) if (!byMap.has(mapId)) throw new Error(`No pending floor sources for ${mapId}`);
const entries = [];
const floorName = (name) => name?.includes("FloorTrigger_") ? name.slice(name.indexOf("FloorTrigger_")) : name;
for (const [mapId, sourcePatches] of byMap) {
  const placements = read(`map-sources/catalog/${mapId}-placements.json`);
  const records = new Map(placements.records.map((record) => [record.id, record]));
  const recordsByName = Map.groupBy(placements.records.filter((record) => record.placementKind === "triggers"),
    (record) => floorName(record.internalName));
  const entities = Object.values(read(`public/maps/${mapId}/content.json`).entities);
  for (const patch of sourcePatches) {
    let record = records.get(patch.id);
    let object = record ? rawObject(record, mapId) : null;
    let binding = "exact-uuid";
    if (!record) {
      // Flattened world-map exports can assign a different UUID from the
      // authored trigger. Names alone are insufficient: require one unique
      // floor/building match whose transformed polygon agrees within two
      // original raster pixels. Never select the nearest arbitrary trigger.
      const candidates = (recordsByName.get(floorName(patch.name)) ?? []).flatMap((candidate) => {
        const raw = rawObject(candidate, mapId);
        if (!candidate.position || !hasNativeFloorGeometry(raw) || raw.Floor?.value !== patch.floor || raw.BuildingUUID?.value !== patch.buildingId) return [];
        const volume = buildFloorVolume(raw, candidate);
        return floorRasterAlignment(volume, patch).maxEdgeErrorPixels <= 2 ? [{ record: candidate, object: raw }] : [];
      });
      if (candidates.length === 1) {
        ({ record, object } = candidates[0]);
        binding = "authored-name-and-raster-geometry";
      }
    }
    const entry = { identity: patch.identity, mapId, name: patch.name, sourceRaster: patch.texture };
    if (!record?.position || !hasNativeFloorGeometry(object) || object.Floor?.value === undefined) {
      entries.push({ ...entry, status: "requires-volume-review", reason: !record ? "No placed source trigger"
        : !record.position ? "No resolved instance position" : "No authored floor polygon or box" });
      continue;
    }
    const authoredVolume = buildFloorVolume(object, record);
    const volume = { ...authoredVolume, id: patch.id, nativeTriggerId: authoredVolume.id };
    const alignment = floorRasterAlignment(volume, patch);
    const matches = entities.filter((entity) => containsFloorPosition(volume, entity.worldPosition));
    const identityMismatch = volume.floor !== patch.floor || volume.buildingId !== patch.buildingId;
    const geometryMismatch = alignment.maxEdgeErrorPixels > 2;
    entries.push({ ...entry, status: identityMismatch ? "requires-floor-identity-review"
      : geometryMismatch ? "requires-floor-geometry-review" : "resolved-native-volume", volume, binding, alignment,
      ...(identityMismatch ? { reason: "Native trigger and world-map metadata disagree on floor/building", rasterFloor: patch.floor, rasterBuildingId: patch.buildingId }
        : geometryMismatch ? { reason: "Transformed trigger and raster extents differ by more than two native pixels" } : {}),
      markerMatches: matches.map(({ id, title, kind, worldPosition }) => ({ id, title, kind, worldPosition })) });
  }
  console.log(`${mapId}: inspected ${sourcePatches.length} native floor patches.`);
}
const report = { schemaVersion: 1, scope: "Native trigger polygons and centered box volumes, projected through each selected map's authored instance chain. Matching a volume does not yet publish its floor raster.",
  requestedMaps: [...requested], stats: { maps: byMap.size, appearances: entries.length,
    resolved: entries.filter(({ status }) => status === "resolved-native-volume").length,
    requiresReview: entries.filter(({ status }) => status !== "resolved-native-volume").length }, entries };
const output = requested.size ? `map-sources/catalog/floor-volumes-${[...requested].join("-")}.json` : "map-sources/catalog/floor-volumes.json";
writeGeneratedFile(path.join(root, output), `${JSON.stringify(report, null, 2)}\n`);
console.log("Native floor volume catalog:", report.stats);
