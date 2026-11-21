import type { CollectibleLevel, CollectiblePoint, CollectibleRegion, CollectibleStat } from "./collectible-progression-types";
import type { ReferenceLink } from "./reference-types";

export const isCollectibleCompleted = (point: CollectiblePoint, completed: ReadonlySet<string>) =>
  completed.has(point.id) || point.aliases.some((id) => completed.has(id));

export const collectibleProgress = (regions: CollectibleRegion[], completedIds: string[]) => {
  const completed = new Set(completedIds);
  const points = regions.flatMap((region) => region.points);
  return { total: points.length, found: points.filter((point) => isCollectibleCompleted(point, completed)).length };
};

export const collectibleRewards = (levels: CollectibleLevel[], level: number | "all") => {
  const items = new Map<string, ReferenceLink>();
  const stats = new Map<string, CollectibleStat>();
  for (const row of levels.filter((row) => level === "all" || row.level === level)) {
    for (const item of row.items) {
      const existing = items.get(item.id);
      items.set(item.id, { ...item, quantity: (existing?.quantity ?? 0) + (item.quantity ?? 0) });
    }
    for (const stat of row.stats) {
      const existing = stats.get(stat.id);
      stats.set(stat.id, { ...stat, value: stat.value === null || existing?.value === null ? null : (existing?.value ?? 0) + stat.value });
    }
  }
  return { items: [...items.values()], stats: [...stats.values()] };
};
