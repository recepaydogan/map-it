import type { CatalogRecipe, RecipeIngredient } from "../knowledge/recipe-types";
import { resolveRecipeIngredientChoices } from "../knowledge/recipe-ingredient-choices.ts";
import type { CraftingMaterialLine, CraftingStockSnapshot } from "./crafting-types";

const totalStock = (stock: CraftingStockSnapshot | null, id: string) => stock
  ? (stock.player[id] ?? 0) + (stock.enderChest[id] ?? 0) + (stock.containers[id] ?? 0) : 0;

const choiceIds = (ingredient: RecipeIngredient, tags: Readonly<Record<string, readonly string[]>>) =>
  [...new Set(resolveRecipeIngredientChoices(ingredient, tags).filter(choice => choice.kind === "item").map(choice => choice.id))];

export const calculateCraftingMaterials = (recipe: CatalogRecipe | null, quantity: number,
  stock: CraftingStockSnapshot | null, tags: Readonly<Record<string, readonly string[]>>): CraftingMaterialLine[] => {
  if (!recipe) return [];
  const output = recipe.outputs[0]?.count ?? 1;
  const batches = Math.ceil(Math.max(1, quantity) / output);
  const grouped = new Map<string, { id: string; required: number; alternatives: string[] }>();
  recipe.ingredients.forEach((ingredient, index) => {
    const alternatives = choiceIds(ingredient, tags);
    const id = alternatives[0] ?? ingredient.choices[0]?.id ?? `ingredient:${index}`;
    const key = JSON.stringify(alternatives.length ? alternatives : [id]);
    const current = grouped.get(key);
    if (current) current.required += ingredient.count * batches;
    else grouped.set(key, { id, required: ingredient.count * batches, alternatives });
  });
  return [...grouped.values()].map(({ id, required, alternatives }) => {
    const owned = alternatives.reduce((sum, candidate) => sum + totalStock(stock, candidate), 0);
    return { id, required, owned, missing: Math.max(0, required - owned), alternatives };
  });
};
