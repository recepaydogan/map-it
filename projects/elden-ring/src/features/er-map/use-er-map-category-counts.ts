import { useMemo } from "react";
import { addBossRewardCounts } from "./er-map-reward-filters";
import type { BossRewardFilters, RawErMapMarker } from "./types";

interface CategoryCountOptions {
  layerMarkers: RawErMapMarker[];
  viewCounts?: Record<string, number>;
  viewKey?: string;
  bossRewardFilters?: BossRewardFilters;
  foundMarkers: Set<string>;
  foundMeta: Record<string, string>;
  rememberFound: (entries: Record<string, string>) => void;
}

export const useErMapCategoryCounts = ({
  layerMarkers, viewCounts, viewKey, bossRewardFilters, foundMarkers, foundMeta, rememberFound,
}: CategoryCountOptions) => {
  const categoryCounts = useMemo(() => {
    const counts = new Map(viewCounts ? Object.entries(viewCounts) : []);
    for (const marker of layerMarkers) {
      if (viewCounts && !marker.custom) continue;
      counts.set(marker.category, (counts.get(marker.category) ?? 0) + 1);
    }
    return addBossRewardCounts(counts, bossRewardFilters);
  }, [layerMarkers, viewCounts, bossRewardFilters]);

  /**
   * What is ticked off in each category that is currently LOADED — exact, and
   * present even at zero, which is the honest "0 / 365" everyone starts from.
   * Also notes where each ticked-off marker lives, so the count outlives the
   * category being switched off (see doneCounts).
   */
  const loadedDone = useMemo(() => {
    const counts = new Map<string, number>();
    const learned: Record<string, string> = {};
    for (const marker of layerMarkers) {
      const done = foundMarkers.has(marker.id);
      counts.set(marker.category, (counts.get(marker.category) ?? 0) + (done ? 1 : 0));
      if (done && viewKey) learned[marker.id] = `${viewKey}|${marker.category}`;
    }
    return { counts, learned };
  }, [layerMarkers, foundMarkers, viewKey]);

  // Teach the tracking store what this render just learned. Render-phase state
  // adjustment (the same pattern as er-map's performance nudge): it converges
  // on the next render because everything it wrote is then already known.
  const unlearned = Object.keys(loadedDone.learned).filter(
    (id) => foundMeta[id] !== loadedDone.learned[id],
  );
  if (unlearned.length > 0) {
    rememberFound(Object.fromEntries(unlearned.map((id) => [id, loadedDone.learned[id]])));
  }

  /**
   * The rail's numerator. Loaded categories answer for themselves; a category
   * that is switched OFF — and therefore never streamed — is answered from what
   * we recorded while it WAS loaded, which is what keeps "1 / 17" reading 1
   * after you hide it.
   *
   * A category with no loaded markers and nothing recorded gets no entry at
   * all, and the rail shows the plain total: "unknown" is not the same as zero,
   * and printing "0 / 17" over progress we simply cannot see would be a lie.
   */
  const doneCounts = useMemo(() => {
    const counts = new Map(loadedDone.counts);
    if (!viewKey) return addBossRewardCounts(counts, bossRewardFilters, foundMarkers);
    const remembered = new Map<string, number>();
    for (const [id, meta] of Object.entries(foundMeta)) {
      if (!foundMarkers.has(id)) continue;
      const split = meta.indexOf("|");
      if (split < 0 || meta.slice(0, split) !== viewKey) continue;
      const category = meta.slice(split + 1);
      // Loaded categories are counted from the markers themselves, which is
      // always the newer truth.
      if (counts.has(category)) continue;
      remembered.set(category, (remembered.get(category) ?? 0) + 1);
    }
    for (const [category, count] of remembered) counts.set(category, count);
    return addBossRewardCounts(counts, bossRewardFilters, foundMarkers);
  }, [loadedDone.counts, foundMeta, foundMarkers, viewKey, bossRewardFilters]);

  return { categoryCounts, doneCounts };
};
