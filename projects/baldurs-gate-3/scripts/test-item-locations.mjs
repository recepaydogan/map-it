import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const mapsRoot = path.join(projectRoot, "public", "maps");
const mapped = new Map();
let placementCount = 0;
const kindCounts = new Map();
const sourceRecords = new Map(JSON.parse(fs.readFileSync(path.join(projectRoot,
  "map-sources/catalog/wilderness-placements.json"), "utf8")).records.map((record) => [record.id, record]));
const transfers = JSON.parse(fs.readFileSync(path.join(projectRoot,
  "map-sources/catalog/story-location-relations.json"), "utf8")).initialItemTransfers;

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  const locationsPath = path.join(mapsRoot, directory.name, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;
  const entities = JSON.parse(fs.readFileSync(contentPath, "utf8")).entities ?? [];
  const locations = new Map(JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations
    .map((location) => [location.contentId, location]));
  for (const entity of entities.filter(({ itemLocation }) => itemLocation)) {
    placementCount += 1;
    assert.ok(locations.has(entity.id), `${entity.id} has an ownership profile without a marker on ${directory.name}.`);
    assert.ok(["inventory-owner", "initial-inventory"].includes(entity.itemLocation.kind));
    assert.ok(entity.itemLocation.ownerContentId);
    assert.ok(entity.itemLocation.ownerTitle);
    assert.ok(entity.itemLocation.evidence.length > 0);
    const profile = entity.itemLocation;
    if (profile.kind === "inventory-owner") {
      const owner = sourceRecords.get(profile.ownerContentId);
      const item = owner?.inventoryItems.find(({ objectId }) => objectId === entity.id);
      assert.ok(item, `${entity.id} occurs in the exact owner's authored inventory`);
      assert.equal(profile.droppedOnDeath, item.droppedOnDeath);
      assert.equal(profile.pickpocketable, item.canBePickpocketed);
      assert.equal(profile.tradeable, item.tradeable);
      assert.equal(profile.ownerKind, owner.placementKind === "characters" ? "character" : "container");
    } else {
      assert.ok(transfers.some(({ item, target }) => item.id === entity.id && target.id === profile.ownerContentId),
        `${entity.id} is transferred to this owner by an authored initial-inventory statement`);
      assert.equal(profile.droppedOnDeath, false);
      assert.equal(profile.pickpocketable, false);
      assert.equal(profile.tradeable, false);
    }
    kindCounts.set(entity.itemLocation.kind, (kindCounts.get(entity.itemLocation.kind) ?? 0) + 1);
    mapped.set(entity.id, { mapId: directory.name, entity });
  }
}

assert.ok(mapped.size >= 422, "Previously covered carried items remain represented as coverage expands.");
assert.equal(mapped.size, placementCount, "Carried-item markers must not be duplicated across registered maps.");
assert.deepEqual([...kindCounts.keys()].sort(), ["initial-inventory", "inventory-owner"]);

const orinLetter = mapped.get("671d972d-2461-4fc6-8860-a952b6bdec8c");
assert.equal(orinLetter.mapId, "counting-house-vault");
assert.equal(orinLetter.entity.itemLocation.ownerContentId, "4da802f5-3237-40b8-afff-d728016e3047");
assert.equal(orinLetter.entity.itemLocation.pickpocketable, true);
assert.equal(orinLetter.entity.itemLocation.droppedOnDeath, true);
assert.ok(orinLetter.entity.readableImpact.questUpdates.some(({ questId }) => questId === "LOW_Guildhall"));

const torturersKey = mapped.get("536107bd-277b-42bb-8eaf-2b787123615c");
assert.equal(torturersKey.entity.itemLocation.kind, "initial-inventory");
assert.equal(torturersKey.entity.itemLocation.ownerTitle, "Torturer Spike");

console.log(`Item locations: ${mapped.size} exact carried-item markers and their acquisition methods verified.`);
