import type { CategoryDef } from "../../data/types";
import type { BossRewardFilters, RawErMapMarker } from "./types";

export const erMapRewardPresentation = (
  marker: RawErMapMarker,
  active: Set<string>,
  rewards: BossRewardFilters | undefined,
  categories: Map<string, CategoryDef>,
  art: Map<string, string>,
  itemNames?: Map<string, { name: string }>,
): { iconUrl?: string; labels: string[] } => {
  if (marker.custom) return { labels: [] };
  const reward = rewards?.[marker.id];
  if (!reward) return { iconUrl: undefined, labels: [] };
  const bakedItemNames = new Map(
    (marker.drops ?? []).flatMap((drop) => drop.itemKey ? [[drop.itemKey, drop.name]] : []),
  );
  const matches = reward.rewards.flatMap((key) => {
    const category = categories.get(key);
    const iconUrl = art.get(key);
    if (!active.has(key) || !category || !iconUrl) return [];
    const names = (reward.rewardItems?.[key] ?? [])
      .map((itemKey) => itemNames?.get(itemKey)?.name ?? bakedItemNames.get(itemKey))
      .filter((name): name is string => !!name);
    return [{
      category: key,
      label: names.length ? [...new Set(names)].join(", ") : category.label,
      color: category.color,
      iconUrl,
    }];
  });
  return {
    iconUrl: !active.has(marker.category) && matches.length === 1 ? matches[0].iconUrl : undefined,
    labels: matches.map((match) => match.label),
  };
};
