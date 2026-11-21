import type { InspectorSubject } from "../inspector/inspector-controller";
import type { MapPointImageSource } from "../map/map-point-icon";
import type { RecipeIndex } from "./recipe-index";
import type { CatalogRecipe } from "./recipe-types";

export type RecipeSubjectDisplay = (kind: InspectorSubject["kind"], id: string) => {
  name: string;
  image?: MapPointImageSource;
};

interface RecipeDisplayCatalog {
  recipes: readonly CatalogRecipe[];
  index: RecipeIndex;
}

/** Uses a concrete member's artwork when a recipe ingredient is represented by an item tag. */
export const createRecipeSubjectDisplay = (catalog: RecipeDisplayCatalog, fallback: RecipeSubjectDisplay): RecipeSubjectDisplay => {
  const recipes = new Map(catalog.recipes.map(recipe => [recipe.id, recipe]));
  return (kind, id) => {
    const original = fallback(kind, id);
    if (kind === "recipe") {
      const recipe = recipes.get(id);
      const output = recipe?.outputs[0];
      if (output) return fallback("item", output.id);
      if (recipe?.smithingTrim) {
        const template = recipe.ingredients[0]?.choices[0];
        if (template?.kind === "item") return fallback("item", template.id);
      }
    }
    if (kind === "tag") {
      const member = catalog.index.tagMembers[id]?.[0];
      const memberImage = member ? fallback("item", member).image : undefined;
      if (memberImage) return { ...original, image: memberImage };
    }
    return original;
  };
};
