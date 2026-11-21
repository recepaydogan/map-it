import type { IntelStat } from "./intelligence-types";

export function sumStats(groups: IntelStat[][]): IntelStat[] {
  const totals = new Map<string, IntelStat>();
  for (const stats of groups) for (const stat of stats) {
    const previous = totals.get(stat.key);
    totals.set(stat.key, { ...stat, value: (previous?.value ?? 0) + stat.value });
  }
  return [...totals.values()];
}
