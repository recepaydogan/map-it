import type { TFunction } from "i18next";
import type { InspectorContent, InspectorGuideSection, InspectorSection } from "../inspector/inspector-types.ts";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { BiomeGuideEntry } from "./biome-guide-data.ts";
import { GAME_GUIDE_BLOCK_BIOMES, GAME_GUIDE_BLOCK_HIGHLIGHTS, GAME_GUIDE_BLOCK_PROFILES,
  GAME_GUIDE_ORE_BLOCKS } from "../../game-config.ts";
import { createMissingWoodBlockRecipe, missingWoodBlockOutputs, woodBlockPattern } from "./block-guide-data.ts";
import CraftingGuideVisuals from "./crafting-guide-visuals.tsx";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";

export const createBlockGuideContent = (id: string, item: InspectorContent,
  biomes: ReadonlyMap<string, BiomeGuideEntry>, display: KnowledgeSubjectDisplay,
  available: (subject: InspectorSubject) => boolean, recipes: ValidatedRecipeCatalog | null,
  crafted: ReadonlySet<string>, t: TFunction): InspectorContent => {
  const biomeIds = new Set<string>();
  for (const path of GAME_GUIDE_BLOCK_BIOMES[id] ?? []) {
    const biomeId = `minecraft:${path}`;
    if (biomes.has(biomeId)) biomeIds.add(biomeId);
  }
  const occurrence = [...biomeIds].map(biomeId => ({ key: `block:biome:${biomeId}`,
    subject: { kind: "biome" as const, id: biomeId }, ...display("biome", biomeId) }));
  const section: InspectorSection | null = occurrence.length ? { key: "block:biomes",
    title: t("inspector.blockGuide.naturalOccurrence"), links: occurrence,
    previewSize: 4,
    description: t("inspector.blockGuide.surfaceCaveat") } : null;
  const guideSections: InspectorGuideSection[] = (item.guideSections ?? []).map(group => ({ ...group,
    ...(group.sections ? { sections: group.sections.map(child => ({ ...child,
      links: child.links.filter(link => !((link.subject.kind === "item" || link.subject.kind === "block")
        && link.subject.id === id)) }))
      .filter(child => child.links.length > 0) } : {}),
  })).filter(group => group.body || group.description || group.facts?.length || group.sections?.length);
  const wood = woodBlockPattern(id);
  const familyRecipe = recipes && wood ? createMissingWoodBlockRecipe(id, crafted.has(id),
    available({ kind: "item", id: wood.material })) : null;
  if (familyRecipe && recipes) guideSections.unshift({ key: "block:family:craft", title: t("inspector.blockGuide.craft"),
    body: <CraftingGuideVisuals recipes={[familyRecipe]} catalog={recipes} display={display} /> });
  const ore = GAME_GUIDE_ORE_BLOCKS[id];
  if (ore) {
    const resourceAvailable = available({ kind: "item", id: ore.resource });
    const detailsIndex = guideSections.findIndex(group => group.key === "item:details");
    const details = detailsIndex >= 0 ? guideSections[detailsIndex] : undefined;
    const breaking = resourceAvailable && !ore.smelted
      ? details?.sections?.find(section => section.key === "block:mechanics:breaking") : undefined;
    if (details && breaking) {
      const remaining = details.sections?.filter(section => section !== breaking) ?? [];
      if (remaining.length) guideSections[detailsIndex] = { ...details, sections: remaining };
      else guideSections.splice(detailsIndex, 1);
    }
    const miningFacts = [
      { key: "block:ore:location", label: t("inspector.blockGuide.ore.location"),
        value: t(`inspector.blockGuide.ore.locations.${ore.location}`) },
      { key: "block:ore:tool", label: t("inspector.blockGuide.ore.tool"),
        value: t(`inspector.blockGuide.ore.tools.${ore.tool}`) },
    ];
    const miningDescription = t(ore.smelted
      ? "inspector.blockGuide.ore.smeltedMiningTip" : "inspector.blockGuide.ore.miningTip")
      + (ore.deepslate ? ` ${t("inspector.blockGuide.ore.deepslateTip")}` : "");
    const yieldSection: InspectorSection[] = resourceAvailable && !ore.smelted ? [{ key: "block:ore:yield",
      title: t("inspector.blockGuide.ore.yield"), links: breaking?.links ?? [{ key: `block:ore:yield:${ore.resource}`,
        subject: { kind: "item", id: ore.resource }, ...display("item", ore.resource),
        note: t("inspector.blockGuide.ore.yieldNote") }] }] : [];
    const obtainIndex = guideSections.findIndex(group => group.key === "item:obtain");
    if (obtainIndex >= 0) {
      const obtain = guideSections[obtainIndex];
      guideSections[obtainIndex] = { ...obtain, facts: [...miningFacts, ...obtain.facts ?? []],
        description: [miningDescription, obtain.description].filter(Boolean).join(" "),
        sections: [...yieldSection, ...obtain.sections ?? []] };
    } else guideSections.unshift({ key: "block:ore:mining", title: t("inspector.blockGuide.obtain"),
      facts: miningFacts, description: miningDescription,
      ...(yieldSection.length ? { sections: yieldSection } : {}) });
    const usesIndex = guideSections.findIndex(group => group.key === "item:uses");
    const uses = usesIndex >= 0 ? guideSections[usesIndex] : undefined;
    const cooking = uses?.sections?.filter(section => section.key === "item:uses:cooking") ?? [];
    if (uses && cooking.length) {
      const remaining = uses.sections?.filter(section => section.key !== "item:uses:cooking") ?? [];
      if (remaining.length) guideSections[usesIndex] = { ...uses, sections: remaining };
      else guideSections.splice(usesIndex, 1);
      const recipeById = new Map(recipes?.recipes.map(recipe => [recipe.id, recipe]) ?? []);
      const results = [...new Map(cooking.flatMap(section => section.links.flatMap(link => {
        const recipe = link.subject.kind === "recipe" ? recipeById.get(link.subject.id) : undefined;
        const outputs = recipe?.outputs.filter(output => available({ kind: "item", id: output.id }));
        return outputs?.length ? outputs.map(output => ({ key: `block:ore:processed:${output.id}`,
          subject: { kind: "item" as const, id: output.id }, ...display("item", output.id) })) : [link];
      })).map(link => [`${link.subject.kind}:${link.subject.id}`, link] as const)).values()];
      const processingIndex = guideSections.findIndex(group => group.key === "item:obtain"
        || group.key === "block:ore:mining");
      guideSections.splice(processingIndex + 1, 0, { key: "block:ore:processing",
        title: t("inspector.blockGuide.ore.processing"),
        description: t(ore.smelted ? "inspector.blockGuide.ore.smeltedProcessingNote"
          : "inspector.blockGuide.ore.processingNote"),
        sections: [{ key: "block:ore:processed-results", title: t("inspector.blockGuide.ore.processing"),
          links: results }] });
    }
  }
  const obtain = guideSections.find(group => group.key === "item:obtain");
  if (section && obtain) {
    const index = guideSections.indexOf(obtain);
    guideSections[index] = { ...obtain, sections: [...obtain.sections ?? [], section] };
  } else if (section) guideSections.unshift({ key: "block:obtain", title: t("inspector.blockGuide.obtain"),
    sections: [section] });
  const extraUses = missingWoodBlockOutputs(id, crafted, outputId => available({ kind: "item", id: outputId }));
  if (extraUses.length) {
    const links = extraUses.map(outputId => ({ key: `block:family:use:${outputId}`,
      subject: { kind: "item" as const, id: outputId }, ...display("item", outputId) }));
    const group = { key: "block:family:uses", title: t("inspector.blockGuide.familyUses"), links };
    const uses = guideSections.find(entry => entry.key === "item:uses");
    if (uses) guideSections[guideSections.indexOf(uses)] = { ...uses, sections: [...uses.sections ?? [], group] };
    else guideSections.push({ key: "item:uses", title: t("inspector.itemGuide.uses"), sections: [group] });
  }
  const profile = GAME_GUIDE_BLOCK_PROFILES[id as keyof typeof GAME_GUIDE_BLOCK_PROFILES];
  if (profile) for (const entry of profile) {
    const links = entry.links.flatMap(candidate => {
      const subject: InspectorSubject = { kind: candidate.kind, id: candidate.id };
      return available(subject) ? [{ key: `block:profile:${candidate.kind}:${candidate.id}`, subject,
        ...display(candidate.kind, candidate.id) }] : [];
    });
    guideSections.push({ key: `block:profile:${entry.key}`,
      title: t(`inspector.blockGuide.profileTitles.${entry.key}`),
      description: t(`inspector.blockGuide.profiles.${id.slice("minecraft:".length)}.${entry.key}`),
      ...(links.length ? { sections: [{ key: `block:profile:${entry.key}:links`,
        title: t(`inspector.blockGuide.profileTitles.${entry.key}`), links }] } : {}) });
  }
  if (wood) guideSections.push({ key: "block:family:behavior",
    title: t("inspector.blockGuide.profileTitles.use"),
    description: t(`inspector.blockGuide.woodFamilies.behavior.${wood.family}`) });
  const description = GAME_GUIDE_BLOCK_HIGHLIGHTS.has(id)
    ? t(`inspector.blockGuide.highlights.${id.slice(id.indexOf(":") + 1)}`)
    : ore && (!item.description || item.description === t("inspector.itemGuide.catalogOnly"))
      ? t("inspector.blockGuide.ore.summary", { resource: display("item", ore.resource).name })
    : wood && (!item.description || item.description === t("inspector.itemGuide.catalogOnly"))
      ? t(`inspector.blockGuide.woodFamilies.summary.${wood.family}`)
    : occurrence.length && item.description === t("inspector.itemGuide.catalogOnly")
      ? t("inspector.blockGuide.surfaceSummary") : item.description;
  return { ...item, category: t("inspector.subjectKinds.block"), description,
    facts: undefined, guideSections };
};
