import rawCatalog from "../../../public/data/enshrouded/crafting-catalog.json";
import type { CraftingCatalog, CraftingItem, CraftingRecipe } from "./enshrouded-crafting-types";

export const CRAFTING_CATALOG = rawCatalog as CraftingCatalog;
export const craftingKey = (name: string) => name.trim().replace(/_/g, " ").toLocaleLowerCase("en");

const items = new Map(CRAFTING_CATALOG.items.map((item) => [craftingKey(item.name), item]));
const canonicalKey = (name: string) => {
  const normalized = craftingKey(name);
  return normalized.endsWith(" bar") && items.has(`${normalized}s`) ? `${normalized}s` : normalized;
};
const recipes = new Map<string, CraftingRecipe[]>();
for (const recipe of CRAFTING_CATALOG.recipes) {
  const key = canonicalKey(recipe.output.name);
  recipes.set(key, [...(recipes.get(key) ?? []), recipe]);
}
for (const variants of recipes.values()) {
  variants.sort((left, right) => Number(right.id.startsWith("cargo:")) - Number(left.id.startsWith("cargo:"))
    || (right.sourceRevision ?? 0) - (left.sourceRevision ?? 0));
}

export const findCraftingItem = (name: string): CraftingItem | undefined => items.get(canonicalKey(name));
export const recipesFor = (name: string): CraftingRecipe[] => recipes.get(canonicalKey(name)) ?? [];
export const craftedAt = (name: string): CraftingRecipe[] => CRAFTING_CATALOG.recipes.filter((recipe) =>
  recipe.stations.some((station) => craftingKey(station) === craftingKey(name)));
export const usedInCrafting = (name: string): CraftingRecipe[] => CRAFTING_CATALOG.recipes.filter((recipe) =>
  recipe.ingredients.some((part) => canonicalKey(part.name) === canonicalKey(name)));
