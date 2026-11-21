import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "item-story-impacts.json"), "utf8"));
const mapsRoot = path.join(projectRoot, "public", "maps");
const mapped = new Map();
let placementCount = 0;

assert.deepEqual(catalog.stats, {
  exactItems: 222,
  itemTemplates: 32,
  carryingLinks: 222,
  handInLinks: 164,
  questUpdates: 25,
});

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  const locationsPath = path.join(mapsRoot, directory.name, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
  const locationsByContentId = new Map(locations.locations.map((location) => [location.contentId, location]));
  for (const entity of content.entities) {
    const sources = [catalog.byObjectId[entity.id], catalog.byTemplateId[entity.templateId]].filter(Boolean);
    assert.equal(Boolean(entity.itemStoryImpact), sources.length > 0,
      `${directory.name}/${entity.id} publishes a story-item profile exactly when the source identifies it`);
    if (sources.length === 0) continue;
    assert.equal(entity.itemStoryImpact.exactObjectMatch, Boolean(catalog.byObjectId[entity.id]));
    assert.equal(entity.itemStoryImpact.templateMatch, Boolean(catalog.byTemplateId[entity.templateId]));
    for (const [sourceField, publicField] of [["carryingFlags", "carrying"], ["handIns", "handIns"]]) {
      assert.deepEqual(entity.itemStoryImpact[publicField].map(({ flagId }) => flagId).sort(),
        [...new Set(sources.flatMap((source) => source[sourceField].map(({ flag }) => flag.id)))].sort(),
        `${entity.id} exact ${publicField} flags`);
    }
    assert.deepEqual(entity.itemStoryImpact.questUpdates.map(({ id }) => id).sort(),
      [...new Set(sources.flatMap(({ questUpdates }) => questUpdates.map(({ id }) => id)))].sort(), `${entity.id} exact journal update set`);
    placementCount += 1;
    const location = locationsByContentId.get(entity.id);
    assert.ok(location, `Story item ${entity.id} has content but no location on ${directory.name}.`);
    assert.ok(Number.isFinite(location.x) && Number.isFinite(location.y));
    assert.ok(entity.worldPosition && [entity.worldPosition.x, entity.worldPosition.y, entity.worldPosition.z].every(Number.isFinite));
    assert.ok(entity.itemStoryImpact.exactObjectMatch || entity.itemStoryImpact.templateMatch);
    for (const impact of [
      ...entity.itemStoryImpact.carrying,
      ...entity.itemStoryImpact.handIns,
      ...entity.itemStoryImpact.questUpdates,
    ]) {
      assert.ok(impact.evidence.length > 0);
      assert.ok(impact.evidence.every(({ sourcePath, sourceLine, statement }) => sourcePath && sourceLine > 0 && statement));
    }
    const instances = mapped.get(entity.id) ?? [];
    instances.push(entity);
    mapped.set(entity.id, instances);
  }
}

assert.ok(mapped.size >= 221, "Previously covered story-item profiles remain represented as coverage expands.");
assert.equal(mapped.size, placementCount, "Story-item markers must not be duplicated across registered maps.");

const entity = (id) => mapped.get(id)?.[0];
const dawnmasterCrest = entity("b0b3322f-c707-4f96-a3c9-ab4265a7452a");
assert.equal(dawnmasterCrest.itemStoryImpact.questUpdates[0].localizedQuestTitles.en, "Find the Blood of Lathander");
assert.match(dawnmasterCrest.itemStoryImpact.questUpdates[0].localizedStateDescriptions.en, /oddly shaped crest/i);

const gauntlets = entity("1cb8450d-016f-43d4-bb44-79688170f073");
assert.equal(gauntlets.itemStoryImpact.questUpdates[0].localizedQuestTitles.en, "Acquire the Gauntlets for Helsik");
assert.equal(gauntlets.itemStoryImpact.handIns.length, 1);

const molEyepatch = entity("fa9baba1-f855-449c-8327-9728a493b193");
assert.ok(molEyepatch.itemStoryImpact.exactObjectMatch && molEyepatch.itemStoryImpact.templateMatch);
assert.equal(molEyepatch.itemStoryImpact.questUpdates[0].localizedQuestTitles.en, "Find Mol");
assert.equal(molEyepatch.itemStoryImpact.handIns.length, 1);

const wulbrenHead = entity("2e02bb20-3619-44d2-b1be-cca9697dfc01");
assert.equal(wulbrenHead.itemStoryImpact.questUpdates[0].localizedQuestTitles.en, "Deal with the Gnomes");
assert.equal(wulbrenHead.itemStoryImpact.handIns.length, 1);

console.log(`Item story impacts: ${mapped.size} unique items at ${placementCount} map placements verified.`);
