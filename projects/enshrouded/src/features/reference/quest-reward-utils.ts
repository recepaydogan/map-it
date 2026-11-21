import type { DatabaseItem } from "../database/item-database-types";
import type { DungeonQuest, DungeonQuestItem } from "./dungeon-quest-data";

export type QuestRewardData = Pick<DungeonQuest,
  "rewardChoices" | "rewardItems" | "reward" | "experience" | "money" | "reputation"> & {
    currencyRewards?: { id: string; name: string; quantity: number; icon: string }[];
  };

const comparable = (value: string) => value.toLowerCase().replace(/’/g, "'");

export const itemMentions = (value: string, items: DatabaseItem[], itemLinks: Record<string, string>): DungeonQuestItem[] => {
  const matches = new Map<string, DungeonQuestItem>();
  const searchable = comparable(value);
  for (const item of items) {
    if (item.name.length >= 6 && searchable.includes(comparable(item.name))) matches.set(item.id, { id: item.id, name: item.name });
  }
  for (const [name, id] of Object.entries(itemLinks)) {
    if (searchable.includes(comparable(name))) matches.set(id, { id, name });
  }
  const ordered = [...matches.values()].sort((left, right) => right.name.length - left.name.length);
  const occupied: [number, number][] = [];
  return ordered.filter((item) => {
    const start = searchable.indexOf(comparable(item.name));
    const end = start + item.name.length;
    if ((start > 0 && /[\p{L}\p{N}]/u.test(value[start - 1]!))
      || (end < value.length && /[\p{L}\p{N}]/u.test(value[end]!))
      || occupied.some(([from, to]) => start < to && end > from)) return false;
    occupied.push([start, end]);
    return true;
  });
};

export const hasQuestRewards = (quest: QuestRewardData) => Boolean(quest.rewardItems?.length || quest.rewardChoices?.length
  || quest.currencyRewards?.length || quest.reward || quest.experience || quest.money || quest.reputation?.length);
