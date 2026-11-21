import type { SkillRollData } from "./intelligence-types";

export const itemSkillRolls = (data: SkillRollData, itemId: string) => data.pools[data.items[itemId] ?? ""] ?? [];
export function matchesSkillRoll(data: SkillRollData, itemId: string, characterClass: string, skill: string) {
  return (!characterClass && !skill) || itemSkillRolls(data, itemId).some(r =>
    (!characterClass || r.class === characterClass) && (!skill || r.skill.id === skill));
}
