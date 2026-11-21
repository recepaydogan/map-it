import { contentUrl } from "../../lib/content-url";

export interface CodexWeapon {
  damage?: number;
  headshot_multiplier?: number;
  rounds_per_minute?: number;
  magazine_rounds?: number;
  full_damage_range_m?: number;
  reload_seconds?: number;
  fast_reload_seconds?: number;
  aim_seconds?: number;
  draw_seconds?: number;
  fire_mode?: string;
  dps?: number;
  ammo?: string;
  spread?: Record<string, string>;
  knockdown?: string[][];
}

export interface CodexItemFacts {
  sourceId: string;
  type: string;
  rarity?: string;
  tier?: number;
  width?: number;
  height?: number;
  buyPrice?: number;
  sellPrice?: number;
  researchPrice?: number;
  settlementLevel?: number;
  fillPoints?: number;
  weapon?: CodexWeapon;
}

interface CodexItems {
  items: Record<string, CodexItemFacts>;
  cargo?: Record<string, { sellPrice: number | null; rarity?: string }>;
}

export interface CodexMarkerItem {
  item: string;
  min?: number;
  max?: number;
  points?: number;
  opens?: string;
  sellPrice?: number;
}

export interface CodexMarkerFacts {
  sourceId: string;
  kind: string;
  title?: string;
  district?: string;
  parent?: { id: string; category: string };
  activities?: string[];
  inside?: Record<string, number>;
  facts?: Record<string, string>;
  unlockSeconds?: number;
  drillSeconds?: number;
  random?: boolean;
  lootPool?: number;
  requirements?: CodexMarkerItem[];
  keys?: CodexMarkerItem[];
  refills?: CodexMarkerItem[];
  relatedItems?: CodexMarkerItem[];
}

export interface CodexMapFacts {
  points: Record<string, CodexMarkerFacts>;
  lootPools: CodexMarkerItem[][];
}

async function read<T>(path: string): Promise<T> {
  const response = await fetch(contentUrl(path));
  if (!response.ok) throw new Error("Could not load supplementary ROB RUN data.");
  return response.json() as Promise<T>;
}

let itemFacts: Promise<CodexItems> | undefined;
export function loadCodexItems() {
  itemFacts ??= read<CodexItems>("data/rob-run/codex-items.json").catch((error: unknown) => {
    itemFacts = undefined;
    throw error;
  });
  return itemFacts;
}

const sourceMaps = new Set(["looty-bay", "prison", "lennys-motel", "sales-center", "settlement", "world"]);
const mapFacts = new Map<string, Promise<CodexMapFacts>>();
export function loadCodexMap(mapId: string): Promise<CodexMapFacts | undefined> {
  if (!sourceMaps.has(mapId)) return Promise.resolve(undefined);
  const cached = mapFacts.get(mapId);
  if (cached) return cached;
  const request = read<CodexMapFacts>(`maps/${mapId}/codex-details.json`).catch((error: unknown) => {
    mapFacts.delete(mapId);
    throw error;
  });
  mapFacts.set(mapId, request);
  return request;
}

export function getLootMarkerIds(reference: CodexMapFacts | undefined, itemId: string) {
  if (!reference) return [];
  const pools = new Set(reference.lootPools.flatMap((pool, index) =>
    pool.some(({ item }) => item === itemId) ? [index] : []));
  return Object.entries(reference.points).flatMap(([id, point]) =>
    point.lootPool !== undefined && pools.has(point.lootPool) ? [id] : []);
}
