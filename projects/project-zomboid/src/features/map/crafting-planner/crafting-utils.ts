import type {
  MapCraftIngredient,
  MapCraftRecipe,
  MapItemCatalogEntry,
  MapLootIndexEntry,
} from "../types";

const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");

export const createCraftingLookups = (
  items: MapItemCatalogEntry[] | undefined,
  lootIndex: MapLootIndexEntry[] | undefined,
  recipes: MapCraftRecipe[],
) => {
  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  const lootByItemId = new Map((lootIndex ?? []).map((item) => [item.id, item]));
  const recipesByOutput = new Map<string, MapCraftRecipe[]>();
  const itemsByTag = new Map<string, MapItemCatalogEntry[]>();
  for (const item of items ?? []) {
    for (const tag of item.tags ?? []) {
      const taggedItems = itemsByTag.get(tag) ?? [];
      taggedItems.push(item);
      itemsByTag.set(tag, taggedItems);
    }
  }
  for (const recipe of recipes) {
    for (const { itemId } of recipe.outputs) {
      const outputRecipes = recipesByOutput.get(itemId) ?? [];
      outputRecipes.push(recipe);
      recipesByOutput.set(itemId, outputRecipes);
    }
  }
  return { itemById, itemsByTag, lootByItemId, recipesByOutput };
};

export type CraftingLookups = ReturnType<typeof createCraftingLookups>;

export const resolveCraftIngredientItems = (
  ingredient: MapCraftIngredient,
  lookups: CraftingLookups,
) => {
  const itemIds = ingredient.kind === "item"
    ? ingredient.options
    : ingredient.kind === "tag"
      ? ingredient.options.flatMap((tag) => lookups.itemsByTag.get(tag) ?? []).map(({ id }) => id)
      : [];
  return [...new Set(itemIds)]
    .map((itemId) => ({
      item: lookups.itemById.get(itemId) ?? { id: itemId, name: itemId.replace(/^.*[.]/, ""), lootable: false },
      loot: lookups.lootByItemId.get(itemId),
      recipes: lookups.recipesByOutput.get(itemId) ?? [],
    }))
    .sort((left, right) => (
      (right.loot?.locationCount ?? 0) - (left.loot?.locationCount ?? 0)
      || left.item.name.localeCompare(right.item.name)
    ));
};

export const searchCraftRecipes = (
  recipes: MapCraftRecipe[],
  query: string,
  lookups: CraftingLookups,
  limit = 30,
) => {
  const normalizedQuery = normalize(query);
  return recipes
    .flatMap((recipe) => {
      const outputNames = recipe.outputs
        .map(({ itemId }) => lookups.itemById.get(itemId)?.name ?? itemId)
        .join(" ");
      const searchText = normalize(`${recipe.name} ${recipe.category} ${outputNames}`);
      if (normalizedQuery && !searchText.includes(normalizedQuery)) return [];
      const rank = !normalizedQuery
        ? 0
        : normalize(recipe.name) === normalizedQuery
          ? 0
          : normalize(recipe.name).startsWith(normalizedQuery)
            ? 1
            : 2;
      return [{ recipe, rank }];
    })
    .sort((left, right) => (
      left.rank - right.rank
      || Number(right.recipe.outputs.length > 0) - Number(left.recipe.outputs.length > 0)
      || left.recipe.name.localeCompare(right.recipe.name)
    ))
    .slice(0, limit)
    .map(({ recipe }) => recipe);
};
