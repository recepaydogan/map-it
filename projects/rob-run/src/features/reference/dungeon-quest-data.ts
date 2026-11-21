import { contentUrl } from "../../lib/content-url";
import { dungeonQuestLinks } from "./dungeon-journal";
import type { TFunction } from "i18next";

export interface DungeonQuestItem { id: string; name: string; quantity?: number; icon?: string }
export interface DungeonQuestNpc { id?: string; name: string; where?: string }
export interface DungeonQuest {
  id: string;
  dungeonId?: string;
  title: string;
  faction?: "Alliance" | "Horde" | "Both";
  level: number;
  minimumLevel?: number;
  objective: string;
  objectives?: string[];
  startsAt?: string;
  reward?: string;
  giver?: DungeonQuestNpc;
  turnIn?: DungeonQuestNpc;
  rewardChoices?: DungeonQuestItem[];
  rewardItems?: DungeonQuestItem[];
  experience?: number;
  money?: string;
  reputation?: string[];
  chain?: string[];
}
interface WetlandsData { version: 1; dungeonId: string; itemLinks?: Record<string, string>; quests: DungeonQuest[] }
interface ObservedData { version: 1; verification: "beta-log"; quests: DungeonQuest[] }
export interface DungeonQuestCollection { quests: DungeonQuest[]; itemLinks: Record<string, string> }

export const dungeonQuestCopy = (t: TFunction, id: string, field: "title" | "objective", source: string) => {
  const key = `dungeonQuest.copy.${id}.${field}`;
  return t(key, { lng: "en", defaultValue: "" }) === source ? t(key) : source;
};

export const dungeonQuestTitle = (quest: Pick<DungeonQuest, "id" | "title">, t: TFunction,
  gameText: (name: string, key?: string) => string) => {
  const translated = gameText(quest.title, `Quest:${quest.id}:0`);
  return translated === quest.title ? dungeonQuestCopy(t, quest.id, "title", quest.title) : translated;
};

let observedRequest: Promise<ObservedData> | undefined;
let wetlandsRequest: Promise<WetlandsData> | undefined;
let questDetailsRequest: Promise<{ quests: Record<string, DungeonQuest> }> | undefined;
const fetchData = async <T,>(path: string): Promise<T> => {
  const response = await fetch(contentUrl(path));
  if (!response.ok) throw new Error(`Dungeon quests: HTTP ${response.status}`);
  return response.json() as Promise<T>;
};
const loadObserved = () => {
  observedRequest ??= fetchData<ObservedData>("data/dungeons/observed-quests.json").then((data) => {
    if (data.version !== 1 || data.verification !== "beta-log" || !Array.isArray(data.quests)) {
      throw new Error("Invalid observed dungeon quest data");
    }
    return data;
  }).catch((error: unknown) => { observedRequest = undefined; throw error; });
  return observedRequest;
};
const loadWetlands = () => {
  wetlandsRequest ??= fetchData<WetlandsData>("data/dungeons/excavation-site-wetlands.json").then((data) => {
    if (data.version !== 1 || data.dungeonId !== "mapgenie-instance-949847" || !Array.isArray(data.quests)) {
      throw new Error("Invalid Wetlands dungeon quest data");
    }
    return data;
  }).catch((error: unknown) => { wetlandsRequest = undefined; throw error; });
  return wetlandsRequest;
};

export async function loadDungeonQuests(dungeonId: string): Promise<DungeonQuestCollection> {
  const links = dungeonQuestLinks[dungeonId] ?? [];
  const [observed, previous, details] = await Promise.all([
    loadObserved(), dungeonId === "mapgenie-instance-949847" ? loadWetlands() : Promise.resolve(undefined),
    links.length ? questDetailsRequest ??= fetchData<{ quests: Record<string, DungeonQuest> }>("data/quests/quest-details.json")
      .catch((error: unknown) => { questDetailsRequest = undefined; throw error; }) : undefined,
  ]);
  const observedQuests = observed.quests.filter((quest) => quest.dungeonId === dungeonId);
  if (!previous) {
    const quests = new Map(observedQuests.map((quest) => [quest.id, quest]));
    for (const link of links) {
      const quest = { ...details?.quests[link.id], ...quests.get(link.id), ...link };
      if (quest.title && quest.level !== undefined && quest.objective) {
        quests.set(link.id, { ...quest, title: quest.title, level: quest.level, objective: quest.objective, dungeonId });
      }
    }
    return { quests: [...quests.values()], itemLinks: {} };
  }
  const byId = new Map(observedQuests.map((quest) => [quest.id, quest]));
  const olderIds = new Set(previous.quests.map((quest) => quest.id));
  return {
    quests: [
      ...previous.quests.map((quest) => ({ ...quest, ...byId.get(quest.id), faction: quest.faction })),
      ...observedQuests.filter((quest) => !olderIds.has(quest.id)),
    ],
    itemLinks: previous.itemLinks ?? {},
  };
}
