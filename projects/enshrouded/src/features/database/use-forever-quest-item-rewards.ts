import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export interface ForeverQuestItemReward {
  questId: string;
  name: string;
  level: number;
  giver: string;
  region: string;
  markerId: string;
  quantity: number;
  faction?: "Alliance" | "Horde" | "Both" | "Neutral";
  choice?: true;
  requiredItem?: string;
}

interface ForeverQuestItemRewardIndex {
  version: 1;
  items: Record<string, ForeverQuestItemReward[]>;
}

let request: Promise<ForeverQuestItemRewardIndex> | null = null;

const loadIndex = () => {
  if (!request) request = fetch(contentUrl("data/items/forever-quest-rewards.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Forever quest rewards: HTTP ${response.status}`);
      const data = await response.json() as ForeverQuestItemRewardIndex;
      if (data.version !== 1 || !data.items || typeof data.items !== "object") {
        throw new Error("Invalid Forever quest reward index");
      }
      return data;
    }).catch((error: unknown) => { request = null; throw error; });
  return request;
};

export const useForeverQuestItemRewards = (itemId: string) => {
  const [state, setState] = useState<{ id: string; rewards: ForeverQuestItemReward[]; error: boolean }>({
    id: "", rewards: [], error: false,
  });

  useEffect(() => {
    if (!/^\d+$/.test(itemId)) return;
    let active = true;
    void loadIndex().then((index) => {
      if (active) setState({ id: itemId, rewards: index.items[itemId] ?? [], error: false });
    }).catch((error: unknown) => {
      console.error("Failed to load Forever quest item rewards", error);
      if (active) setState({ id: itemId, rewards: [], error: true });
    });
    return () => { active = false; };
  }, [itemId]);

  return state.id === itemId ? { rewards: state.rewards, error: state.error } : { rewards: [], error: false };
};
