import { GAME_GUIDE_STRUCTURE_DIMENSIONS, GAME_GUIDE_STRUCTURE_RELEASES, GAME_STRUCTURE_TYPES } from "../../game-config.ts";
import { isAtLeastVersion } from "../worlds/world-structure-discovery-sections.ts";

export type StructureGuideType = (typeof GAME_STRUCTURE_TYPES)[number];

export const availableStructureGuideTypes = (edition: string, version: string): StructureGuideType[] => {
  if (edition !== "java" && edition !== "bedrock") return [];
  const types = GAME_STRUCTURE_TYPES.filter(type => {
    const release = GAME_GUIDE_STRUCTURE_RELEASES[type.id]?.[edition];
    return !release || isAtLeastVersion(version, release);
  });
  const unique = new Map<string, StructureGuideType>();
  for (const type of types) if (!unique.has(type.knowledgeId)) unique.set(type.knowledgeId, type);
  return [...unique.values()];
};

export const structureGuideDimensions = (knowledgeId: string): readonly ("overworld" | "nether" | "end")[] =>
  [...new Set(GAME_STRUCTURE_TYPES.filter(type => type.knowledgeId === knowledgeId)
    .map(type => GAME_GUIDE_STRUCTURE_DIMENSIONS[type.id] ?? "overworld"))];
