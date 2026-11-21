import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_GUIDE_REDSTONE_COMPONENTS, GAME_GUIDE_REDSTONE_GROUPS } from "../src/game-config.ts";
import { createCraftingGuideIndex } from "../src/features/knowledge/crafting-guide-data.ts";
import { createRedstoneGuideIndex, redstoneGuideItemId, redstoneSignalAt } from "../src/features/knowledge/redstone-guide-data.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";

const readJson = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url)));
const componentKeys = new Set(GAME_GUIDE_REDSTONE_COMPONENTS.map(component => component.key));
assert.equal(componentKeys.size, GAME_GUIDE_REDSTONE_COMPONENTS.length);
assert.equal(GAME_GUIDE_REDSTONE_COMPONENTS.length, 26);
assert.equal(redstoneSignalAt(1, true, false), 15);
assert.equal(redstoneSignalAt(15, true, false), 1);
assert.equal(redstoneSignalAt(16, true, false), 0);
assert.equal(redstoneSignalAt(16, true, true), 15);
assert.equal(redstoneSignalAt(30, true, true), 1);
assert.equal(redstoneSignalAt(16, false, true), 0);
for (const component of GAME_GUIDE_REDSTONE_COMPONENTS) {
  assert(GAME_GUIDE_REDSTONE_GROUPS.includes(component.group), `Unknown group: ${component.key}`);
  for (const key of component.related) assert(componentKeys.has(key), `Broken related part: ${component.key} -> ${key}`);
}

const javaItems = new Set((await readJson("public/knowledge-data/java/26.3/items.json")).items);
const oldItems = new Set((await readJson("public/knowledge-data/java/1.19.4/items.json")).items);
const javaIndex = createRedstoneGuideIndex("java");
assert.equal(javaIndex.size, 26);
assert([...javaIndex.keys()].every(id => javaItems.has(id)), "Current Java component missing from the item catalog");
assert.equal([...javaIndex.keys()].filter(id => oldItems.has(id)).length, 24);
assert(!oldItems.has("minecraft:crafter"));
assert(!oldItems.has("minecraft:calibrated_sculk_sensor"));

const bedrockIndex = createRedstoneGuideIndex("bedrock");
assert.equal(bedrockIndex.size, 26);
assert.equal(redstoneGuideItemId(GAME_GUIDE_REDSTONE_COMPONENTS.find(component => component.key === "powered_rail"),
  "bedrock"), "minecraft:golden_rail");
assert.equal(redstoneGuideItemId(GAME_GUIDE_REDSTONE_COMPONENTS.find(component => component.key === "note_block"),
  "bedrock"), "minecraft:noteblock");
const bedrockRecipes = await readJson("public/knowledge-data/bedrock/26.45/recipes.json");
const bedrockMechanics = await readJson("public/knowledge-data/bedrock/26.45/mechanics.json");
const bedrockSubjects = new Set([
  ...Object.keys(bedrockRecipes.index.produces), ...Object.keys(bedrockRecipes.index.usesItem),
  ...bedrockMechanics.subjects.map(subject => subject.id),
]);
assert([...bedrockIndex.keys()].every(id => bedrockSubjects.has(id)), "Bedrock component is not browsable");

for (const [edition, version, expected] of [["java", "26.3", 25], ["bedrock", "26.45", 25]]) {
  const artifact = await readJson(`public/knowledge-data/${edition}/${version}/recipes.json`);
  const crafting = createCraftingGuideIndex(parseRecipeCatalogArtifact(artifact, artifact.source).recipes);
  const index = createRedstoneGuideIndex(edition);
  assert.equal([...index.keys()].filter(id => crafting.has(id)).length, expected);
}

for (const language of ["en", "es", "fr", "hi-IN", "pt-BR", "zh-Hans"]) {
  const locale = await readJson(`src/i18n/locales/${language}.json`);
  const guide = locale.inspector.redstoneGuide;
  assert(locale.inspector.subjectKinds.redstone, `${language}: missing category label`);
  for (const group of GAME_GUIDE_REDSTONE_GROUPS) {
    assert(guide.groups[group] && guide.groupIntro[group], `${language}: missing group ${group}`);
  }
  for (const component of GAME_GUIDE_REDSTONE_COMPONENTS) {
    assert(guide.parts[component.key]?.behavior && guide.parts[component.key]?.example,
      `${language}: missing content for ${component.key}`);
  }
}

console.log("Redstone guide availability, recipe coverage, translations and links passed.");
