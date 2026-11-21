import type { CatalogRecipe } from "./recipe-types.ts";
import { GAME_GUIDE_SMITHING } from "../../game-config.ts";

const TRIM_TEMPLATE_SUFFIX = GAME_GUIDE_SMITHING.trimTemplateSuffix;
const UPGRADE_TEMPLATE_SUFFIX = GAME_GUIDE_SMITHING.upgradeTemplateSuffix;

export interface SmithingGuideIndex {
  readonly upgrades: ReadonlyMap<string, CatalogRecipe>;
  readonly trims: ReadonlyMap<string, CatalogRecipe | null>;
  readonly copies: ReadonlyMap<string, readonly CatalogRecipe[]>;
  readonly subjects: ReadonlySet<string>;
}

/** Modern smithing recipes identify their template in the first slot. */
export const smithingTemplateId = (recipe: CatalogRecipe): string | null => {
  if (recipe.legacySmithing) return null;
  const choice = recipe.ingredients[0]?.choices[0];
  return choice?.kind === "item" ? choice.id : null;
};

export const createSmithingGuideIndex = (recipes: readonly CatalogRecipe[]): SmithingGuideIndex => {
  const upgrades = new Map<string, CatalogRecipe>();
  const trims = new Map<string, CatalogRecipe | null>();
  const copies = new Map<string, CatalogRecipe[]>();
  for (const recipe of recipes) {
    if (recipe.method === "smithing") {
      const template = smithingTemplateId(recipe);
      if (recipe.smithingTrim) {
        if (template?.endsWith(TRIM_TEMPLATE_SUFFIX)) trims.set(template, recipe);
      } else if (recipe.legacySmithing || template?.endsWith(UPGRADE_TEMPLATE_SUFFIX)) {
        for (const output of recipe.outputs) upgrades.set(output.id, recipe);
      }
    }
    for (const output of recipe.outputs) {
      if (!output.id.endsWith(TRIM_TEMPLATE_SUFFIX) && !output.id.endsWith(UPGRADE_TEMPLATE_SUFFIX)) continue;
      const recipesForTemplate = copies.get(output.id) ?? [];
      recipesForTemplate.push(recipe);
      copies.set(output.id, recipesForTemplate);
      if (output.id.endsWith(TRIM_TEMPLATE_SUFFIX) && !trims.has(output.id)) trims.set(output.id, null);
    }
  }
  return { upgrades, trims, copies, subjects: new Set([...upgrades.keys(), ...trims.keys(), ...copies.keys()]) };
};
