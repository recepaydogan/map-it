import type { TFunction } from "i18next";
import type { InspectorContent, InspectorGuideSection } from "../inspector/inspector-types.ts";
import { matchesSmeltingStation } from "./smelting-guide-data.ts";
import SmeltingGuideVisuals from "./smelting-guide-visuals.tsx";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import type { CatalogRecipe } from "./recipe-types.ts";

export const createSmeltingGuideContent = (id: string, baseContent: InspectorContent | null,
  catalog: ValidatedRecipeCatalog, byOutput: ReadonlyMap<string, readonly CatalogRecipe[]>, display: RecipeSubjectDisplay,
  t: TFunction, stationIds: readonly string[] | null): InspectorContent | null => {
  const recipes = byOutput.get(id)?.filter(recipe => !stationIds || matchesSmeltingStation(recipe, stationIds));
  if (!recipes?.length) return null;
  const uses = baseContent?.sections?.find(section => section.key === "uses");
  const sections: InspectorGuideSection[] = [{ key: "smelting:process", title: t("inspector.smeltingGuide.process"),
    body: <SmeltingGuideVisuals key={id} recipes={recipes} catalog={catalog} display={display} stationIds={stationIds} /> }];
  if (uses?.links.length) sections.push({ key: "smelting:uses", title: t("inspector.usedIn"), sections: [uses] });
  return { ...baseContent, ...display("item", id), category: t("inspector.subjectKinds.smelting"),
    description: t("inspector.smeltingGuide.description"), guideSections: sections, sectionLinksInteractive: true };
};
