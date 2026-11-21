import type { IngredientChoice, RecipeVisual } from "./recipe-types.ts";

/** Preserve source positions, including empty cells, in the workstation's visible grid. */
export const recipeSlotLayout = (recipe: RecipeVisual): (IngredientChoice | undefined)[] => {
  const crafting = recipe.method === "shaped" || recipe.method === "shapeless";
  const slotCount = crafting ? 9 : recipe.method === "smithing" ? recipe.legacySmithing ? 2 : 3 : recipe.method === "brewing" ? 2 : 1;
  const slots: (IngredientChoice | undefined)[] = Array.from({ length: slotCount });
  const grid = recipe.grid;
  if (grid) grid.slots.forEach((slot, index) => {
    const target = Math.floor(index / grid.width) * 3 + index % grid.width;
    if (target < slots.length && slot !== null) slots[target] = recipe.ingredients[slot]?.choices[0];
  });
  else recipe.ingredients.flatMap(input => Array.from({ length: input.count }, () => input.choices[0]))
    .slice(0, slots.length).forEach((choice, index) => { slots[index] = choice; });
  return slots;
};
