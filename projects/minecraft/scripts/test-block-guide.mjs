import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMissingWoodBlockRecipe, missingWoodBlockOutputs, visibleBlockGuideIds } from
  "../src/features/knowledge/block-guide-data.ts";
import { fitsInventoryCrafting } from "../src/features/knowledge/crafting-guide-data.ts";
import { gameKnowledgeCanonicalItemId, gameKnowledgeRecipeSubjectKind } from
  "../src/features/knowledge/game-guide-item-identity.ts";
import { GAME_GUIDE_ORE_BLOCKS } from "../src/game-config.ts";

const bedrock = JSON.parse(await readFile(new URL("../public/knowledge-data/bedrock/26.45/recipes.json", import.meta.url)));
const native = new Map(bedrock.recipes.flatMap(recipe => recipe.outputs.map(output => [output.id, recipe])));
const crafted = new Set(native.keys());
const missing = ["button", "pressure_plate", "trapdoor"];

for (const suffix of missing) {
  const id = `minecraft:acacia_${suffix}`;
  const fallback = createMissingWoodBlockRecipe(id, crafted.has(id), true);
  const donor = native.get(`minecraft:cherry_${suffix}`);
  assert(donor, `Missing Bedrock family evidence for ${suffix}`);
  assert(fallback, `Missing guide pattern for ${id}`);
  assert.deepEqual(fallback.grid, {
    width: donor.grid.width, height: donor.grid.height,
    slots: Array(donor.grid.slots.length).fill(0),
  });
  assert.equal(fallback.ingredients[0].count, donor.ingredients.length);
  assert.equal(fallback.ingredients[0].choices[0].id, "minecraft:acacia_planks");
  assert.equal(fallback.outputs[0].count, donor.outputs[0].count);
  assert.equal(fitsInventoryCrafting(fallback), suffix !== "trapdoor");
  assert.equal("source" in fallback, false, "Guide patterns must not pretend to have client provenance");
}

assert.equal(createMissingWoodBlockRecipe("minecraft:cherry_button", true, true), null);
assert.equal(createMissingWoodBlockRecipe("minecraft:acacia_button", false, false), null);
assert.equal(createMissingWoodBlockRecipe("minecraft:acacia_log", false, true), null);
assert.deepEqual(missingWoodBlockOutputs("minecraft:acacia_planks", crafted, () => true),
  missing.map(suffix => `minecraft:acacia_${suffix}`));
assert.deepEqual(missingWoodBlockOutputs("minecraft:acacia_planks", crafted,
  id => id.endsWith("_button")), ["minecraft:acacia_button"]);

const mechanics = JSON.parse(await readFile(new URL("../public/knowledge-data/bedrock/26.45/mechanics.json", import.meta.url)));
const names = JSON.parse(await readFile(new URL("../src/features/knowledge/guide-names.json", import.meta.url)));
const mechanicNames = new Map(mechanics.subjects.map(subject => [subject.id, subject.text?.en?.name]));
const available = new Set([...Object.keys(bedrock.index.produces), ...Object.keys(bedrock.index.usesItem),
  ...mechanics.subjects.filter(subject => subject.kind === "item" || subject.kind === "block")
    .map(subject => subject.id)]);
const oreEntries = Object.entries(GAME_GUIDE_ORE_BLOCKS).filter(([id]) => available.has(id));
assert(oreEntries.length >= 16, "Too few Bedrock ores have mining profiles");
for (const [id, ore] of oreEntries) assert(available.has(ore.resource), `Unlinked ore resource for ${id}`);
assert.equal(GAME_GUIDE_ORE_BLOCKS["minecraft:diamond_ore"].resource, "minecraft:diamond");
assert.equal(GAME_GUIDE_ORE_BLOCKS["minecraft:diamond_ore"].tool, "iron");
assert.equal(GAME_GUIDE_ORE_BLOCKS["minecraft:quartz_ore"].location, "nether");
assert.equal(GAME_GUIDE_ORE_BLOCKS["minecraft:nether_gold_ore"].resource, "minecraft:gold_nugget");
assert.deepEqual(GAME_GUIDE_ORE_BLOCKS["minecraft:ancient_debris"], {
  resource: "minecraft:netherite_scrap", tool: "diamond", location: "nether", deepslate: false, smelted: true,
});
const javaRecipes = JSON.parse(await readFile(new URL("../public/knowledge-data/java/26.3/recipes.json", import.meta.url)));
const debrisCooking = javaRecipes.recipes.filter(recipe => recipe.method === "cooking"
  && recipe.ingredients.some(ingredient => ingredient.choices.some(choice => choice.id === "minecraft:ancient_debris")));
assert.deepEqual(new Set(debrisCooking.flatMap(recipe => recipe.outputs.map(output => output.id))),
  new Set(["minecraft:netherite_scrap"]));
assert.equal(debrisCooking.length, 2, "Furnace and blast furnace share one result guide");

const name = id => {
  const [namespace, path] = id.split(":");
  const canonicalPath = gameKnowledgeCanonicalItemId(id).split(":")[1];
  return mechanicNames.get(id) ?? names[`item.${namespace}.${path}`] ?? names[`block.${namespace}.${path}`]
    ?? names[`item.${namespace}.${canonicalPath}`] ?? names[`block.${namespace}.${canonicalPath}`] ?? path;
};
const visibleBlocks = visibleBlockGuideIds(available, id => gameKnowledgeRecipeSubjectKind(id) === "block",
  gameKnowledgeCanonicalItemId, name, crafted);
assert.equal(gameKnowledgeCanonicalItemId("minecraft:quartz_ore"), "minecraft:nether_quartz_ore");
assert.equal(gameKnowledgeRecipeSubjectKind("minecraft:quartz_ore"), "block");
assert.equal(gameKnowledgeRecipeSubjectKind("minecraft:wooden_button"), "block");
assert.equal(gameKnowledgeRecipeSubjectKind("minecraft:netherstar"), "item");
for (const id of ["minecraft:quartz_ore", "minecraft:stonecutter_block", "minecraft:brick_block"])
  assert(visibleBlocks.has(id), `Legacy Bedrock block missing from guide: ${id}`);
assert(visibleBlocks.has("minecraft:stone_stairs"));
assert(visibleBlocks.has("minecraft:normal_stone_stairs"), "Distinct Bedrock block labels must stay separate");
assert(visibleBlocks.has("minecraft:sealantern"), "Keep the Sea Lantern ID with a source crafting recipe");
assert(!visibleBlocks.has("minecraft:sea_lantern"), "Duplicate Sea Lantern guide row");

console.log("Block guide family patterns, ore profiles and connected outputs passed.");
