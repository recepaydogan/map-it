import type { CharacterQuestObjective } from "./character-snapshot";

/** Explicit game state wins; counters are a fallback only when state is absent. */
export function isCharacterQuestObjectiveComplete(objective: CharacterQuestObjective): boolean {
  if (objective.done !== null) return objective.done;
  return objective.have !== null && objective.need !== null && objective.need > 0 && objective.have >= objective.need;
}
