import { erItemEnglishTextByKey, erItemKey, erItems, type ErItem } from "../../../data/er-items-data";
import type { BossAttackProfile } from "./advisor-data";
import type { BuildStats, ItemAccessResolver, RecommendedItem } from "./types";

const COUNTERABLE_STATUS = new Set([
  "Scarlet Rot",
  "Poison",
  "Frostbite",
  "Madness",
  "Sleep",
  "Death Blight",
]);

// Persistent arena clouds and nested projectile effects are not always
// referenced by the NPC behavior rows used by the attack-profile extractor.
// Exact encounter ids fill that proven data gap; boss-name matching is
// deliberately not used.
const STATUS_OVERRIDES_BY_MARKER = new Map<string, string[]>([
  ["er-boss-1047400800", ["Scarlet Rot"]],
  ["er-boss-1050570850", ["Scarlet Rot"]],
  ["er-boss-1051400800", ["Scarlet Rot"]],
  ["er-boss-1041530800", ["Death Blight"]],
  ["er-boss-12030850", ["Death Blight"]],
]);

const statusTerms: Record<string, string[]> = {
  "Scarlet Rot": ["scarlet rot", "cures rot"],
  Poison: ["poison buildup", "cures poison"],
  Frostbite: ["frost buildup", "cures frostbite"],
  Madness: ["madness buildup"],
  Sleep: ["sleep buildup"],
  "Death Blight": ["death blight buildup", "deathblight buildup"],
};

const statKey: Record<string, keyof BuildStats> = {
  Vig: "vig", Mind: "mind", End: "end", Str: "str", Dex: "dex", Int: "int", Fai: "fai", Arc: "arc",
};

const meetsRequirements = (item: ErItem, stats: BuildStats): boolean => {
  const requirements = item.stats.requirements;
  if (!requirements || typeof requirements !== "object") return true;
  return Object.entries(requirements).every(([key, value]) => {
    const buildKey = statKey[key];
    return buildKey != null && stats[buildKey] >= Number(value);
  });
};

const countersStatus = (item: ErItem, status: string): boolean => {
  const english = erItemEnglishTextByKey(erItemKey(item));
  if (!english) return false;
  const description = english.description.toLowerCase();
  const mentionsStatus = (statusTerms[status] ?? []).some((term) => description.includes(term));
  return mentionsStatus && (description.includes("alleviates") || description.includes("cures"));
};

export const recommendBossCounters = ({
  markerId,
  attackProfile,
  stats,
  access,
  reservedItems = [],
}: {
  markerId: string;
  attackProfile?: BossAttackProfile;
  stats: BuildStats;
  access: ItemAccessResolver;
  reservedItems?: RecommendedItem[];
}): RecommendedItem[] => {
  const statuses = [
    ...(attackProfile?.status.map((entry) => entry.type) ?? []),
    ...(STATUS_OVERRIDES_BY_MARKER.get(markerId) ?? []),
  ].filter((status, index, all) => COUNTERABLE_STATUS.has(status) && all.indexOf(status) === index);
  const reservedKeys = new Set(reservedItems.map(({ item }) => erItemKey(item)));
  const results = [...reservedItems];

  for (const status of statuses) {
    const candidates = erItems
      .filter((item) => ["consumable", "incantation"].includes(item.category))
      .filter((item) => !reservedKeys.has(erItemKey(item)) && meetsRequirements(item, stats))
      .filter((item) => countersStatus(item, status))
      .map((item) => ({ item, access: access(item) }))
      .filter((entry) => entry.access.available)
      .sort((a, b) => {
        const aConsumable = a.item.category === "consumable" ? 1 : 0;
        const bConsumable = b.item.category === "consumable" ? 1 : 0;
        return bConsumable - aConsumable || a.access.effort - b.access.effort;
      });
    const best = candidates[0];
    if (!best) continue;
    reservedKeys.add(erItemKey(best.item));
    results.push({ item: best.item, reason: "fightPreparation" });
    if (results.length === 2) break;
  }

  return results.slice(0, 2);
};
