import type { TFunction } from "i18next";
import { GAME_GUIDE_BIOME_FAMILIES, GAME_GUIDE_BIOME_LANDMARKS, GAME_GUIDE_BIOME_RESOURCES } from "../../game-config.ts";
import type { InspectorContent, InspectorGuideSection } from "../inspector/inspector-types.ts";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { BiomeGuideEntry } from "./biome-guide-data.ts";
import { BiomeClimate, BiomeSpawnGroups, BiomeSubjectLinks } from "./biome-guide-visuals.tsx";

export const createBiomeGuideContent = (biome: BiomeGuideEntry, index: ReadonlyMap<string, BiomeGuideEntry>,
  availableItems: ReadonlySet<string>, availableEntities: ReadonlySet<string>,
  availableStructures: ReadonlySet<string>, display: KnowledgeSubjectDisplay, t: TFunction): InspectorContent => {
  const family = GAME_GUIDE_BIOME_FAMILIES.find(group => group.id === biome.family);
  const localId = biome.id.slice(biome.id.indexOf(":") + 1);
  const landmarks = (GAME_GUIDE_BIOME_LANDMARKS[localId] ?? []).filter(id => availableStructures.has(id))
    .map(id => ({ kind: "poi" as const, id }));
  const resources = (GAME_GUIDE_BIOME_RESOURCES[localId] ?? []).filter(id => availableItems.has(id))
    .map(id => ({ kind: "item" as const, id }));
  const related = family?.biomeIds.filter(id => `minecraft:${id}` !== biome.id && index.has(`minecraft:${id}`))
    .slice(0, 6).map(id => ({ kind: "biome" as const, id: `minecraft:${id}` })) ?? [];
  const spawns = biome.spawns.filter(ref => ref.spawn?.category
    && (!availableEntities.size || availableEntities.has(ref.id)));
  const sections: InspectorGuideSection[] = [{ key: "biome:environment", title: t("inspector.biomeGuide.environment"),
    body: <BiomeClimate biome={biome} availableItems={availableItems} display={display} t={t} /> }];
  if (resources.length) sections.push({ key: "biome:resources", title: t("inspector.biomeGuide.resources"),
    body: <BiomeSubjectLinks subjects={resources} display={display} /> });
  if (landmarks.length) sections.push({ key: "biome:landmarks", title: t("inspector.biomeGuide.landmarks"),
    description: t("inspector.biomeGuide.landmarkNote"), body: <BiomeSubjectLinks subjects={landmarks} display={display} /> });
  if (spawns.length) sections.push({ key: "biome:spawns", title: t("inspector.biomeGuide.wildlife"),
    body: <BiomeSpawnGroups spawns={spawns} display={display} t={t} /> });
  if (related.length) sections.push({ key: "biome:related", title: t("inspector.biomeGuide.related"),
    body: <BiomeSubjectLinks subjects={related} display={display} /> });
  return { ...display("biome", biome.id), category: t("inspector.subjectKinds.biome"),
    description: t(`inspector.biomeGuide.highlights.${localId}`, { defaultValue: "" })
      || t(`inspector.biomeGuide.families.${biome.family}`), guideSections: sections,
    sectionLinksInteractive: true };
};
