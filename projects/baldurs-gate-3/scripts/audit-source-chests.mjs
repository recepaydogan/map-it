import fs from "node:fs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import path from "node:path";
import { isChestRecord } from "./lib/placement-containers.mjs";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { createFloorSelector } from "./lib/floor-volume.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const ids = readRegisteredMapIds(fs.readFileSync(path.join(root, "src/features/map/map-registry.ts"), "utf8"));
const placementConfig = read("map-sources/config/placement-maps.json");
const configs = new Map(placementConfig.maps.map((map) => [map.id, map]));
const floorVolumeCatalog = placementConfig.maps.some((map) => map.floorVolumeSelection)
  ? read(placementConfig.floorVolumes ?? "map-sources/catalog/floor-volumes.json") : null;
const gaps = [];
const routedToChildMaps = [];
for (const [index, id] of ids.entries()) {
  const config = configs.get(id);
  const matchesFloor = createFloorSelector(config.floorVolumeSelection, floorVolumeCatalog);
  const bounds = read(`public/maps/${id}/metadata.json`).coordinateReference.worldBounds;
  const published = new Set(read(`public/maps/${id}/locations.json`).locations.map((location) => location.contentId));
  const source = read(`map-sources/catalog/${id}-placements.json`);
  const rejected = new Set((source.silhouetteRejectedCandidates ?? []).map((record) => record.id));
  const excluded = new Set(config.excludedObjectIds ?? []);
  const levelPattern = config.levelPattern ? new RegExp(config.levelPattern) : null;
  const includeName = config.includeNamePattern ? new RegExp(config.includeNamePattern, "i") : null;
  const excludeName = config.excludeNamePattern ? new RegExp(config.excludeNamePattern, "i") : null;
  const childAppearances = (config.supersededBy ?? []).flatMap((mapId) =>
    Object.values(read(`public/maps/${mapId}/content.json`).entities).map((entity) => ({ mapId, entity })));
  for (const record of source.records) {
    const position = record.position;
    if (!position || !isChestRecord(record) || published.has(record.id) || rejected.has(record.id) || excluded.has(record.id)) continue;
    if (levelPattern && !levelPattern.test(record.level)) continue;
    if (config.minHeight !== undefined && position.y < config.minHeight) continue;
    if (config.maxHeight !== undefined && position.y > config.maxHeight) continue;
    if (!matchesFloor(position)) continue;
    if (position.x < bounds.x || position.x > bounds.x + bounds.width || position.z < bounds.y || position.z > bounds.y + bounds.height) continue;
    const name = [record.internalName, record.stats, record.type].filter(Boolean).join(" ");
    if (includeName && !includeName.test(name) || excludeName?.test(name)) continue;
    const childMaps = childAppearances.filter(({ entity }) => entity.id === record.id && entity.worldPosition
      && Math.hypot(entity.worldPosition.x - position.x, entity.worldPosition.y - position.y, entity.worldPosition.z - position.z) < 0.01)
      .map(({ mapId }) => mapId);
    if (childMaps.length) {
      routedToChildMaps.push({ parentMapId: id, id: record.id, childMapIds: childMaps, position });
      continue;
    }
    gaps.push({ mapId: id, id: record.id, level: record.level, authoredLevel: record.authoredLevel,
      name: record.displayName.en || record.internalName, position, sourcePosition: record.sourcePosition,
      hasExplicitInventory: Boolean(record.inventoryItems?.length || record.inventoryTables?.length),
      hasPartyHoldingSpot: Boolean(record.partyHoldingSpot), provenance: record.provenance });
  }
  if ((index + 1) % 20 === 0) console.log(`Reviewed ${index + 1}/${ids.length} maps: ${gaps.length} unclassified chest appearances.`);
}
const report = { generatedAt: new Date().toISOString(), scope: "Source-authored chests inside map bounds, absent from both publication and silhouette rejection. Candidates still need staging, deduplication and floor review.",
  stats: { registeredMaps: ids.length, unclassifiedAppearances: gaps.length, affectedMaps: new Set(gaps.map((gap) => gap.mapId)).size,
    routedToChildMaps: routedToChildMaps.length }, gaps, routedToChildMaps };
writeGeneratedFile(path.join(root, "map-sources/catalog/source-chest-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log("Source chest audit:", report.stats);
