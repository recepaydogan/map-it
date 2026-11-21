import { contentUrl } from "../../lib/content-url";

export interface DungeonQuestItem { id: string; name: string; quantity?: number; icon?: string }
export interface DungeonQuestNpc { name: string; where?: string }
export interface DungeonQuest {
  id: string;
  dungeonId?: string;
  title: string;
  faction?: "Alliance" | "Horde";
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

let observedRequest: Promise<ObservedData> | undefined;
let wetlandsRequest: Promise<WetlandsData> | undefined;
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
  const [observed, previous] = await Promise.all([
    loadObserved(), dungeonId === "mapgenie-instance-949847" ? loadWetlands() : Promise.resolve(undefined),
  ]);
  const observedQuests = observed.quests.filter((quest) => quest.dungeonId === dungeonId);
  if (!previous) return { quests: observedQuests, itemLinks: {} };
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
