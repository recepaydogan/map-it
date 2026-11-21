import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCraftingGuideIndex, fitsInventoryCrafting, matchesCraftingFilter } from
  "../src/features/knowledge/crafting-guide-data.ts";
import { normalizeRecipe } from "../src/features/knowledge/normalize-recipe.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";

const catalog = async (edition, version) => {
  const artifact = JSON.parse(await readFile(new URL(`../public/knowledge-data/${edition}/${version}/recipes.json`, import.meta.url)));
  return parseRecipeCatalogArtifact(artifact, artifact.source);
};

for (const [edition, version] of [["java", "26.3"], ["java", "1.19.4"], ["bedrock", "26.45"]]) {
  const recipes = (await catalog(edition, version)).recipes;
  const crafting = createCraftingGuideIndex(recipes);
  assert(crafting.size > 500, `Too few crafting outputs for ${edition} ${version}`);
  for (const variants of crafting.values()) {
    assert(variants.length > 0);
    assert(variants.every(recipe => recipe.method === "shaped" || recipe.method === "shapeless" || recipe.method === "cutting"));
    for (const recipe of variants) {
      assert(matchesCraftingFilter(recipe, "all"));
      assert.equal(matchesCraftingFilter(recipe, "inventory"), fitsInventoryCrafting(recipe));
      assert.equal(matchesCraftingFilter(recipe, "table"), recipe.method !== "cutting" && !fitsInventoryCrafting(recipe));
      assert.equal(matchesCraftingFilter(recipe, "shaped"), recipe.method === "shaped");
      assert.equal(matchesCraftingFilter(recipe, "shapeless"), recipe.method === "shapeless");
      assert.equal(matchesCraftingFilter(recipe, "cutting"), recipe.method === "cutting");
      if (recipe.method === "cutting") {
        assert(!matchesCraftingFilter(recipe, "inventory"));
        assert(!matchesCraftingFilter(recipe, "table"));
      }
    }
  }
}

const java = createCraftingGuideIndex((await catalog("java", "26.3")).recipes);
const fixture = { edition: "fixture", version: "1", repository: "fixture/data", revision: "a".repeat(40),
  recipePrefix: "recipes/", tagPrefix: null, defaultNamespace: "fixture", dialect: "wrapped",
  recipeTypes: { "fixture:shapeless": "shapeless" }, stations: { cutter: ["fixture:cutter"] },
  stationMethodOverrides: { cutter: "cutting" } };
const raw = { "fixture:shapeless": { description: { identifier: "fixture:cut" }, tags: ["cutter"],
  ingredients: ["fixture:piece"], result: "fixture:result" } };
const normalized = normalizeRecipe({ path: "recipes/cut.json", sha256: "b".repeat(64), data: raw }, fixture);
assert(!("code" in normalized), JSON.stringify(normalized));
assert.equal(normalized.method, "cutting");
assert.equal(normalized.sourceType, "fixture:shapeless");
raw["fixture:shapeless"].ingredients.push("fixture:piece");
assert.equal(normalizeRecipe({ path: "recipes/cut.json", sha256: "b".repeat(64), data: raw }, fixture).code, "invalid");
const bedrock = await catalog("bedrock", "26.45");
const cutting = bedrock.recipes.filter(recipe => recipe.method === "cutting");
assert.equal(cutting.length, 320);
assert(cutting.every(recipe => recipe.stationTags.includes("stonecutter") && recipe.ingredients.length === 1));
const bedrockCrafting = createCraftingGuideIndex(bedrock.recipes);
assert(cutting.every(recipe => bedrockCrafting.get(recipe.outputs[0].id)?.includes(recipe)));
const bed = java.get("minecraft:black_bed");
assert(bed?.some(recipe => recipe.method === "shaped" && !fitsInventoryCrafting(recipe)));
assert(bed?.some(recipe => recipe.method === "shapeless" && fitsInventoryCrafting(recipe)));

console.log("Crafting guide catalog and filter checks passed.");
