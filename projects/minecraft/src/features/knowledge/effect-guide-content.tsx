import type { TFunction } from "i18next";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { InspectorContent, InspectorGuideSection, InspectorSection } from "../inspector/inspector-types.ts";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import { effectGuidePotionIds, type EffectGuideEntry } from "./effect-guide-data.ts";
import { EffectPotionLinks, EffectRelatedLinks } from "./effect-guide-visuals.tsx";

const sourceLinks = (ids: readonly string[], kind: InspectorSubject["kind"],
  available: ReadonlySet<string>, display: KnowledgeSubjectDisplay) => ids
  .map(key => `minecraft:${key}`).filter(id => available.has(id))
  .map(id => ({ key: `effect-source:${kind}:${id}`, subject: { kind, id }, ...display(kind, id) }));

export const createEffectGuideContent = (id: string, effect: EffectGuideEntry,
  index: ReadonlyMap<string, EffectGuideEntry>, availableItems: ReadonlySet<string>,
  availableEntities: ReadonlySet<string>, display: KnowledgeSubjectDisplay, t: TFunction): InspectorContent => {
  const potionIds = effectGuidePotionIds(effect, availableItems);
  const items = "sourceItems" in effect ? sourceLinks(effect.sourceItems, "item", availableItems, display) : [];
  const entities = "sourceEntities" in effect ? sourceLinks(effect.sourceEntities, "entity", availableEntities, display) : [];
  const sections: InspectorGuideSection[] = [{ key: "effect:use", title: t("inspector.effectGuide.inPlay"),
    description: t(`inspector.effectGuide.parts.${effect.key}.tip`) }];
  const sources: InspectorSection[] = [];
  if (items.length) sources.push({ key: "effect:items", title: t("inspector.effectGuide.items"), links: items });
  if (entities.length) sources.push({ key: "effect:entities", title: t("inspector.effectGuide.entities"), links: entities });
  sections.push({ key: "effect:obtain", title: t("inspector.effectGuide.obtain"),
    description: t(`inspector.effectGuide.parts.${effect.key}.obtain`),
    ...(sources.length ? { sections: sources } : {}) });
  if (potionIds.length) sections.push({ key: "effect:potions", title: t("inspector.effectGuide.potions"),
    body: <EffectPotionLinks ids={potionIds} display={display} /> });
  const related = [...index.entries()].filter(([candidateId, candidate]) => candidateId !== id
    && candidate.group === effect.group).slice(0, 3).map(([candidateId]) => candidateId);
  if (related.length) sections.push({ key: "effect:related", title: t("inspector.effectGuide.related"),
    body: <EffectRelatedLinks ids={related} display={display} /> });
  return { ...display("effect", id), category: t("inspector.subjectKinds.effect"),
    description: t(`inspector.effectGuide.parts.${effect.key}.behavior`), guideSections: sections,
    sectionLinksInteractive: true };
};
