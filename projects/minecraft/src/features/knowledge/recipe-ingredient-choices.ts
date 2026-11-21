import type { IngredientChoice, RecipeIngredient } from "./recipe-types";

/** Expands item tags into their verified concrete members without duplicating overlapping choices. */
export const resolveRecipeIngredientChoices = (ingredient: RecipeIngredient,
  tagMembers: Readonly<Record<string, readonly string[]>>): IngredientChoice[] => {
  const choices = ingredient.choices.flatMap(choice => choice.kind === "item"
    ? [choice]
    : (tagMembers[choice.id] ?? []).map(id => ({ kind: "item" as const, id })));
  const fallback = choices.length ? choices : ingredient.choices;
  return [...new Map(fallback.map(choice => [`${choice.kind}\u0000${choice.id}\u0000${choice.data ?? ""}`, choice])).values()];
};
