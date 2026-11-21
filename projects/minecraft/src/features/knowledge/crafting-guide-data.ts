import type { CatalogRecipe, RecipeVisual } from "./recipe-types.ts";

export type CraftingGuideFilter = "all" | "inventory" | "table" | "shaped" | "shapeless" | "cutting";

export const isCraftingRecipe = (recipe: CatalogRecipe) => recipe.method === "shaped" || recipe.method === "shapeless"
  || recipe.method === "cutting";

/** A recipe fits the player's grid only when every required slot fits in 2×2. */
export const fitsInventoryCrafting = (recipe: RecipeVisual): boolean => {
  if (recipe.method === "shaped") return Boolean(recipe.grid && recipe.grid.width <= 2 && recipe.grid.height <= 2);
  if (recipe.method === "shapeless") return recipe.ingredients.reduce((total, ingredient) => total + ingredient.count, 0) <= 4;
  return false;
};

export const matchesCraftingFilter = (recipe: CatalogRecipe, filter: CraftingGuideFilter) => {
  if (!isCraftingRecipe(recipe)) return false;
  switch (filter) {
    case "all": return true;
    case "inventory": return fitsInventoryCrafting(recipe);
    case "table": return recipe.method !== "cutting" && !fitsInventoryCrafting(recipe);
    case "shaped": return recipe.method === "shaped";
    case "shapeless": return recipe.method === "shapeless";
    case "cutting": return recipe.method === "cutting";
  }
};

export const createCraftingGuideIndex = (recipes: readonly CatalogRecipe[]) => {
  const byOutput = new Map<string, CatalogRecipe[]>();
  for (const recipe of recipes) {
    if (!isCraftingRecipe(recipe)) continue;
    for (const output of recipe.outputs) {
      const variants = byOutput.get(output.id) ?? [];
      variants.push(recipe);
      byOutput.set(output.id, variants);
    }
  }
  return byOutput;
};
