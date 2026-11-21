import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_GUIDE_COOKING_STATIONS, GAME_GUIDE_COOKING_TIME_RULES } from "../src/game-config.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";
import { cookingTimeSeconds, createSmeltingGuideIndex, matchesSmeltingStation } from "../src/features/knowledge/smelting-guide-data.ts";

const catalog = async (edition, version) => {
  const artifact = JSON.parse(await readFile(new URL(`../public/knowledge-data/${edition}/${version}/recipes.json`, import.meta.url)));
  return parseRecipeCatalogArtifact(artifact, artifact.source);
};

for (const [edition, version] of [["java", "26.3"], ["java", "1.19.4"], ["bedrock", "26.45"]]) {
  const recipes = (await catalog(edition, version)).recipes;
  const guide = createSmeltingGuideIndex(recipes);
  assert(guide.size > 30, `Too few smelting outputs for ${edition} ${version}`);
  for (const variants of guide.values()) {
    assert(variants.length > 0);
    assert(variants.every(recipe => recipe.method === "cooking"));
    for (const recipe of variants) {
      assert(recipe.stations.length > 0);
      assert(GAME_GUIDE_COOKING_STATIONS.some(station => matchesSmeltingStation(recipe, station.stationIds)));
    }
  }
}

const java = createSmeltingGuideIndex((await catalog("java", "26.3")).recipes);
const oldJava = createSmeltingGuideIndex((await catalog("java", "1.21.11")).recipes);
const interimJava = createSmeltingGuideIndex((await catalog("java", "26.2")).recipes);
const bedrock = createSmeltingGuideIndex((await catalog("bedrock", "26.45")).recipes);
const bakedPotato = java.get("minecraft:baked_potato");
assert(bakedPotato?.some(recipe => recipe.stations.includes("minecraft:campfire") && recipe.cooking?.ticks === 600));
assert(bakedPotato?.some(recipe => recipe.stations.includes("minecraft:smoker") && recipe.cooking?.experience === 0.35));
assert(bedrock.get("minecraft:baked_potato")?.some(recipe => recipe.stations.includes("minecraft:soul_campfire")
  && recipe.cooking?.ticks === null && recipe.cooking?.experience === null));

const timeFor = (guide, id, station) => {
  const recipe = guide.get(id)?.find(value => value.stations.includes(station));
  assert(recipe, `Missing ${id} recipe at ${station}`);
  return cookingTimeSeconds(recipe, GAME_GUIDE_COOKING_TIME_RULES);
};
assert.deepEqual(timeFor(java, "minecraft:iron_ingot", "minecraft:blast_furnace"),
  { seconds: 5, defaultFuelSpeed: true });
assert.deepEqual(timeFor(java, "minecraft:iron_ingot", "minecraft:furnace"),
  { seconds: 10, defaultFuelSpeed: false });
assert.deepEqual(timeFor(java, "minecraft:baked_potato", "minecraft:smoker"),
  { seconds: 5, defaultFuelSpeed: true });
assert.deepEqual(timeFor(java, "minecraft:baked_potato", "minecraft:campfire"),
  { seconds: 30, defaultFuelSpeed: false });
assert.deepEqual(timeFor(oldJava, "minecraft:iron_ingot", "minecraft:blast_furnace"),
  { seconds: 5, defaultFuelSpeed: false });
assert.deepEqual(timeFor(interimJava, "minecraft:iron_ingot", "minecraft:blast_furnace"),
  { seconds: null, defaultFuelSpeed: false });

console.log("Smelting guide catalog and station checks passed.");
