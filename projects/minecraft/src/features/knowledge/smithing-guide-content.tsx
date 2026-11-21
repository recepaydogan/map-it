import type { TFunction } from "i18next";
import { GAME_GUIDE_SMITHING, GAME_GUIDE_SMITHING_TRIM_FALLBACK } from "../../game-config.ts";
import type { InspectorContent, InspectorGuideSection, InspectorSection } from "../inspector/inspector-types.ts";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import type { CatalogRecipe } from "./recipe-types.ts";
import type { SmithingGuideIndex } from "./smithing-guide-data.ts";
import { smithingTemplateId } from "./smithing-guide-data.ts";
import { CopyRecipes, SmithingProcess } from "./smithing-guide-visuals.tsx";

const namespace = (id: string) => id.includes(":") ? id.slice(0, id.indexOf(":") + 1) : "";
const availableChoices = (ids: readonly string[], available: ReadonlySet<string>) => ids.filter(id => !available.size || available.has(id));

const templateSources = (content: InspectorContent | null): InspectorSection[] => (content?.sections ?? [])
  .filter(section => section.key === "structure:loot-sources" || section.key.includes("obtainedFrom:drop")
    || section.key.includes("obtainedFrom:loot"));

const ingredientItem = (recipe: CatalogRecipe, index: number, catalog: ValidatedRecipeCatalog) => {
  const choices = recipe.ingredients[index]?.choices ?? [];
  const item = choices.find(choice => choice.kind === "item");
  if (item) return item.id;
  const tag = choices.find(choice => choice.kind === "tag");
  return tag ? catalog.index.tagMembers[tag.id]?.[0] : undefined;
};

export const createSmithingGuideContent = (id: string, baseContent: InspectorContent | null, templateContent: InspectorContent | null,
  catalog: ValidatedRecipeCatalog, guide: SmithingGuideIndex, display: RecipeSubjectDisplay, available: ReadonlySet<string>,
  t: TFunction): InspectorContent | null => {
  const upgrade = guide.upgrades.get(id), isTemplate = guide.trims.has(id) || guide.copies.has(id);
  if (!upgrade && !isTemplate) return null;
  const template = upgrade ? smithingTemplateId(upgrade) : id;
  if (!template && !upgrade?.legacySmithing) return null;
  const trim = guide.trims.get(id), isTrim = Boolean(trim) || id.endsWith(GAME_GUIDE_SMITHING.trimTemplateSuffix);
  const processRecipe = upgrade ?? (!isTrim ? [...guide.upgrades.values()]
    .find(recipe => smithingTemplateId(recipe) === template
      && recipe.outputs[0]?.id.endsWith(GAME_GUIDE_SMITHING.preferredUpgradeOutputSuffix))
    ?? [...guide.upgrades.values()].find(recipe => smithingTemplateId(recipe) === template) : undefined);
  const trimBaseChoice = trim?.ingredients[1]?.choices[0], trimMaterialChoice = trim?.ingredients[2]?.choices[0];
  const fallback = GAME_GUIDE_SMITHING_TRIM_FALLBACK;
  const prefixed = (values: readonly string[]) => values.map(value => `${namespace(id)}${value}`);
  const bases = isTrim ? availableChoices(trimBaseChoice?.kind === "tag"
    ? catalog.index.tagMembers[trimBaseChoice.id] ?? [] : prefixed(fallback.armor), available) : [];
  const materials = isTrim ? availableChoices(trimMaterialChoice?.kind === "tag"
    ? catalog.index.tagMembers[trimMaterialChoice.id] ?? [] : prefixed(fallback.materials), available) : [];
  const chosenBase = bases.includes(GAME_GUIDE_SMITHING.exampleArmor) ? GAME_GUIDE_SMITHING.exampleArmor : bases[0];
  const chosenMaterial = materials.includes(GAME_GUIDE_SMITHING.exampleMaterial) ? GAME_GUIDE_SMITHING.exampleMaterial : materials[0];
  const processBase = processRecipe ? ingredientItem(processRecipe, processRecipe.legacySmithing ? 0 : 1, catalog) : chosenBase;
  const processMaterial = processRecipe ? ingredientItem(processRecipe, processRecipe.legacySmithing ? 1 : 2, catalog) : chosenMaterial;
  const copyRecipes = template ? guide.copies.get(template) ?? [] : [];
  const sources = template ? templateSources(templateContent) : [];
  const sections: InspectorGuideSection[] = [];
  if (processBase && processMaterial) sections.push({ key: "smithing:process", title: t("inspector.smithingGuide.process"),
    body: <SmithingProcess key={id} template={template ?? undefined} base={processBase} addition={processMaterial}
      result={processRecipe?.outputs[0]?.id} baseOptions={bases} additionOptions={materials}
      display={display} t={t} /> });
  if (sources.length) sections.push({ key: "smithing:source", title: t("inspector.smithingGuide.findTemplate"),
    sections: sources.map(section => ({ ...section, title: t("inspector.smithingGuide.findTemplate") })) });
  if (copyRecipes.length) sections.push({ key: "smithing:copy", title: t("inspector.smithingGuide.copyTemplate"),
    description: t("inspector.smithingGuide.copyNote"),
    body: <CopyRecipes recipes={copyRecipes} catalog={catalog} display={display} /> });
  const appearance = display("item", id);
  return { ...baseContent, ...appearance, category: t("inspector.subjectKinds.smithing"),
    description: t(isTrim ? "inspector.smithingGuide.trimDescription" : upgrade?.legacySmithing
      ? "inspector.smithingGuide.legacyUpgradeDescription" : upgrade
        ? "inspector.smithingGuide.upgradeDescription" : "inspector.smithingGuide.upgradeTemplateDescription"),
    guideSections: sections, sectionLinksInteractive: true };
};
