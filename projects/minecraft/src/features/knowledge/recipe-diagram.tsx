import BrewingRecipe from "./brewing-recipe";
import RecipeGrid from "./recipe-grid";
import type { RecipeSubjectDisplay } from "./recipe-subject-display";
import type { CatalogRecipe, IngredientChoice } from "./recipe-types";

/** Keeps workstation-specific placement visuals consistent everywhere recipes are shown. */
export default function RecipeDiagram({ recipe, display, compact = false, onSelect }: {
  recipe: CatalogRecipe; display: RecipeSubjectDisplay; compact?: boolean;
  onSelect?: (choice: IngredientChoice) => void;
}) {
  return recipe.method === "brewing"
    ? <BrewingRecipe recipe={recipe} display={display} compact={compact} />
    : <RecipeGrid recipe={recipe} display={display} compact={compact} onSelect={onSelect} />;
}
