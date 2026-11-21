import type { TFunction } from "i18next";
import { GAME_GUIDE_ITEM_DESCRIPTION_KEYS, GAME_GUIDE_ITEM_HIGHLIGHTS, type GameGuideItemType } from "../../game-config.ts";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { InspectorContent, InspectorGuideSection, InspectorSection } from "../inspector/inspector-types.ts";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";
import type { CatalogRecipe } from "./recipe-types.ts";
import SmeltingGuideVisuals from "./smelting-guide-visuals.tsx";

const GENERATED_BLOCK_DESCRIPTIONS = new Set([
  "Break this block to obtain the possible drops listed below.",
  "This block has no direct item drops in the selected version.",
]);

const usefulDescription = (description?: string) => description?.split("\n\n")
  .filter(part => !GENERATED_BLOCK_DESCRIPTIONS.has(part)).join("\n\n") || undefined;

const sectionRole = (key: string): "obtain" | "uses" | "details" => {
  if (key.startsWith("crafting:ingredients") || key.startsWith("crafting:choice:")
    || key === "crafting:stations" || key.includes(":obtainedFrom:")
    || key === "structure:loot-sources" || key === "entity:special-rewards") return "obtain";
  if (key === "involved:requiredFor:enchanting") return "details";
  if (key === "crafting:uses" || key.includes(":usedFor:") || key.includes(":requiredFor:")) return "uses";
  return "details";
};

export const createItemGuideContent = (id: string, base: InspectorContent | null, itemType: GameGuideItemType,
  availableItems: ReadonlySet<string>, availableEntities: ReadonlySet<string>, display: KnowledgeSubjectDisplay,
  recipesById: ReadonlyMap<string, CatalogRecipe>, recipeCatalog: ValidatedRecipeCatalog | null,
  cookingRecipes: readonly CatalogRecipe[], t: TFunction): InspectorContent => {
  const sections = base?.sections ?? [];
  const firstOutputRecipe = recipeCatalog?.index.produces[id]?.[0];
  const showCooking = Boolean(firstOutputRecipe && recipesById.get(firstOutputRecipe)?.method === "cooking"
    && cookingRecipes.length && recipeCatalog);
  const obtain = sections.filter(section => sectionRole(section.key) === "obtain"
    && (!showCooking || !section.key.startsWith("crafting:")));
  const uses = sections.filter(section => sectionRole(section.key) === "uses");
  const details = sections.filter(section => sectionRole(section.key) === "details");
  const linked = new Set(sections.flatMap(section => section.links.map(link => `${link.subject.kind}:${link.subject.id}`)));
  for (const section of uses) for (const link of section.links) if (link.subject.kind === "recipe") {
    for (const output of recipesById.get(link.subject.id)?.outputs ?? []) linked.add(`item:${output.id}`);
  }
  const groupedUses: InspectorSection[] = uses.flatMap(section => {
    if (section.key !== "crafting:uses") return [section];
    const groups = new Map<string, typeof section.links[number][]>();
    for (const link of section.links) {
      const recipe = recipesById.get(link.subject.id);
      const group = recipe?.smithingTrim ? "trims" : recipe?.method === "smithing" ? "upgrades"
        : recipe?.method === "cooking" ? "cooking" : recipe?.method === "brewing" ? "brewing" : "crafting";
      const links = groups.get(group) ?? [];
      links.push(group === "upgrades" || group === "trims" ? { ...link, note: undefined } : link);
      groups.set(group, links);
    }
    return ["upgrades", "crafting", "cooking", "brewing", "trims"].flatMap(group => {
      const links = groups.get(group);
      return links?.length ? [{ key: `item:uses:${group}`, title: t(`inspector.itemGuide.usesCategories.${group}`),
        links, ...(group === "trims" ? { collapsed: true } : {}) }] : [];
    });
  });
  const related: InspectorSection["links"] = (GAME_GUIDE_ITEM_HIGHLIGHTS[id] ?? []).flatMap(candidate => {
    const subject: InspectorSubject = typeof candidate === "string" ? { kind: "item", id: candidate } : candidate;
    if (!(subject.kind === "item" ? availableItems : availableEntities).has(subject.id)
      || linked.has(`${subject.kind}:${subject.id}`)) return [];
    linked.add(`${subject.kind}:${subject.id}`);
    return [{ key: `item:related:${subject.kind}:${subject.id}`, subject, ...display(subject.kind, subject.id) }];
  });
  const guideSections: InspectorGuideSection[] = [];
  const eggMobId = id.endsWith("_spawn_egg") ? id.slice(0, -"_spawn_egg".length) : null;
  const eggMob = eggMobId && availableEntities.has(eggMobId) ? display("entity", eggMobId) : null;
  if (eggMobId && eggMob) guideSections.push({ key: "item:spawn", title: t("inspector.itemGuide.spawnEggMob"),
    sections: [{ key: "item:spawn:mob", title: t("inspector.itemGuide.spawnEggMob"),
      links: [{ key: `item:spawn:${eggMobId}`, subject: { kind: "entity", id: eggMobId }, ...eggMob }] }] });
  const process = showCooking && recipeCatalog
    ? <SmeltingGuideVisuals key={id} recipes={cookingRecipes} catalog={recipeCatalog}
      display={display} stationIds={null} /> : base?.body;
  if (process || obtain.length) guideSections.push({ key: "item:obtain", title: t("inspector.itemGuide.obtain"),
    ...(process ? { body: process } : {}), ...(obtain.length ? { sections: obtain } : {}) });
  if (groupedUses.length) guideSections.push({ key: "item:uses", title: t("inspector.itemGuide.uses"),
    sections: groupedUses });
  if (details.length) guideSections.push({ key: "item:details", title: t("inspector.itemGuide.details"),
    sections: details });
  if (related.length) guideSections.push({ key: "item:related", title: t("inspector.itemGuide.related"),
    sections: [{ key: "item:related:links", title: t("inspector.itemGuide.related"), links: related }] });
  const descriptionKey = GAME_GUIDE_ITEM_DESCRIPTION_KEYS[id]
    ?? (GAME_GUIDE_ITEM_HIGHLIGHTS[id] ? `inspector.itemGuide.highlights.${id.slice("minecraft:".length)}` : null);
  const highlight = descriptionKey ? t(descriptionKey) : undefined;
  const description = highlight || (eggMob ? t("inspector.itemGuide.spawnEggDescription", { mob: eggMob.name }) : undefined)
    || usefulDescription(base?.description)
    || (!guideSections.length ? t("inspector.itemGuide.catalogOnly") : undefined);
  return { ...base, ...display("item", id), category: t("inspector.subjectKinds.item"),
    description,
    facts: [{ key: "item:type", label: t("inspector.itemGuide.type"),
      value: t(`inspector.itemTypes.${itemType}`) }],
    guideSections, sectionLinksInteractive: true };
};
