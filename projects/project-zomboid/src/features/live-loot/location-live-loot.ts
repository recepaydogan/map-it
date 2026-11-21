import type { MapItemCatalogEntry, MapLocation } from "../map/types";
import type { LiveLootSnapshot, LocationLiveLoot } from "./live-loot-types";

const DEFAULT_LOCATION_RADIUS = 5;

const displayNameFromItemId = (itemId: string) => {
  const shortId = itemId.split(".").at(-1) ?? itemId;
  return shortId.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
};

export const getLocationLiveLoot = (
  snapshot: LiveLootSnapshot | null,
  location: MapLocation,
  catalog: MapItemCatalogEntry[] | undefined,
): LocationLiveLoot | null => {
  if (!snapshot) return null;

  const [minX, minY, maxX, maxY] = location.bounds ?? [
    location.x - DEFAULT_LOCATION_RADIUS,
    location.y - DEFAULT_LOCATION_RADIUS,
    location.x + DEFAULT_LOCATION_RADIUS,
    location.y + DEFAULT_LOCATION_RADIUS,
  ];
  const floorSet = location.floors?.length ? new Set(location.floors) : null;
  const containers = snapshot.containers.filter((container) =>
    container.x >= minX
    && container.x <= maxX
    && container.y >= minY
    && container.y <= maxY
    && (!floorSet || floorSet.has(container.z)));
  if (containers.length === 0) return null;

  const names = new Map(catalog?.map((item) => [item.id, item.name]) ?? []);
  const counts = new Map<string, number>();
  for (const container of containers) {
    for (const item of container.items) {
      counts.set(item.id, (counts.get(item.id) ?? 0) + item.count);
    }
  }

  const items = [...counts.entries()]
    .map(([id, count]) => ({ id, count, name: names.get(id) ?? displayNameFromItemId(id) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { containerCount: containers.length, items };
};
