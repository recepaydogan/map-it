import { recipeId, recipeRecord } from "./recipe-values.ts";
import type { CatalogRecipe } from "./recipe-types.ts";

export interface RecipeTagDefinition { id: string; values: unknown[]; path: string }
export interface ResolvedRecipeTag { items: string[]; missing: string[]; cycles: string[]; complete: boolean }

export const createRecipeTagResolver = (definitions: readonly RecipeTagDefinition[], namespace: string) => {
  const tags = new Map<string, RecipeTagDefinition>(), cache = new Map<string, ResolvedRecipeTag>();
  for (const definition of definitions) {
    if (tags.has(definition.id)) throw new Error("Duplicate item tag definition");
    if (!Array.isArray(definition.values) || definition.values.length > 65536) throw new Error("Invalid item tag values");
    tags.set(definition.id, definition);
  }
  const resolve = (id: string, ancestors: Set<string>, budget: { visits: number }): ResolvedRecipeTag => {
    if (++budget.visits > 100000) throw new Error("Item tag graph exceeds traversal budget");
    if (ancestors.has(id)) return { items: [], missing: [], cycles: [id], complete: false };
    if (!tags.has(id)) return { items: [], missing: [id], cycles: [], complete: false };
    const items = new Set<string>(), missing = new Set<string>(), cycles = new Set<string>();
    if (ancestors.size > 64) throw new Error("Item tag graph exceeds depth budget");
    const path = new Set(ancestors); path.add(id);
    for (const raw of tags.get(id)!.values) {
      const entry = typeof raw === "string" ? { id: raw, required: true } : recipeRecord(raw);
      if (typeof entry.id !== "string" || entry.required !== undefined && typeof entry.required !== "boolean") throw new Error("Invalid item tag member");
      const nested = entry.id.startsWith("#"), reference = recipeId(nested ? entry.id.slice(1) : entry.id, namespace);
      if (!nested) items.add(reference);
      else if (entry.required !== false || tags.has(reference)) {
        const child = resolve(reference, path, budget);
        child.items.forEach(item => items.add(item)); child.missing.forEach(item => missing.add(item)); child.cycles.forEach(item => cycles.add(item));
      }
      if (items.size > 65536) throw new Error("Resolved item tag exceeds member budget");
    }
    return { items: [...items].sort(), missing: [...missing].sort(), cycles: [...cycles].sort(), complete: !missing.size && !cycles.size };
  };
  return (id: string): ResolvedRecipeTag => {
    if (!cache.has(id)) cache.set(id, resolve(id, new Set(), { visits: 0 }));
    return structuredClone(cache.get(id)!);
  };
};

export interface RecipeIndex {
  produces: Record<string, string[]>; usesItem: Record<string, string[]>; usesTag: Record<string, string[]>;
  unresolvedTags: Record<string, ResolvedRecipeTag>;
  /** Verified members only; consult unresolvedTags before describing a group as complete. */
  tagMembers: Record<string, string[]>;
}

/** Candidate recipe links retain their conditions in the recipe; they are not an inventory matcher. */
export const buildRecipeIndex = (recipes: readonly CatalogRecipe[], resolveTag: ReturnType<typeof createRecipeTagResolver>): RecipeIndex => {
  const produces = new Map<string, Set<string>>(), usesItem = new Map<string, Set<string>>(), usesTag = new Map<string, Set<string>>();
  const unresolvedTags: Record<string, ResolvedRecipeTag> = Object.create(null), identities = new Set<string>();
  const tagMembers: Record<string, string[]> = Object.create(null);
  const context = recipes[0]?.source;
  const add = (index: Map<string, Set<string>>, subject: string, recipe: string) => {
    if (!index.has(subject)) index.set(subject, new Set()); index.get(subject)!.add(recipe);
  };
  for (const recipe of recipes) {
    if (identities.has(recipe.id)) throw new Error("Duplicate recipe identity"); identities.add(recipe.id);
    if (recipe.source.edition !== context?.edition || recipe.source.version !== context?.version || recipe.source.revision !== context?.revision)
      throw new Error("Recipe index cannot mix edition/version/source contexts");
    for (const output of recipe.outputs) add(produces, output.id, recipe.id);
    for (const ingredient of recipe.ingredients) for (const choice of ingredient.choices) {
      if (choice.kind === "item") add(usesItem, choice.id, recipe.id);
      else {
        add(usesTag, choice.id, recipe.id);
        const tag = resolveTag(choice.id);
        tagMembers[choice.id] = [...tag.items];
        for (const item of tag.items) add(usesItem, item, recipe.id);
        if (!tag.complete) unresolvedTags[choice.id] = tag;
      }
    }
  }
  const record = (map: Map<string, Set<string>>) => Object.fromEntries([...map].sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, values]) => [key, [...values].sort()]));
  return { produces: record(produces), usesItem: record(usesItem), usesTag: record(usesTag), unresolvedTags, tagMembers };
};
