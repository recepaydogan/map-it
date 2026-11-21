import { contentUrl } from "../../lib/content-url";
import { dungeonBossLoot } from "./dungeon-journal";

export interface BossGuideBoss {
  name: string;
  npcId?: string;
  rare?: boolean;
  tipKey?: string;
  abilities?: { name: string; descriptionKey: string }[];
  loot: string[];
}
interface BossGuideEntry { bosses: BossGuideBoss[] }
interface BossRosterEntry {
  bosses: string[];
  mechanics?: Record<string, {
    npcIds: number[];
    level?: number;
    abilities: { spellId: number; name: string; target?: string; intervalSeconds?: number }[];
  }>;
}
interface LootItem {
  id: string;
  name: string;
  icon?: string;
  grade: string;
  itemLevel?: number;
  slot?: string;
  stats: { label: string; value: string }[];
}
export interface BossData {
  guides: Record<string, BossGuideEntry>;
  rosters: Record<string, BossRosterEntry>;
  loot: Record<string, LootItem>;
}

const verifiedLoot: Readonly<Partial<Record<string, { bosses: Partial<Record<string, string[]>> }>>> = {};

export const dungeonBossLootIds = (dungeonId: string, name: string, guideLoot: string[] = []) => {
  const verified = verifiedLoot[dungeonId]?.bosses[name];
  return verified ? [...new Set([...guideLoot, ...verified])] : guideLoot;
};

let cached: BossData | null = null;
let pending: Promise<BossData> | null = null;
export const cachedBossData = () => cached;
export const loadBossData = () => {
  if (cached) return Promise.resolve(cached);
  pending ??= Promise.all([
    "boss-guides.json", "foreverdb-bosses.json", "loot-items.json",
  ].map(async (file) => {
    const response = await fetch(contentUrl(`data/dungeons/${file}`));
    if (!response.ok) throw new Error(`Dungeon guide ${file}: HTTP ${response.status}`);
    return response.json() as Promise<{ version: 1; entries?: Record<string, unknown>; items?: Record<string, LootItem> }>;
  })).then(([guides, rosters, loot]) => {
    const journalGuides = Object.fromEntries(Object.entries(dungeonBossLoot).map(([id, guide]) => [
      id, { bosses: guide.bosses },
    ]));
    cached = {
      guides: { ...journalGuides, ...guides.entries as Record<string, BossGuideEntry> },
      rosters: rosters.entries as Record<string, BossRosterEntry>,
      loot: loot.items ?? {},
    };
    return cached;
  }).catch((error: unknown) => { pending = null; throw error; });
  return pending;
};
