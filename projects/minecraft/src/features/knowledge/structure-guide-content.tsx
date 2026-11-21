import type { TFunction } from "i18next";
import { GAME_STRUCTURE_HIGHLIGHTS } from "../../game-config.ts";
import type { InspectorContent, InspectorGuideSection } from "../inspector/inspector-types.ts";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { StructureGuideType } from "./structure-guide-data.ts";
import { StructureGuideLinks, StructureGuideOverview } from "./structure-guide-visuals.tsx";

export const createStructureGuideContent = (id: string, base: InspectorContent | null,
  types: readonly StructureGuideType[], display: KnowledgeSubjectDisplay, availableItems: ReadonlySet<string>,
  availableEntities: ReadonlySet<string>, t: TFunction,
  onSearchMap?: (knowledgeId: string) => void): InspectorContent | null => {
  const type = types.find(entry => entry.knowledgeId === id);
  if (!type) return null;
  const name = t(`structureMap.types.${type.id}`);
  const description = t(`structureMap.descriptions.${type.id}`);
  const discoveries = base?.summarySections ?? [];
  const mobs = discoveries.find(section => section.key === "structure:mobs")?.links
    .filter(link => !availableEntities.size || availableEntities.has(link.subject.id)) ?? [];
  const loot = discoveries.find(section => section.key === "structure:loot")?.links
    .filter(link => !availableItems.size || availableItems.has(link.subject.id)) ?? [];
  const highlights = GAME_STRUCTURE_HIGHLIGHTS[type.id];
  const sections: InspectorGuideSection[] = [{ key: "structure:explore",
    title: t("inspector.structureGuide.explore"),
    body: <StructureGuideOverview type={type} name={name} description={description} t={t}
      onSearchMap={onSearchMap ? () => onSearchMap(type.knowledgeId) : undefined} /> }];
  if (mobs.length) sections.push({ key: "structure:mobs", title: t("inspector.structureGuide.mobs"),
    body: <StructureGuideLinks links={mobs} display={display} /> });
  if (loot.length) sections.push({ key: "structure:loot", title: t("inspector.structureGuide.loot"),
    body: <StructureGuideLinks links={loot} display={display} /> });
  if (highlights) sections.push({ key: "structure:highlights", title: t(highlights.titleKey),
    body: <ul className="grid gap-2 text-[12px] text-zinc-200">
      {highlights.valueKeys.map(key => <li key={key} className="border-b border-border/70 pb-2">{t(key)}</li>)}
    </ul> });
  return { ...base, name, category: t("inspector.subjectKinds.structures"), image: type.artwork,
    description: undefined, guideSections: sections, sectionLinksInteractive: true };
};
