import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "readable-impacts.json"), "utf8"));
const mapsRoot = path.join(projectRoot, "public", "maps");
const mapped = new Map();
let placementCount = 0;

assert.deepEqual(catalog.stats, {
  objectReadables: 76,
  templateReadables: 16,
  flagImpacts: 93,
  questUpdates: 62,
  mapReveals: 4,
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
    assert.equal(Boolean(entity.readableImpact), sources.length > 0,
      `${directory.name}/${entity.id} publishes a readable profile exactly when the source identifies it`);
    if (sources.length === 0) continue;
    assert.deepEqual(entity.readableImpact.flags.map(({ id }) => id).sort(),
      [...new Set(sources.flatMap(({ flags }) => flags.map(({ id }) => id)))].sort(), `${entity.id} exact flag set`);
    assert.deepEqual(entity.readableImpact.questUpdates.map(({ id }) => id).sort(),
      [...new Set(sources.flatMap(({ questUpdates }) => questUpdates.map(({ id }) => id)))].sort(), `${entity.id} exact journal update set`);
    assert.equal(entity.readableImpact.exactObjectMatch, Boolean(catalog.byObjectId[entity.id]));
    assert.equal(entity.readableImpact.templateMatch, Boolean(catalog.byTemplateId[entity.templateId]));
    placementCount += 1;
    const location = locationsByContentId.get(entity.id);
    assert.ok(location, `Readable ${entity.id} has content but no location on ${directory.name}.`);
    assert.ok(Number.isFinite(location.x) && Number.isFinite(location.y));
    assert.ok(entity.worldPosition && [entity.worldPosition.x, entity.worldPosition.y, entity.worldPosition.z].every(Number.isFinite));
    assert.ok(entity.readableImpact.exactObjectMatch || entity.readableImpact.templateMatch);
    for (const impact of [...entity.readableImpact.flags, ...entity.readableImpact.questUpdates]) {
      assert.ok(impact.evidence.length > 0);
      assert.ok(impact.evidence.every(({ sourcePath, sourceLine, statement }) => sourcePath && sourceLine > 0 && statement));
    }
    mapped.set(entity.id, entity);
  }
}

assert.ok(mapped.size >= 61, "Previously covered readable profiles remain represented as coverage expands.");
assert.equal(mapped.size, placementCount, "Readable markers must not be duplicated across registered maps.");

const shadowDruidLetter = mapped.get("b0da8ce3-139f-425b-bbce-ae67663b8a2c");
assert.deepEqual(
  shadowDruidLetter.readableImpact.flags.map(({ title }) => title).sort((left, right) => left.localeCompare(right, "en")),
  ["Meeting Location", "Recruitment Letter"],
);

const pinCodeBook = mapped.get("a43fbef3-8c57-4d5d-80d0-a18d01f2a0a7");
assert.equal(pinCodeBook.readableImpact.questUpdates[0].localizedQuestTitles.en, "Aid the Underduke");
assert.match(pinCodeBook.readableImpact.questUpdates[0].localizedStateDescriptions.en, /1356/);

const lorasMap = mapped.get("e2d9a908-fcbb-4371-ba4d-080091d152c7");
assert.ok(lorasMap.readableImpact.flags.some(({ kind }) => kind === "map-reveal"));

const arcanePoem = mapped.get("4bf3a80f-3011-477c-b9ba-a036f5645099");
assert.ok(arcanePoem.readableImpact.flags.some(({ flagId }) => flagId === "173a2d4b-6a43-429b-a4d8-0d22b73ca3ea"));

const orinNote = mapped.get("9c029a99-2636-4c19-9ff3-c7564a91cd35");
assert.ok(orinNote.readableImpact.flags.some(({ flagId }) => flagId === "839150e6-d168-4c89-a980-68b9e9f60556"));
assert.ok(orinNote.readableImpact.flags.some(({ flagId }) => flagId === "8a939a44-bb4a-d32f-0584-388d248f565c"));

console.log(`Readable impacts: ${mapped.size} unique documents at ${placementCount} correct map placements verified.`);
