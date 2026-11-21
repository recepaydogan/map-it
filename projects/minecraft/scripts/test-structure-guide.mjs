import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { GAME_GUIDE_ITEM_DESCRIPTION_KEYS, GAME_MAP_DIMENSIONS, GAME_RECIPE_SOURCES,
  GAME_STRUCTURE_DISCOVERIES, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";
import { parseMechanicsCatalogArtifact } from "../src/features/knowledge/mechanics-catalog-artifact.ts";
import { availableDiscoveryIds } from "../src/features/worlds/world-structure-discovery-sections.ts";
import { availableStructureGuideTypes, structureGuideDimensions } from "../src/features/knowledge/structure-guide-data.ts";
import { resolveWorldStructureSearchTarget } from "../src/features/worlds/world-structure-search-request.ts";

const readJson = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url)));
const current = availableStructureGuideTypes("java", "26.3");
assert.equal(current.length, 21);
assert.equal(new Set(current.map(type => type.knowledgeId)).size, current.length);
assert.equal(availableStructureGuideTypes("java", "1.18.2").length, 17);
assert.equal(availableStructureGuideTypes("java", "1.19.4").length, 18);
assert.equal(availableStructureGuideTypes("java", "1.20.1").length, 19);
assert.equal(availableStructureGuideTypes("java", "1.21.3").length, 20);
assert.equal(availableStructureGuideTypes("bedrock", "26.45").length, 20);
assert.equal(availableStructureGuideTypes("bedrock", "26.51").length, 21);
assert.equal(availableStructureGuideTypes("bedrock", "26.52").length, 21);
assert.deepEqual(GAME_STRUCTURE_DISCOVERIES["abandoned-camp"].loot.slice(0, 3),
  ["minecraft:map", "minecraft:straw_bed", "minecraft:white_cushion"]);
const wildernessSource = GAME_RECIPE_SOURCES.find(source => source.edition === "bedrock" && source.version === "26.52");
assert(wildernessSource);
const wildernessPath = "public/knowledge-data/bedrock/26.52";
const wildernessRecipes = parseRecipeCatalogArtifact(await readJson(`${wildernessPath}/recipes.json`), wildernessSource);
const wildernessMechanics = parseMechanicsCatalogArtifact(await readJson(`${wildernessPath}/mechanics.json`), wildernessSource);
const availableWildernessItems = new Set([...Object.keys(wildernessRecipes.index.produces),
  ...wildernessMechanics.subjects.filter(subject => subject.kind === "item").map(subject => subject.id)]);
for (const id of GAME_STRUCTURE_DISCOVERIES["abandoned-camp"].loot) {
  assert(availableWildernessItems.has(id), `Unlinked Bedrock camp reward ${id}`);
}
const strawBed = wildernessRecipes.recipes.find(recipe => recipe.id === "minecraft:straw_bed");
assert.equal(strawBed?.outputs[0].count, 4);
assert.equal(strawBed.ingredients.filter(ingredient => ingredient.choices.some(choice => choice.id === "minecraft:hay_block")).length, 3);
for (const color of ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
  "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"]) {
  for (const suffix of ["cushion", "wool_stairs", "wool_slab", "concrete_stairs", "concrete_slab"]) {
    const id = `minecraft:${color}_${suffix}`;
    assert(wildernessRecipes.index.produces[id]?.length, `Missing 26.52 recipe for ${id}`);
    assert(GAME_GUIDE_ITEM_DESCRIPTION_KEYS[id], `Missing guide description for ${id}`);
  }
}
for (const id of ["minecraft:poplar_planks", "minecraft:poplar_stairs", "minecraft:poplar_boat",
  "minecraft:poplar_sapling", "minecraft:red_shrub", "minecraft:shelf_mushroom"]) {
  assert(availableWildernessItems.has(id), `Missing Bedrock wilderness item ${id}`);
  assert(GAME_GUIDE_ITEM_DESCRIPTION_KEYS[id], `Missing wilderness description for ${id}`);
}
assert.deepEqual(structureGuideDimensions("minecraft:ruined_portal"), ["overworld", "nether"]);
assert.deepEqual(resolveWorldStructureSearchTarget("minecraft:ruined_portal", "overworld"),
  { typeId: "ruined-portal", dimensionId: "overworld" });
assert.deepEqual(resolveWorldStructureSearchTarget("minecraft:ruined_portal", "nether"),
  { typeId: "ruined-portal-nether", dimensionId: "nether" });
assert.deepEqual(resolveWorldStructureSearchTarget("minecraft:fortress", "overworld"),
  { typeId: "fortress", dimensionId: "nether" });
assert.deepEqual(resolveWorldStructureSearchTarget("minecraft:end_city", "nether"),
  { typeId: "end-city", dimensionId: "end" });
for (const type of current) {
  const target = resolveWorldStructureSearchTarget(type.knowledgeId, "overworld");
  assert(target && GAME_MAP_DIMENSIONS.some(dimension => dimension.id === target.dimensionId),
    `Missing map search target for ${type.knowledgeId}`);
}

for (const type of GAME_STRUCTURE_TYPES) {
  assert(GAME_STRUCTURE_DISCOVERIES[type.id], `Missing discoveries for ${type.id}`);
  await stat(new URL(`../public${type.preview}`, import.meta.url));
  await stat(new URL(`../public${type.artwork}`, import.meta.url));
}

for (const language of ["en", "es", "fr", "hi-IN", "pt-BR", "zh-Hans"]) {
  const locale = await readJson(`src/i18n/locales/${language}.json`);
  for (const type of current) {
    assert(locale.structureMap.types[type.id], `${language}: missing name for ${type.id}`);
    assert(locale.structureMap.descriptions[type.id], `${language}: missing description for ${type.id}`);
    assert(locale.inspector.structureGuide.locations[type.id], `${language}: missing location for ${type.id}`);
    assert(locale.inspector.structureGuide.tips[type.id], `${language}: missing approach for ${type.id}`);
  }
}

const items = new Set((await readJson("public/knowledge-data/java/26.3/items.json")).items);
const entities = new Set((await readJson("public/knowledge-data/java/26.3/mechanics.json")).subjects
  .filter(subject => subject.kind === "entity").map(subject => subject.id));
for (const type of current) {
  const discoveries = GAME_STRUCTURE_DISCOVERIES[type.id];
  for (const id of availableDiscoveryIds(discoveries.loot, "java", "26.3")) {
    assert(items.has(id), `Unlinked reward ${id} in ${type.id}`);
  }
  for (const id of availableDiscoveryIds(discoveries.mobs, "java", "26.3")) {
    assert(entities.has(id), `Unlinked mob ${id} in ${type.id}`);
  }
}

console.log("Structure guide availability, assets, translations and links passed.");
