import type { TFunction } from "i18next";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { InspectorContent } from "../inspector/inspector-types.ts";
import { createMechanicsInspectorResolver, createMechanicsSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { KnowledgeBiomeFamilyResolver, KnowledgeSubjectDescriptionResolver,
  KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { ValidatedMechanicsCatalog } from "./mechanics-types.ts";
import { createRecipeInspectorResolver } from "./recipe-inspector-content.tsx";
import type { RecipeInspectorCatalog } from "./recipe-inspector-content.tsx";

const keyed = (prefix: string, content: InspectorContent): InspectorContent => ({ ...content,
  sections: content.sections?.map(section => ({ ...section, key: `${prefix}:${section.key}` })) });

const sourcedSection = (sections: readonly NonNullable<InspectorContent["sections"]>[number][], key: string) =>
  sections.find(section => section.key === key);

/** Item details keep action and recipe views intact while placing acquisition sources in player reading order. */
const combineItemSections = (behavior: InspectorContent, crafting: InspectorContent) => {
  const behaviorSections = behavior.sections ?? [], craftingSections = crafting.sections ?? [];
  const drops = sourcedSection(behaviorSections, "behavior:involved:obtainedFrom:drop");
  const trades = sourcedSection(behaviorSections, "behavior:involved:obtainedFrom:trade");
  const ingredients = sourcedSection(craftingSections, "crafting:ingredients");
  const alternatives = craftingSections.filter(section => section.key.startsWith("crafting:choice:"));
  const stations = sourcedSection(craftingSections, "crafting:stations");
  const excluded = new Set([drops?.key, trades?.key, ingredients?.key, stations?.key, ...alternatives.map(section => section.key)]);
  return [
    ...behaviorSections.filter(section => !excluded.has(section.key)),
    ...(drops ? [drops] : []),
    ...(ingredients ? [ingredients] : []),
    ...alternatives,
    ...(trades ? [trades] : []),
    ...(stations ? [stations] : []),
    ...craftingSections.filter(section => !excluded.has(section.key)),
  ];
};

export const createKnowledgeInspectorResolver = (recipes: RecipeInspectorCatalog | null, mechanics: ValidatedMechanicsCatalog | null,
  fallback: KnowledgeSubjectDisplay, t: TFunction, locale: string, biomeFamily?: KnowledgeBiomeFamilyResolver,
  describeSubject?: KnowledgeSubjectDescriptionResolver) => {
  const display = mechanics ? createMechanicsSubjectDisplay(mechanics, fallback, locale) : fallback;
  const recipeResolver = recipes ? createRecipeInspectorResolver(recipes, display, t) : () => null;
  const craftedItemIds = new Set(Object.keys(recipes?.index.produces ?? {}));
  const mechanicsResolver = mechanics
    ? createMechanicsInspectorResolver(mechanics, fallback, t, locale, biomeFamily, craftedItemIds, describeSubject)
    : () => null;
  return (subject: InspectorSubject): InspectorContent | null => {
    const behavior = mechanicsResolver(subject), crafting = recipeResolver(subject);
    if (!behavior) return crafting; if (!crafting) return behavior;
    const first = keyed("behavior", behavior), second = keyed("crafting", crafting);
    return { ...second, ...first, body: first.body ?? second.body,
      sections: subject.kind === "item" || subject.kind === "block"
        ? combineItemSections(first, second)
        : [...(first.sections ?? []), ...(second.sections ?? [])] };
  };
};
