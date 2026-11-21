import type { ItemAcquisitionSource } from "./item-database-types";

export interface GroupedItemSource {
  source: ItemAcquisitionSource;
  minLevel?: number;
  maxLevel?: number;
}

export const groupCraftingStations = (sources: ItemAcquisitionSource[]): GroupedItemSource[] => {
  const groups = new Map<string, ItemAcquisitionSource[]>();
  for (const source of sources) {
    const group = groups.get(source.name) ?? [];
    group.push(source);
    groups.set(source.name, group);
  }
  return [...groups.values()].map((group) => {
    const first = group[0];
    const sameLocation = group.every((source) =>
      source.mapId === first.mapId && source.markerId === first.markerId);
    return {
      source: {
        ...first,
        region: [...new Set(group.map((source) => source.region).filter(Boolean))].join(", "),
        mapId: sameLocation ? first.mapId : undefined,
        markerId: sameLocation ? first.markerId : undefined,
      },
    };
  });
};

export const groupItemDrops = (sources: ItemAcquisitionSource[]): GroupedItemSource[] => {
  const groups = new Map<string, GroupedItemSource>();
  for (const source of sources) {
    const key = JSON.stringify([
      source.kind, source.name, source.region, source.mapId, source.markerId,
    ]);
    const group = groups.get(key) ?? { source };
    if (source.level !== undefined) {
      group.minLevel = Math.min(group.minLevel ?? source.level, source.level);
      group.maxLevel = Math.max(group.maxLevel ?? source.level, source.level);
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    (a.source.kind === "boss-drop" ? 0 : 1) - (b.source.kind === "boss-drop" ? 0 : 1)
    || Number(Boolean(b.source.markerId)) - Number(Boolean(a.source.markerId))
    || a.source.name.localeCompare(b.source.name)
    || (a.source.region ?? "").localeCompare(b.source.region ?? ""));
};
