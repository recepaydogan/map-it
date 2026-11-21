import type { TFunction } from "i18next";
import { GAME_GUIDE_REDSTONE_COMPONENTS, GAME_GUIDE_REDSTONE_SIGNAL_LINE } from "../../game-config.ts";
import type { InspectorContent, InspectorGuideSection } from "../inspector/inspector-types.ts";
import CraftingGuideVisuals from "./crafting-guide-visuals.tsx";
import { redstoneGuideItemId, type RedstoneGuideComponent } from "./redstone-guide-data.ts";
import { RedstoneComponentUse, RedstoneRelatedParts, RedstoneSignalDemo } from "./redstone-guide-visuals.tsx";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import type { CatalogRecipe } from "./recipe-types.ts";

const componentsByKey = new Map(GAME_GUIDE_REDSTONE_COMPONENTS.map(component => [component.key, component]));

export const createRedstoneGuideContent = (id: string, component: RedstoneGuideComponent,
  base: InspectorContent | null, catalog: ValidatedRecipeCatalog | null,
  crafting: ReadonlyMap<string, readonly CatalogRecipe[]>, availableItems: ReadonlySet<string>,
  edition: string, display: RecipeSubjectDisplay, t: TFunction): InspectorContent => {
  const related = component.related.map(key => {
    const target = componentsByKey.get(key);
    if (!target) throw new Error(`Unknown redstone guide component: ${key}`);
    return redstoneGuideItemId(target, edition);
  }).filter(targetId => availableItems.has(targetId));
  const recipes = crafting.get(id) ?? [];
  const sources = (base?.sections ?? []).map(section => ({ ...section,
    links: section.links.filter(link => link.subject.id !== id) }))
    .filter(section => section.key.includes("obtainedFrom") && section.links.length);
  const circuitId = (key: RedstoneGuideComponent["key"]) => {
    const part = componentsByKey.get(key);
    if (!part) throw new Error(`Unknown redstone circuit component: ${key}`);
    return redstoneGuideItemId(part, edition);
  };
  const circuitIds = {
    source: circuitId(GAME_GUIDE_REDSTONE_SIGNAL_LINE.source),
    wire: circuitId(GAME_GUIDE_REDSTONE_SIGNAL_LINE.wire),
    repeater: circuitId(GAME_GUIDE_REDSTONE_SIGNAL_LINE.repeater),
    output: circuitId(GAME_GUIDE_REDSTONE_SIGNAL_LINE.output),
  };
  const showSignalLine = component.key === "redstone" && Object.values(circuitIds)
    .every(circuitPartId => availableItems.has(circuitPartId));
  const sections: InspectorGuideSection[] = showSignalLine ? [] : [{ key: "redstone:use",
    title: t("inspector.redstoneGuide.inCircuit"),
    body: <RedstoneComponentUse group={component.group}
      example={t(`inspector.redstoneGuide.parts.${component.key}.example`)} t={t} /> }];
  if (showSignalLine) sections.push({ key: "redstone:range",
    title: t("inspector.redstoneGuide.range"),
    body: <RedstoneSignalDemo ids={circuitIds} display={display} t={t} /> });
  if (sources.length) sections.push({ key: "redstone:obtain", title: t("inspector.redstoneGuide.obtain"),
    sections: sources });
  if (component.key === "sculk_sensor" && !sources.length) sections.push({ key: "redstone:obtain",
    title: t("inspector.redstoneGuide.obtain"),
    description: t("inspector.redstoneGuide.sculkSource") });
  if (catalog && recipes.length) sections.push({ key: "redstone:craft",
    title: t("inspector.redstoneGuide.craft"),
    body: <CraftingGuideVisuals key={id} recipes={recipes} catalog={catalog} display={display} /> });
  if (related.length) sections.push({ key: "redstone:related",
    title: t("inspector.redstoneGuide.related"),
    body: <RedstoneRelatedParts ids={related} display={display} /> });
  return { ...base, ...display("item", id), category: t("inspector.subjectKinds.redstone"),
    description: t(`inspector.redstoneGuide.parts.${component.key}.behavior`),
    guideSections: sections, sectionLinksInteractive: true };
};
