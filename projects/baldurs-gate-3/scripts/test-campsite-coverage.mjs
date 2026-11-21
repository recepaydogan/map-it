import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const storyFiles = ["Gustav/Act1a_Camp.txt", "GustavDev/Act1b_Camp.txt", "GustavDev/Act2_CAMP.txt",
  "GustavDev/Act2b_CAMP.txt", "GustavDev/Act3_Camp.txt", "GustavDev/Act3b_CAMP.txt"];
const campMaps = {
  WLDMAIN: "wilderness-campsite", WLDBAS: "basement-campsite", WLDCAVGRN: "cavern-campsite",
  WLDCAVSND: "underground-campsite", WLDDUNABB: "chapel-campsite", WLDDUNSHA: "grymforge-campsite",
  WLDUND: "underdark-campsite", CREMAIN: "rosymorn-campsite", CREINSIDE: "creche-campsite",
  SCLMAIN: "shadow-cursed-campsite", SHARTEMPLE: "gauntlet-campsite", HAVEN: "last-light-campsite",
  MOONRISE: "moonrise-campsite", INTMAIN: "wyrms-lookout", FARM: "rivington-campsite",
  SLUMS: "lower-city-campsite", ELFSONG: "elfsong-tavern-campsite",
};
const registered = new Set(readRegisteredMapIds(fs.readFileSync(path.join(root, "src/features/map/map-registry.ts"), "utf8")));
const rasters = new Map(read("map-sources/config/bc3-maps.json").maps.map((map) => [map.id, map]));
const placements = new Map(read("map-sources/config/placement-maps.json").maps.map((map) => [map.id, map]));
const patches = read("map-sources/catalog/world-map.json").levels.flatMap((level) => level.patches
  .map((patch) => ({ ...patch, level: level.level })));
const found = [];
for (const file of storyFiles) {
  const text = fs.readFileSync(path.join(root, "map-sources/extracted/story-goals", file), "utf8");
  const definition = /DB_Camp\("([A-Z]+)",\s*\(ITEM\)([^,]+),\s*\(TRIGGER\)([^,]+),\s*\(TRIGGER\)([^)]+)\);/g;
  for (const [, camp, , area, entry] of text.matchAll(definition)) {
    found.push(camp);
    const mapId = campMaps[camp];
    assert.ok(mapId && registered.has(mapId), `${file}: ${camp} has a registered map`);
    const raster = rasters.get(mapId);
    const config = placements.get(mapId);
    const sourcePatch = patches.find((patch) => config.sourcePatchIds.includes(patch.id)
      && new RegExp(config.levelPattern).test(patch.level)
      && raster.source.endsWith(`${patch.gTex}_0.dds`));
    assert.ok(sourcePatch, `${mapId} uses its own original game raster`);
    assert.deepEqual(raster.worldBounds, sourcePatch.worldBounds, `${mapId} retains original world bounds`);
    const metadata = read(`public/maps/${mapId}/metadata.json`);
    const bounds = metadata.coordinateReference.worldBounds;
    const records = read(`map-sources/catalog/${mapId}-placements.json`).records;
    // Fires can be scenery resources rather than placement-catalog items.
    // The registered area and player arrival trigger provide spatial proof.
    for (const token of [area, entry]) {
      const id = /[0-9a-f-]{36}\s*$/i.exec(token)?.[0].trim().toLowerCase();
      const record = records.find((candidate) => candidate.id === id);
      assert.ok(record, `${mapId}: source registration ${token.trim()} is extracted`);
      const position = record.position;
      assert.ok(position.x >= bounds.x && position.x <= bounds.x + bounds.width
        && position.z >= bounds.y && position.z <= bounds.y + bounds.height,
      `${mapId}: the registered area and entrance belong to the displayed map, not another campsite`);
    }
    const locations = read(`public/maps/${mapId}/locations.json`).locations;
    assert.ok(locations.length > 0, `${mapId} includes its source-backed static markers`);
    assert.equal(new Set(locations.map(({ contentId }) => contentId)).size, locations.length);
  }
}
assert.deepEqual(found.sort(), Object.keys(campMaps).sort(), "Every native camp registration is accounted for exactly once");
console.log(`Campsite coverage passed for ${found.length} source-registered resting camps. Dynamic companion availability is a separate audit.`);
