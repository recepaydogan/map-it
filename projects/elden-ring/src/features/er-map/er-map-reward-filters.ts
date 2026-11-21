import type { BossRewardFilters, ErMapViewDefinition, RawErMapMarker } from "./types";

export const matchesMarkerCategory = (
  marker: RawErMapMarker,
  active: Set<string>,
  rewards?: BossRewardFilters,
): boolean => active.has(marker.category) ||
  (!marker.custom && (rewards?.[marker.id]?.rewards.some((category) => active.has(category)) ?? false));

export const viewMarkerUrls = (
  view: ErMapViewDefinition,
  active: Set<string>,
  loadAll: boolean,
): string[] => {
  if (view.url) return [view.url];
  const categories = new Set(active);
  for (const entry of Object.values(view.bossRewardFilters ?? {})) {
    if (entry.rewards.some((category) => active.has(category))) categories.add(entry.category);
  }
  return [...new Set(Object.entries(view.chunks ?? {})
    .filter(([category]) => loadAll || categories.has(category))
    .map(([, url]) => url))];
};

/** The manifest covers unloaded boss chunks as well as those currently visible. */
export const addBossRewardCounts = (
  counts: Map<string, number>,
  rewards?: BossRewardFilters,
  found?: Set<string>,
): Map<string, number> => {
  const result = new Map(counts);
  for (const [id, entry] of Object.entries(rewards ?? {})) {
    for (const category of new Set(entry.rewards)) {
      result.set(category, (result.get(category) ?? 0) + (!found || found.has(id) ? 1 : 0));
    }
  }
  return result;
};
