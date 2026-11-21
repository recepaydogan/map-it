import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const mapsRoot = path.resolve(import.meta.dirname, "..", "public", "maps");
const itemDatabasePath = path.resolve(import.meta.dirname, "..", "public", "data", "item-database.json");
const readableFilterCategories = new Set([
  "item-books-lore",
  "item-letters-notes",
  "item-journals-records",
  "item-maps-plans",
  "item-arcane-books",
  "item-recipes",
  "item-publications",
]);
let markerCount = 0;
let readableMarkerCount = 0;
let paintingMarkerCount = 0;
let letterOfApologyCount = 0;
let balsamMarkerCount = 0;
let mergrassMarkerCount = 0;
const locationsByMapAndContentId = new Map();
const locationsByMap = new Map();

for (const entry of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const locationsPath = path.join(mapsRoot, entry.name, "locations.json");
  const contentPath = path.join(mapsRoot, entry.name, "content.json");
  if (!fs.existsSync(locationsPath) || !fs.existsSync(contentPath)) continue;

  const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations ?? [];
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const serializedContent = JSON.stringify(content);
  const entities = Array.isArray(content.entities) ? content.entities : Object.values(content.entities ?? {});
  markerCount += locations.length;

  for (const marker of locations) {
    locationsByMapAndContentId.set(`${entry.name}:${marker.contentId}`, marker);
    locationsByMap.set(entry.name, [...(locationsByMap.get(entry.name) ?? []), marker]);
    assert.doesNotMatch(marker.name, /^\d+$/, `${entry.name}:${marker.id} exposes a numeric developer name`);
    const readableFacets = (marker.categoryFacets ?? []).filter((facet) => readableFilterCategories.has(facet));
    assert.ok(readableFacets.length <= 1, `${entry.name}:${marker.id} has conflicting readable filters`);
    if (marker.category === "item-books") {
      assert.equal(readableFacets.length, 1, `${entry.name}:${marker.id} book marker has no focused readable filter`);
    }
    if (readableFacets.length > 0) readableMarkerCount += 1;
    if (marker.category === "item-paintings" || marker.categoryFacets?.includes("item-paintings")) paintingMarkerCount += 1;
    if (marker.name === "Letter of Apology") {
      letterOfApologyCount += 1;
      assert.ok(readableFacets.includes("item-letters-notes"), `${entry.name}:${marker.id} misclassifies Letter of Apology`);
    }
    if (marker.name === "Balsam") {
      balsamMarkerCount += 1;
      assert.equal(marker.category, "item-alchemy", `${entry.name}:${marker.id} misclassifies Balsam`);
    }
    if (marker.name === "Mergrass") {
      mergrassMarkerCount += 1;
      assert.equal(marker.category, "item-alchemy", `${entry.name}:${marker.id} misclassifies Mergrass`);
    }
    if (/^(?:Rows? of Books|Stacks? of Books|Pile of Books|Stacks of Scrolls)$/i.test(marker.name)) {
      assert.equal(readableFacets.length, 0, `${entry.name}:${marker.id} exposes decorative books as a readable`);
    }
  }
  for (const entity of entities) {
    assert.equal("dialogue" in entity, false, `${entry.name}:${entity.id} publishes dialogue`);
    if (entity.speakWithDead) {
      assert.deepEqual(Object.keys(entity.speakWithDead).sort(), ["dialogCount", "questionCount", "questions"],
        `${entry.name}:${entity.id} exposes raw corpse-dialog metadata`);
      assert.ok(entity.speakWithDead.questions.every((question) => Object.keys(question).every((key) => ["id", "localizedText"].includes(key))),
        `${entry.name}:${entity.id} exposes more than localized Speak with Dead questions`);
    }
  }
  assert.equal(serializedContent.includes('"starts-dialogue"'), false, `${entry.name} publishes dialogue outcomes`);
  assert.equal(serializedContent.includes('"approvalEvents"'), false, `${entry.name} publishes approval effects`);
  assert.equal(serializedContent.includes('"choiceOutcomes"'), false, `${entry.name} publishes choice effects`);
}

const rarityRank = { common: 0, uncommon: 1, rare: 2, veryrare: 3, legendary: 4 };
const jewellerySlots = new Set(["amulet", "ring", "cloak"]);
const uniqueEquipmentClass = (item) => {
  if ((rarityRank[item.rarity?.toLocaleLowerCase("en-US")] ?? 0) < rarityRank.uncommon) return null;
  const type = item.type?.toLocaleLowerCase("en-US");
  const slot = item.gameplay?.slot?.toLocaleLowerCase("en-US") ?? "";
  const shieldLike = /shield/i.test(`${item.gameplay?.weaponType ?? ""} ${item.gameplay?.armorType ?? ""} ${item.gameplay?.proficiency ?? ""}`)
    || slot === "melee offhand weapon";
  if (type === "weapon") return shieldLike ? "shield" : "weapon";
  if (type !== "armor") return null;
  if (shieldLike) return "shield";
  return jewellerySlots.has(slot) ? "jewellery" : "armor";
};
const itemDatabase = JSON.parse(fs.readFileSync(itemDatabasePath, "utf8"));
let mappedUniqueEquipmentAcquisitions = 0;
for (const item of itemDatabase.items ?? []) {
  const equipmentClass = uniqueEquipmentClass(item);
  if (!equipmentClass) continue;
  for (const acquisition of item.acquisitions ?? []) {
    if (!acquisition.mapId || !acquisition.locationId) continue;
    const marker = locationsByMapAndContentId.get(`${acquisition.mapId}:${acquisition.locationId}`);
    assert.ok(marker, `${item.name} acquisition has no ${acquisition.mapId}:${acquisition.locationId} marker.`);
    const categories = new Set([marker.category, ...(marker.categoryFacets ?? [])]);
    const directItemMarker = (locationsByMap.get(acquisition.mapId) ?? []).find((location) => (
      location.name === item.name
      && new Set([location.category, ...(location.categoryFacets ?? [])]).has(`unique-${equipmentClass}`)
    ));
    assert.ok(
      categories.has(`unique-${equipmentClass}`) || directItemMarker,
      `${item.name} at ${acquisition.source} has no unique-${equipmentClass} marker.`,
    );
    mappedUniqueEquipmentAcquisitions += 1;
  }
}

assert.ok(markerCount > 0, "public marker data exists");
assert.ok(readableMarkerCount >= 500, "Expected named readable markers across the registered maps.");
assert.ok(paintingMarkerCount >= 50, "Expected named painting markers across the registered maps.");
assert.ok(letterOfApologyCount > 0, "Letter of Apology must be published as a letter and note marker.");
assert.ok(balsamMarkerCount > 0, "Balsam placements must be published as alchemy markers.");
assert.ok(mergrassMarkerCount > 0, "Mergrass placements must be published as alchemy markers.");
assert.ok(mappedUniqueEquipmentAcquisitions >= 500, "Expected mapped uncommon-or-better equipment acquisitions.");
const sharsTemptationSource = locationsByMapAndContentId.get("shadow-cursed-lands:485f5497-f97e-4f05-a85a-f35c0c18d283");
assert.ok(sharsTemptationSource?.categoryFacets?.includes("unique-jewellery"), "Shar's Temptation source is missing from unique jewellery.");
console.log(`Public marker content tests passed for ${markerCount} markers, including ${readableMarkerCount} readables, ${paintingMarkerCount} paintings and ${mappedUniqueEquipmentAcquisitions} uncommon-or-better equipment acquisitions.`);
