import { GAME_GUIDE_STRUCTURE_DIMENSIONS, GAME_STRUCTURE_TYPES } from "../../game-config.ts";

export interface WorldStructureSearchRequest {
  readonly revision: number;
  readonly knowledgeId: string;
}

export const resolveWorldStructureSearchTarget = (knowledgeId: string, preferredDimensionId: string) => {
  const matching = GAME_STRUCTURE_TYPES.filter(type => type.knowledgeId === knowledgeId);
  const target = matching.find(type => (GAME_GUIDE_STRUCTURE_DIMENSIONS[type.id] ?? "overworld") === preferredDimensionId)
    ?? matching[0];
  return target ? { typeId: target.id, dimensionId: GAME_GUIDE_STRUCTURE_DIMENSIONS[target.id] ?? "overworld" }
    : null;
};
