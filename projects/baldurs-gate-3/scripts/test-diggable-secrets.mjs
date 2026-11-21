import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "diggable-secrets.json"), "utf8"));
const mapsRoot = path.join(projectRoot, "public", "maps");
const mapped = new Map();
let placementCount = 0;

assert.equal(catalog.stats.diggableSecrets, 110);
assert.equal(catalog.stats.buriedMounds, 105);
assert.equal(catalog.stats.sewerDigSpots, 5);
assert.equal(catalog.stats.linkedBuriedChests, 110);

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  for (const entity of Object.values(content.entities ?? {})) {
    if (entity.diggableSecret) {
      placementCount += 1;
      mapped.set(entity.id, { mapId: directory.name, entity });
    }
  }
}

assert.deepEqual([...mapped.keys()].sort(), catalog.entries.map(({ objectId }) => objectId).sort(),
  "Every source diggable secret must have a published marker, not just those in a historical raster subset.");
assert.equal(mapped.size, placementCount, "Diggable-secret markers must not be duplicated across registered maps.");
const sourceRecords = new Map(JSON.parse(fs.readFileSync(path.join(projectRoot,
  "map-sources/catalog/wilderness-placements.json"), "utf8")).records.map((record) => [record.id, record]));
for (const entry of catalog.entries) {
  const marker = mapped.get(entry.objectId);
  assert.equal(marker.entity.kind, "secret");
  assert.equal(marker.entity.diggableSecret.kind, entry.kind);
  assert.equal(marker.entity.diggableSecret.buriedChest?.contentId, entry.buriedChest.objectId);
  const chest = sourceRecords.get(entry.buriedChest.objectId);
  assert.ok(chest, `${entry.objectId} has an authored chest`);
  assert.deepEqual(
    (marker.entity.diggableSecret.buriedChest.loot?.randomLootPools ?? []).map(({ tableId }) => tableId).sort(),
    [...new Set([...chest.inventoryTables, ...chest.treasureTables])].sort(),
    `${entry.objectId} retains every authored chest loot pool`,
  );
  if (entry.kind === "sewer-dig-spot") assert.equal(marker.mapId, "lower-city-sewers");
}

const profilesWithLoot = [...mapped.values()].filter(({ entity }) => entity.diggableSecret.buriedChest?.loot);

console.log(`Diggable secrets: ${mapped.size} exact mound-to-chest links mapped, including ${profilesWithLoot.length} authored loot profiles.`);
