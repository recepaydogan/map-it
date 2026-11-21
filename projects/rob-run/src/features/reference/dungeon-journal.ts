import type { TFunction } from "i18next";
import type { DungeonQuest } from "./dungeon-quest-data";

type DungeonQuestLink = Pick<DungeonQuest, "id"> & Partial<DungeonQuest>;

export const dungeonSuggestedLevels: Readonly<Partial<Record<string, readonly number[]>>> = {};
export const dungeonBossLoot: Record<string, { bosses: { name: string; npcId?: string; rare?: boolean; loot: string[] }[] }> = {};
export const dungeonQuestLinks : Readonly<Partial<Record<string, DungeonQuestLink[]>>> = {};

export const dungeonLevelRange = (id: string) => dungeonSuggestedLevels[id]?.join("–");

export const dungeonCreatureName = (name: string, t: TFunction, gameText: (name: string, key?: string) => string,
  npcId?: number | string) => {
  const translated = gameText(name, npcId ? `Creature:${npcId}:0` : undefined);
  return translated === name ? t(`dungeonJournal.creatureNames.${name}`, { defaultValue: name }) : translated;
};
