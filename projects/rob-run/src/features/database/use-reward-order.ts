import { useCallback } from "react";
import { ITEM_GRADE_ORDER } from "../../game-config";
import type { ItemCatalog } from "./item-database-types";
import { useItemCatalog } from "./use-item-catalog";
import { rewardDropChance, type ChanceReward } from "./reward-drop-chance";

const ranks = new WeakMap<ItemCatalog, Map<string, number>>();

/** Resolve by item ID so bound variants and identical names remain distinct. */
export function useRewardOrder() {
  const state = useItemCatalog();
  const catalog = state.status === "ready" ? state.catalog : undefined;
  return useCallback(<T extends ChanceReward & { id: string; grade?: string; category?: string }>(items: T[]): T[] => {
    let lookup = catalog ? ranks.get(catalog) : undefined;
    if (catalog && !lookup) {
      lookup = new Map(catalog.items.map((item) => [item.id, ITEM_GRADE_ORDER.findIndex((grade) => grade === item.grade)]));
      ranks.set(catalog, lookup);
    }
    const rank = (item: T) => !item.grade && item.category && item.category !== "items" ? -1
      : lookup?.get(item.id) ?? ITEM_GRADE_ORDER.findIndex((grade) => grade === item.grade);
    return items.map((item) => ({ item, chance: rewardDropChance(item) ?? Infinity }))
      .sort((a, b) => (a.chance === b.chance ? rank(b.item) - rank(a.item) : a.chance - b.chance))
      .map(({ item }) => item);
  }, [catalog]);
}
