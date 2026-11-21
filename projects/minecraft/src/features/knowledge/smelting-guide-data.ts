import type { CatalogRecipe } from "./recipe-types.ts";

export const createSmeltingGuideIndex = (recipes: readonly CatalogRecipe[]) => {
  const byOutput = new Map<string, CatalogRecipe[]>();
  for (const recipe of recipes) {
    if (recipe.method !== "cooking") continue;
    for (const output of recipe.outputs) {
      const variants = byOutput.get(output.id) ?? [];
      variants.push(recipe);
      byOutput.set(output.id, variants);
    }
  }
  return byOutput;
};

export const matchesSmeltingStation = (recipe: CatalogRecipe, stationIds: readonly string[]) =>
  recipe.method === "cooking" && recipe.stations.some(station => stationIds.includes(station));

interface CookingTimeRule {
  edition: string;
  version: string;
  sourceTypes: readonly string[];
  speedMultiplier: number;
}

export const cookingTimeSeconds = (recipe: CatalogRecipe, rules: readonly CookingTimeRule[]) => {
  const ticks = recipe.cooking?.ticks;
  if (ticks === null || ticks === undefined) return { seconds: null, defaultFuelSpeed: false };
  const rule = rules.find(candidate => candidate.edition === recipe.source.edition
    && candidate.version === recipe.source.version && candidate.sourceTypes.includes(recipe.sourceType));
  return { seconds: ticks / (20 * (rule?.speedMultiplier ?? 1)), defaultFuelSpeed: Boolean(rule) };
};
