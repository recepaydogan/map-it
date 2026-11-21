import type { TFunction } from "i18next";
import { GAME_STRUCTURE_DISCOVERIES, GAME_STRUCTURE_TYPES } from "../../game-config.ts";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { InspectorContent, InspectorLink } from "../inspector/inspector-types.ts";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import { createStructureDiscoverySections } from "../worlds/world-structure-discovery-sections.ts";

type KnowledgeResolver = (subject: InspectorSubject) => InspectorContent | null;

export const isConfiguredStructureSubject = (subject: InspectorSubject) => subject.kind === "poi"
  && GAME_STRUCTURE_TYPES.some(type => type.knowledgeId === subject.id);

/** Reuse the map card's versioned discoveries for item-to-structure navigation. */
export const withGameStructureLootSources = (resolve: KnowledgeResolver, display: KnowledgeSubjectDisplay,
  t: TFunction, context: Readonly<{ edition: string; version: string }>): KnowledgeResolver => {
  if (context.edition !== "java" && context.edition !== "bedrock") return resolve;
  const byItem = new Map<string, InspectorLink[]>();
  const structureSections = new Map<string, ReturnType<typeof createStructureDiscoverySections>>();
  for (const type of GAME_STRUCTURE_TYPES) {
    const discoveries = GAME_STRUCTURE_DISCOVERIES[type.id];
    const sections = createStructureDiscoverySections(discoveries, display, {
      mobs: t("inspector.subjectKinds.entity"), loot: t("inspector.subjectKinds.loot"),
    }, context);
    if (!structureSections.has(type.knowledgeId)) structureSections.set(type.knowledgeId, sections);
    for (const loot of sections.find(section => section.key === "structure:loot")?.links ?? []) {
      const links = byItem.get(loot.subject.id) ?? [];
      if (!links.some(link => link.subject.id === type.knowledgeId)) links.push({
        key: `structure:loot-source:${type.id}`, subject: { kind: "poi", id: type.knowledgeId },
        name: t(`structureMap.types.${type.id}`), image: type.artwork,
      });
      byItem.set(loot.subject.id, links);
    }
  }
  return subject => {
    const base = resolve(subject);
    if (subject.kind === "poi") {
      const type = GAME_STRUCTURE_TYPES.find(candidate => candidate.knowledgeId === subject.id);
      if (!type) return base;
      return { ...base, name: t(`structureMap.types.${type.id}`), category: t("inspector.subjectKinds.poi"),
        contextLabel: base?.contextLabel ?? `${context.edition} · ${context.version}`,
        image: type.artwork, heroImage: type.preview,
        description: t(`structureMap.descriptions.${type.id}`),
        summarySections: [...(base?.summarySections ?? []), ...(structureSections.get(subject.id) ?? [])] };
    }
    if (subject.kind !== "item" && subject.kind !== "block") return base;
    const links = byItem.get(subject.id);
    if (!links?.length) return base;
    const displayed = display(subject.kind, subject.id);
    return { ...base, name: base?.name ?? displayed.name, image: base?.image ?? displayed.image,
      category: base?.category ?? t(`inspector.subjectKinds.${subject.kind}`),
      contextLabel: base?.contextLabel ?? `${context.edition} · ${context.version}`,
      sections: [...(base?.sections ?? []), { key: "structure:loot-sources",
        title: t("inspector.mobDetails.structureLocations"), links }] };
  };
};
