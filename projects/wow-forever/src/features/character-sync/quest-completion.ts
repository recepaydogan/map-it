import type { CharacterSnapshot } from "./character-snapshot";
import type { MapPoint } from "../map/types";

export interface QuestCompletionIndex {
  repeatable: Map<string, boolean>;
  markerQuestIds: Record<string, string>;
}

/** A repeatable classification wins over any normal/dungeon copy of the same quest. */
export function indexQuestCompletion(points: MapPoint[], markerQuestIds: Record<string, string>): QuestCompletionIndex {
  const repeatable = new Map<string, boolean>();
  const record = (id: string | undefined, repeats: boolean) => {
    if (id && /^[1-9]\d*$/.test(id)) repeatable.set(id, repeats || repeatable.get(id) === true);
  };
  for (const point of points) {
    if (["quest", "dungeon-quest", "repeatable-quest"].includes(point.category)) {
      record(("questId" in point ? point.questId : undefined) ?? markerQuestIds[point.id], point.category === "repeatable-quest");
    }
    if ("questOffers" in point) for (const offer of point.questOffers ?? []) {
      if (offer.kind) record(offer.id, offer.kind === "repeatable");
    }
  }
  return { repeatable, markerQuestIds };
}

/** Unknown repeatability, active quests and another character's data never imply completion. */
export function isCompletedOnceQuest(character: CharacterSnapshot | undefined, questId: string | undefined,
  index: QuestCompletionIndex | undefined): boolean {
  return !!questId && index?.repeatable.get(questId) === false
    && character?.completedQuests?.ids.includes(questId) === true
    && !character.quests?.active.some(quest => quest.id === questId);
}
