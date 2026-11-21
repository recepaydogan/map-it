import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export interface ForeverGatheringItemSources {
  group: "fish" | "cloth" | "leather";
  regions: { name: string; markerId: string; count: number }[];
  creatures: { id: string; name: string; regions: string[] }[];
}

interface GatheringSourceCatalog {
  version: 1;
  items: Record<string, ForeverGatheringItemSources>;
}

const gatheringItemIds = new Set([
  "7973", "13888", "6522", "6359", "13893", "13757", "6358", "6291", "6308", "13754",
  "21153", "6317", "6289", "8365", "13759", "13890", "6361", "13758", "6362", "21071",
  "6303", "4603", "13756", "13760", "13889", "13755", "13422", "3820",
  "2589", "2592", "4306", "4338", "14047", "2318", "2319", "4234", "4304", "8170",
]);

export const hasForeverGatheringSources = (itemId: string) => gatheringItemIds.has(itemId);

let request: Promise<GatheringSourceCatalog> | null = null;
const loadSources = () => {
  request ??= fetch(contentUrl("data/items/forever-gathering-sources.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Gathering sources: HTTP ${response.status}`);
      const data = await response.json() as GatheringSourceCatalog;
      if (data.version !== 1 || !data.items || typeof data.items !== "object") {
        throw new Error("Invalid gathering source catalog");
      }
      return data;
    })
    .catch((error: unknown) => { request = null; throw error; });
  return request;
};

export const useForeverGatheringSources = (itemId: string) => {
  const [state, setState] = useState<{ itemId: string; data: ForeverGatheringItemSources | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!hasForeverGatheringSources(itemId)) return;
    let active = true;
    void loadSources().then((catalog) => {
      if (active) setState({ itemId, data: catalog.items[itemId] ?? null, error: false });
    }).catch((error: unknown) => {
      console.error("Failed to load Forever gathering sources", error);
      if (active) setState({ itemId, data: null, error: true });
    });
    return () => { active = false; };
  }, [itemId]);
  return state?.itemId === itemId ? state : { itemId, data: null, error: false };
};
