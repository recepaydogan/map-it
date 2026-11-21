import type { CatalogRecipe } from "./recipe-types.ts";

/** Finds the fewest brewing operations from a source bottle using validated recipe edges. */
export const createBrewingPathResolver = (recipes: readonly CatalogRecipe[], rootId: string) => {
  const byInput = new Map<string, CatalogRecipe[]>();
  for (const recipe of recipes) {
    if (recipe.method !== "brewing") continue;
    const input = recipe.ingredients[0]?.choices[0];
    if (!input || input.kind !== "item") continue;
    const entries = byInput.get(input.id) ?? [];
    entries.push(recipe);
    byInput.set(input.id, entries);
  }
  for (const entries of byInput.values()) entries.sort((left, right) => left.id.localeCompare(right.id, "en"));
  const parent = new Map<string, { previous: string; recipe: CatalogRecipe }>();
  const visited = new Set([rootId]), queue = [rootId];
  for (let index = 0; index < queue.length; index++) {
    const inputId = queue[index];
    for (const recipe of byInput.get(inputId) ?? []) for (const output of recipe.outputs) {
      if (visited.has(output.id)) continue;
      visited.add(output.id);
      parent.set(output.id, { previous: inputId, recipe });
      queue.push(output.id);
    }
  }
  return (targetId: string): CatalogRecipe[] | null => {
    if (!visited.has(targetId)) return null;
    const path: CatalogRecipe[] = [];
    for (let id = targetId; id !== rootId;) {
      const step = parent.get(id);
      if (!step) throw new Error("Brewing path is missing a validated predecessor.");
      path.push(step.recipe);
      id = step.previous;
    }
    return path.reverse();
  };
};
