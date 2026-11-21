import type { TFunction } from "i18next";
import type { InspectorContent, InspectorGuideSection } from "../inspector/inspector-types.ts";
import CraftingGuideVisuals from "./crafting-guide-visuals.tsx";
import { matchesCraftingFilter, type CraftingGuideFilter } from "./crafting-guide-data.ts";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import type { CatalogRecipe } from "./recipe-types.ts";

export const createCraftingGuideContent = (id: string, baseContent: InspectorContent | null,
  catalog: ValidatedRecipeCatalog, byOutput: ReadonlyMap<string, readonly CatalogRecipe[]>,
  display: RecipeSubjectDisplay, t: TFunction, filter: CraftingGuideFilter): InspectorContent | null => {
  const recipes = byOutput.get(id)?.filter(recipe => matchesCraftingFilter(recipe, filter));
  if (!recipes?.length) return null;
  const cuttingOnly = recipes.every(recipe => recipe.method === "cutting");
  const uses = baseContent?.sections?.find(section => section.key === "uses");
  const sections: InspectorGuideSection[] = [{ key: "crafting:recipe", title: t(cuttingOnly
    ? "crafting.methods.cutting" : "inspector.craftingGuide.process"),
    body: <CraftingGuideVisuals key={id} recipes={recipes} catalog={catalog} display={display} /> }];
  if (uses?.links.length) sections.push({ key: "crafting:uses", title: t("inspector.usedIn"), sections: [uses] });
  return { ...baseContent, ...display("item", id), category: t("inspector.subjectKinds.crafting"),
    description: cuttingOnly ? undefined : t("inspector.craftingGuide.description", { count: recipes.length }),
    guideSections: sections, sectionLinksInteractive: true };
};
