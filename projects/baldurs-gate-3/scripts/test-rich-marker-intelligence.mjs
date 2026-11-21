import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const inspirationCatalog = readJson(path.join(projectRoot, "map-sources", "catalog", "inspiration-events.json"));

assert.ok(inspirationCatalog.stats.registeredEvents >= 500, "Expected the complete authored inspiration registry.");
assert.ok(inspirationCatalog.stats.backgrounds >= 20, "Expected standard and origin backgrounds.");
assert.deepEqual(
  inspirationCatalog.byObjectId["23960bf1-7391-439d-8027-600646017734"],
  ["3578758d-c812-4f8f-ac23-84e87b50fe45"],
  "Olam's Journal must only expose its exact Aasimar Journal inspiration event.",
);
for (const event of Object.values(inspirationCatalog.events)) {
  assert.ok(event.localizedTitles.en, `${event.id} has no English title.`);
  assert.ok(event.localizedDescriptions.en, `${event.id} has no English task description.`);
  assert.ok(event.background?.localizedNames?.en, `${event.id} has no resolved background.`);
  assert.ok(event.inspirationPoints > 0, `${event.id} has no Inspiration reward.`);
}

let inspirationAppearances = 0;
let guaranteedDropAppearances = 0;
let guaranteedDrops = 0;
let randomLootPoolAppearances = 0;

for (const directory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(projectRoot, "public", "maps", directory.name, "content.json");
  const locationsPath = path.join(projectRoot, "public", "maps", directory.name, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;
  const content = readJson(contentPath);
  const locations = readJson(locationsPath).locations ?? [];
  const locationByContentId = new Map(locations.map((location) => [location.contentId, location]));

  for (const entity of Object.values(content.entities ?? {})) {
    if (entity.inspirations) {
      inspirationAppearances += 1;
      const location = locationByContentId.get(entity.id);
      assert.ok(location, `${directory.name}:${entity.id} inspiration entity has no marker.`);
      assert.ok(location.category === "inspiration" || location.categoryFacets?.includes("inspiration"), `${directory.name}:${entity.id} is missing the inspiration filter facet.`);
      for (const event of entity.inspirations.events) {
        assert.ok(inspirationCatalog.events[event.id], `${entity.id} exposes unknown inspiration event ${event.id}.`);
      }
    }
    if (entity.deathLoot) {
      for (const drop of entity.deathLoot.guaranteedDrops) {
        assert.equal(drop.guaranteedOnDeath, true, `${entity.id}:${drop.itemName} is not an authored death drop.`);
        assert.ok(drop.title && drop.amount > 0, `${entity.id}:${drop.itemName} has incomplete drop details.`);
        guaranteedDrops += 1;
      }
      if (entity.deathLoot.guaranteedDrops.length > 0) guaranteedDropAppearances += 1;
      if (entity.deathLoot.randomLootPools.length > 0) randomLootPoolAppearances += 1;
    }
  }
}

assert.ok(inspirationAppearances > 0, "Expected map-linked inspirational events.");
assert.ok(guaranteedDropAppearances > 0, "Expected characters with authored on-death drops.");
assert.ok(guaranteedDrops > 0, "Expected guaranteed item drops.");
assert.ok(randomLootPoolAppearances > 0, "Expected characters with random loot pools.");

console.log(`Rich marker intelligence: ${inspirationAppearances} inspiration appearances, ${guaranteedDrops} guaranteed drops on ${guaranteedDropAppearances} character appearances, ${randomLootPoolAppearances} random-loot appearances.`);
