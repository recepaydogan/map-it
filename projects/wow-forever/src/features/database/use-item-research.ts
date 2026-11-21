import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export interface ItemSourceRecord {
  t: "craft" | "drop" | "world" | "quest" | "vendor" | "object" | "container";
  src?: string; fv?: number; n?: string; npc?: number; inst?: number; boss?: boolean; pct?: number; seen?: number;
  lv?: number | [number, number]; choice?: boolean; side?: string; prof?: string; skill?: number;
  spell?: number; item?: number; q?: number; many?: number; m?: number; x?: number; y?: number; count?: number;
  mapId?: string; markerId?: string;
  provided?: boolean;
}
export interface ItemSoldRecord {
  total: number;
  v: { npc: number; n?: string | number; sub?: string; zone?: string; side?: string; x?: number; y?: number; p?: number; fv?: number; src?: string; mapId?: string; markerId?: string }[];
}
export interface ItemCraftingRecord {
  made?: [string, number, number, string, number][];
  used?: [string, number, number, string, number, number, number][];
}
interface ResearchIndex { version: 1; dungeons: Record<string, string>; zones: Record<string, string>; localDungeons: Record<string, string> }
export interface ItemResearch { sources: ItemSourceRecord[]; sold: ItemSoldRecord | null; crafting: ItemCraftingRecord | null; index: ResearchIndex }

const root = "data/items/research";
const requests = new Map<string, Promise<unknown>>();
function getJson<T>(path: string): Promise<T> {
  if (!requests.has(path)) requests.set(path, fetch(contentUrl(`${root}/${path}`)).then(async (response) => {
    if (!response.ok) throw new Error(`Item research ${path}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }).catch((error: unknown) => { requests.delete(path); throw error; }));
  return requests.get(path)! as Promise<T>;
}

export const useItemResearch = (itemId: string, enabled: boolean) => {
  const [state, setState] = useState<{ id: string; data: ItemResearch | null; error: boolean }>({ id: "", data: null, error: false });
  useEffect(() => {
    if (!enabled || !/^\d+$/.test(itemId)) return;
    let active = true;
    const shard = Number(itemId) % 64;
    void Promise.all([
      getJson<ResearchIndex>("index.json"),
      getJson<Record<string, ItemSourceRecord[]>>(`sources/${shard}.json`),
      getJson<Record<string, ItemSoldRecord>>(`sold/${shard}.json`),
      getJson<Record<string, ItemCraftingRecord>>(`crafting/${shard}.json`),
    ]).then(([index, sources, sold, crafting]) => {
      if (index.version !== 1) throw new Error("Invalid item research index");
      if (active) setState({ id: itemId, data: { index, sources: sources[itemId] ?? [], sold: sold[itemId] ?? null, crafting: crafting[itemId] ?? null }, error: false });
    }).catch((error: unknown) => { console.error("Failed to load item source records", error); if (active) setState({ id: itemId, data: null, error: true }); });
    return () => { active = false; };
  }, [itemId, enabled]);
  return enabled && state.id === itemId ? { data: state.data, error: state.error } : { data: null, error: false };
};
