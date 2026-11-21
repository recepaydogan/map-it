import type { ExpeditionRecord } from "./expedition-store";
import { mapToWorld } from "./live-state";
import type { MarkerCategory, PeakDailyLevel } from "./map-data";

export const EXPEDITION_REACH_CATEGORIES = [
  "campfire",
  "scout",
  "luggage",
  "secret",
  "guidebook",
] as const satisfies readonly MarkerCategory[];

export type ExpeditionReachCategory = (typeof EXPEDITION_REACH_CATEGORIES)[number];
export type ReachedLevelMarker = PeakDailyLevel["markers"][number];

const REACH_CONFIG: Record<
  ExpeditionReachCategory,
  { radius: number; vertical: number }
> = {
  campfire: { radius: 25, vertical: 25 },
  scout: { radius: 25, vertical: 25 },
  luggage: { radius: 15, vertical: 25 },
  secret: { radius: 25, vertical: 25 },
  guidebook: { radius: 18, vertical: 20 },
};

export const reachedMarkersOf = (
  level: PeakDailyLevel | null,
  record: ExpeditionRecord,
  category: ExpeditionReachCategory,
): ReachedLevelMarker[] => {
  if (!level) return [];
  const config = REACH_CONFIG[category];

  return level.markers.filter((marker) => {
    if (marker.category !== category) return false;
    const world = mapToWorld(level.projection, marker.map.x, marker.map.y);
    return record.samples.some((sample) => {
      if (Math.abs(sample[2] - marker.elevation) > config.vertical) return false;
      return (sample[1] - world.x) ** 2 + (sample[3] - world.z) ** 2 <= config.radius ** 2;
    });
  });
};

export const reachedCountOf = (
  level: PeakDailyLevel | null,
  record: ExpeditionRecord,
  category: ExpeditionReachCategory,
): { reached: number; total: number } => ({
  reached: reachedMarkersOf(level, record, category).length,
  total: level?.markers.filter((marker) => marker.category === category).length ?? 0,
});
