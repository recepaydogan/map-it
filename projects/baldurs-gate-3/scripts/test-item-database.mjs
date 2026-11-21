import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { selectAcquisitionNameMatches } from "./lib/item-acquisition-identity.mjs";

const quoted = { id: "quoted", localizedNames: { en: "'Example' Ring" } };
const unquoted = { id: "unquoted", localizedNames: { en: "Example Ring" } };
assert.deepEqual(selectAcquisitionNameMatches([quoted, unquoted], ["'Example' Ring"]), [quoted]);
assert.deepEqual(selectAcquisitionNameMatches([quoted, unquoted], ["Example Ring"]), [unquoted]);
assert.deepEqual(selectAcquisitionNameMatches([quoted, unquoted], ["ExampleRing"]), []);
assert.deepEqual(selectAcquisitionNameMatches([quoted, quoted], ["'Example' Ring"]), [quoted]);
assert.deepEqual(selectAcquisitionNameMatches([quoted, { ...quoted, id: "another" }], ["'Example' Ring"]), []);

const catalogPath = path.resolve(import.meta.dirname, "../public/data/item-database.json");
const mapsRoot = path.resolve(import.meta.dirname, "../public/maps");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const recipeById = new Map(catalog.recipes.map((recipe) => [recipe.id, recipe]));

assert.equal(catalog.schemaVersion, 3, "Unexpected item database schema version.");
assert.ok(catalog.items.length >= 5_000, "Expected at least 5,000 localized item variants.");
assert.equal(new Set(catalog.items.map((item) => item.id)).size, catalog.items.length, "Item IDs must be unique.");
assert.ok(catalog.items.every((item) => item.name && item.localizedNames?.en), "Every item must use an English game-localized display name.");
assert.ok(catalog.items.every((item) => item.statsId && item.templateIds?.length), "Every item must retain its source identifiers.");
assert.ok(catalog.items.every((item) => item.properties && item.gameplay), "Every item must include extracted properties and gameplay data.");
assert.ok(catalog.stats.iconsResolved >= 5_000, "Expected at least 5,000 game icon mappings.");
assert.ok(catalog.stats.acquisitionRecords >= 10_000, "Expected mined acquisition records.");
assert.ok(catalog.items.every((item) => Array.isArray(item.acquisitions)), "Every item must expose acquisition records.");
const ordinaryRing = catalog.items.find(({ statsId }) => statsId === "DEN_Thiefling_Ring5");
const restoredRing = catalog.items.find(({ statsId }) => statsId === "QUEST_WYR_RestoredMagicRing");
assert.ok(ordinaryRing?.acquisitions.some(({ sourceId }) => sourceId === "e1fda08b-45d4-41db-84b5-20e9931ba5af"), "Preserve the character's actual ring acquisitions");
assert.ok(restoredRing && !restoredRing.acquisitions.some(({ sourceId }) => sourceId === "e1fda08b-45d4-41db-84b5-20e9931ba5af"), "Do not conflate the quoted ring name with the restored item");
assert.ok(catalog.stats.attachedRecipes >= 500, "Expected resolved game crafting recipes.");
assert.ok(catalog.stats.relationRecords >= 1_500, "Expected reverse crafting usage records.");
assert.equal(new Set(catalog.recipes.map(({ id }) => id)).size, catalog.recipes.length, "Crafting recipes must be normalized by ID.");

const mapLocations = new Map();
let linkedAcquisitions = 0;
for (const item of catalog.items) {
  for (const acquisition of item.acquisitions) {
    if (!acquisition.mapId && !acquisition.locationId) continue;
    assert.ok(acquisition.mapId && acquisition.locationId, `${acquisition.id} has a partial map target.`);
    if (!mapLocations.has(acquisition.mapId)) {
      const locationsPath = path.join(mapsRoot, acquisition.mapId, "locations.json");
      assert.ok(fs.existsSync(locationsPath), `${acquisition.id} references missing map ${acquisition.mapId}.`);
      mapLocations.set(
        acquisition.mapId,
        new Set(JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations.map(({ id }) => id)),
      );
    }
    assert.ok(
      mapLocations.get(acquisition.mapId).has(acquisition.locationId),
      `${acquisition.id} references missing location ${acquisition.mapId}:${acquisition.locationId}.`,
    );
    linkedAcquisitions += 1;
  }
}
assert.ok(linkedAcquisitions >= 10_000, "Expected at least 10,000 acquisition records linked to map markers.");

const everburnBlade = catalog.items.find((item) => item.name === "Everburn Blade");
assert.ok(everburnBlade, "Everburn Blade must be present by its in-game display name.");
assert.notEqual(everburnBlade.name, everburnBlade.statsId, "Display names must not fall back to internal stat IDs.");
assert.equal(everburnBlade.category, "weapons");
assert.equal(everburnBlade.subtype, "Greatsword");
assert.equal(everburnBlade.gameplay.damage, "2d6");
assert.ok(everburnBlade.icon?.atlas, "Everburn Blade must resolve to a game icon atlas.");

const adamantineShield = catalog.items.find((item) => item.name === "Adamantine Shield");
assert.equal(adamantineShield?.category, "shields", "Shield classification must use the extracted Shield stat.");

const sorcerousSundriesKey = catalog.items.find((item) => item.name === "Sorcerous Sundries Basement Chest Key");
assert.equal(sorcerousSundriesKey?.category, "keys", "Keys must not inherit the shared BooksAndKeys inventory category.");

const letterOfApology = catalog.items.find((item) => item.name === "Letter of Apology");
assert.equal(letterOfApology?.category, "books", "Readable letters must remain in the books and notes item family.");

const alchemyIngredients = catalog.items.filter((item) =>
  /(?:^|;)ALCH_Ingredient_[^;]*_Passive(?:;|$)/i.test(item.properties.PassivesOnEquip ?? ""));
assert.ok(alchemyIngredients.length >= 60, "Expected the extracted alchemy ingredient family.");
assert.ok(
  alchemyIngredients.every((item) => item.category === "alchemy"),
  "Every item marked with an alchemy ingredient passive must use the alchemy category.",
);
assert.equal(catalog.items.find((item) => item.name === "Balsam")?.category, "alchemy");
assert.equal(catalog.items.find((item) => item.name === "Mergrass")?.category, "alchemy");
for (const name of ["Balsam", "Mergrass"]) {
  const item = catalog.items.find((candidate) => candidate.name === name);
  assert.ok(
    item?.acquisitions.some(({ kind, mapId, locationId }) => kind === "world" && mapId && locationId),
    `${name} must link to at least one exact world marker.`,
  );
}

const balsam = catalog.items.find((item) => item.name === "Balsam");
const ashesOfBalsam = catalog.items.find((item) => item.name === "Ashes of Balsam");
assert.ok(
  balsam?.crafting?.usedIn.some(({ resultItemId }) => resultItemId === ashesOfBalsam?.id),
  "Balsam must link forward to the extract recipe that consumes it.",
);
assert.equal(
  recipeById.get(ashesOfBalsam?.crafting?.recipeIds.find((id) => id === "ALCH_Extract_Balsam_1"))
    ?.materials.find(({ sourceId }) => sourceId === "CONS_Herbs_Balsam")?.amount,
  3,
  "Ashes of Balsam must expose the three Balsam ingredients consumed by its recipe.",
);

const greaterHealingPotion = catalog.items.find((item) => item.name === "Potion of Greater Healing");
const greaterHealingRecipe = recipeById.get(greaterHealingPotion?.crafting?.recipeIds
  .find((id) => id === "ALCH_Potion_HealingGreater_Balsam_1"));
assert.ok(greaterHealingRecipe, "Potion of Greater Healing must expose its alchemy recipe.");
assert.ok(
  greaterHealingRecipe.materials.some(({ sourceId, options }) => (
    sourceId === "ALCH_Affinity_Earth" && options.length > 1
  )),
  "Category-based alchemy ingredients must expose every compatible item option.",
);

const mithralOre = catalog.items.find((item) => item.name === "Mithral Ore");
const adamantineLongsword = catalog.items.find((item) => item.name === "Adamantine Longsword");
const adamantineLongswordRecipe = adamantineLongsword?.crafting?.recipeIds
  .map((id) => recipeById.get(id))
  .find(({ source }) => source === "adamantine-forge");
assert.ok(
  adamantineLongswordRecipe?.materials.some(({ options }) => options.includes(mithralOre?.id)),
  "Adamantine Forge outputs must list Mithral Ore as a material.",
);
assert.ok(
  mithralOre?.crafting?.usedIn.some(({ resultItemId }) => resultItemId === adamantineLongsword?.id),
  "Mithral Ore must link back to Adamantine Forge outputs that consume it.",
);

const allandrasWhelm = catalog.items.find((item) => item.statsId === "MAG_LC_Frigid_Trident");
assert.ok(allandrasWhelm, "Allandra's Whelm must be present.");
assert.equal(allandrasWhelm.gameplay.enchantment, 2);
assert.equal(allandrasWhelm.gameplay.magical, true);
assert.deepEqual(
  allandrasWhelm.gameplay.effects.map((effect) => effect.name),
  ["Rush Attack", "Piercing Strike", "Maiming Strike", "Frigid Blade"],
  "Granted actions must resolve to their localized in-game display names.",
);
assert.ok(
  allandrasWhelm.gameplay.effects.every((effect) => !effect.name.includes(effect.id)),
  "Internal spell identifiers must not be exposed as effect names.",
);

const sickleOfBoooal = catalog.items.find((item) => item.statsId === "UNI_SickleOfBOOOAL");
assert.equal(sickleOfBoooal?.name, "Sickle of BOOOAL");
assert.ok(
  sickleOfBoooal.acquisitions.some(({ kind, source }) => kind === "drop" && source === "Pooldripp the Zealous"),
  "Sickle of BOOOAL must include its guaranteed character drop.",
);
assert.ok(
  sickleOfBoooal.acquisitions.some(({ kind, source }) => kind === "pickpocket" && source === "Pooldripp the Zealous"),
  "Sickle of BOOOAL must include its pickpocket route.",
);
assert.ok(
  sickleOfBoooal.acquisitions.some(({ kind, detail }) => kind === "reward" && detail?.includes("BOOOAL's Chosen")),
  "Sickle of BOOOAL must include its dialogue reward choice.",
);

const detectThoughtsScroll = catalog.items.find((item) => item.statsId === "OBJ_Scroll_DetectThoughts");
const scrollStackSources = detectThoughtsScroll?.acquisitions
  .filter(({ source }) => source === "Stacks of Scrolls") ?? [];
assert.deepEqual(
  [...new Set(scrollStackSources.map(({ kind }) => kind))],
  ["container"],
  "Container inventory must not be exposed as character drop or pickpocket methods.",
);
const shadowheartScrollSources = detectThoughtsScroll?.acquisitions
  .filter(({ source }) => source === "Shadowheart") ?? [];
assert.equal(new Set(shadowheartScrollSources.map(({ sourceId }) => sourceId)).size, 1);
assert.ok(
  shadowheartScrollSources.every(({ sourceId }) => sourceId === "party-member:shadowheart"),
  "Alternative character positions must retain one stable source identity.",
);

// Crimson Mischief has no authored world or inventory placement; its only
// verified source is Orin's scripted equip statement, which links to Orin's
// story-destination marker in the Temple of Bhaal (inside the sewers map).
const crimsonMischief = catalog.items.find((item) => item.statsId === "MAG_TheCrimson_Shortsword");
assert.equal(crimsonMischief?.name, "Crimson Mischief");
const crimsonMischiefSource = crimsonMischief.acquisitions.find(({ kind, certainty, source }) => kind === "carried" && certainty === "story" && source === "Orin");
assert.ok(crimsonMischiefSource, "Crimson Mischief must resolve to Orin through the scripted item transfer catalog.");
assert.equal(crimsonMischiefSource.mapId, "lower-city-sewers", "Crimson Mischief must link to Orin's Temple of Bhaal marker.");
assert.ok(crimsonMischiefSource.locationId, "Crimson Mischief must link to an exact map location.");

const categoryTotal = catalog.categories.reduce((sum, category) => sum + category.count, 0);
assert.equal(categoryTotal, catalog.items.length, "Category counts must cover the entire catalog.");

console.log(`Item database: ${catalog.items.length} localized items verified.`);
