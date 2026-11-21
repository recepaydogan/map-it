import path from "node:path";

// Extend reviewed scene data without copying older rules and profiles into
// each subsequent review. The caller's reader records every source hash.
export const readStorySceneRecipe = (filename, readText, projectRoot, ancestors = new Set()) => {
  const absolute = path.resolve(projectRoot, filename);
  if (ancestors.has(absolute)) throw new Error(`Cyclic scene recipe: ${absolute}`);
  const recipe = JSON.parse(readText(absolute));
  if (!recipe.extends) return recipe;
  const base = readStorySceneRecipe(recipe.extends, readText, projectRoot, new Set([...ancestors, absolute]));
  if (recipe.excludedActorNamePattern && recipe.excludedActorNamePattern !== base.excludedActorNamePattern) {
    throw new Error(`Scene extension changes the actor exclusion policy: ${absolute}`);
  }
  return { ...base, ...recipe, ...Object.fromEntries(["reviews", "scenes", "directScenes", "roleContracts", "profiles"]
    .map((key) => [key, [...(base[key] ?? []), ...(recipe[key] ?? [])]])) };
};
