import type { TFunction } from "i18next";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { InspectorContent, InspectorGuideSection, InspectorSection } from "../inspector/inspector-types.ts";
import english from "../../i18n/locales/en.json" with { type: "json" };

type Resolver = (subject: InspectorSubject) => InspectorContent | null;

const isSpawnSection = (section: InspectorSection) => section.key === "entity:spawn-data"
  || section.key === "entity:locations" || section.key === "entity:entry-locations";
const isRewardSection = (section: InspectorSection) => section.key === "entity:special-rewards"
  || /^mechanics:(drop|loot|harvesting|interaction|barter)(:|$)/.test(section.key)
  || section.key.startsWith("mechanics:minecraft:mechanic/loot/");
const isInteractionSection = (section: InspectorSection) => /^mob-profile:(taming|breeding)$/.test(section.key)
  || /^mechanics:(taming|breeding|feeding|equipment)(:|$)/.test(section.key);

/** Group mob details by purpose for one continuous guide page. */
export const withGameEntitySections = (resolve: Resolver, t: TFunction): Resolver => subject => {
  const content = resolve(subject);
  if (subject.kind !== "entity" || !content) return content;
  const title = (key: keyof typeof english.inspector.mobDetails.tabs) =>
    t(`inspector.mobDetails.tabs.${key}`, { defaultValue: english.inspector.mobDetails.tabs[key] });
  const sections = content.sections ?? [];
  const spawnFacts = content.facts?.filter(fact => fact.key === "biome-spawns" || fact.key === "spawn-category");
  const spawnSections = sections.filter(isSpawnSection);
  const rewardSections = sections.filter(isRewardSection);
  const interactionSections = sections.filter(isInteractionSection);
  const relatedSections = sections.filter(section => !isSpawnSection(section) && !isRewardSection(section)
    && !isInteractionSection(section));
  const guideSections: InspectorGuideSection[] = [];
  if (content.heroImage || content.body) guideSections.push({ key: "overview", title: title("overview"),
    heroImage: content.heroImage, body: content.body });
  const behaviorSection: InspectorGuideSection | null = content.entityGuide?.behavior?.length || interactionSections.length ? { key: "behavior",
    title: title("behavior"), facts: content.entityGuide?.behavior,
    sections: interactionSections } : null;
  const combatSection: InspectorGuideSection | null = content.combat || content.entityGuide?.combat?.length
    ? { key: "combat", title: title("combat"), facts: content.entityGuide?.combat,
      body: content.combat } : null;
  if (content.combat && combatSection) guideSections.push(combatSection);
  if (behaviorSection) guideSections.push(behaviorSection);
  if (!content.combat && combatSection) guideSections.push(combatSection);
  if (rewardSections.length) guideSections.push({ key: "drops", title: title("drops"), sections: rewardSections });
  if (spawnFacts?.length || content.entityGuide?.spawning?.length || content.pillSections?.length || spawnSections.length) guideSections.push({
    key: "spawning", title: title("spawning"),
    facts: [...(content.entityGuide?.spawning ?? []), ...(spawnFacts ?? [])],
    pillSections: content.pillSections, sections: spawnSections,
  });
  if (relatedSections.length) guideSections.push({ key: "related", title: title("related"),
    sections: relatedSections });
  return { ...content, guideSections, sectionLinksInteractive: false };
};
