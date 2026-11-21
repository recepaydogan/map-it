import { MAP_ITEM_PICKUP_SOURCES, getMapDefinition } from "../map/map-registry";
import type { ItemAcquisitionSource } from "./item-database-types";
import { COLLECTIBLE_PROGRESSION } from "../../game-config";
import { loadReferenceData } from "../reference/use-reference-data";
import type { CollectibleProgressionData } from "../reference/collectible-progression-types";

interface CollectableLayer {
  source: string;
  locations: { id: string; name: string; category: string; itemId?: string }[];
}

const sourcePromises = new Map<string, Promise<ItemAcquisitionSource | null>>();

export const loadCollectableItemSources = async (itemId: string): Promise<ItemAcquisitionSource[]> => {
  if (COLLECTIBLE_PROGRESSION.itemIds.includes(itemId)) {
    const data = await loadReferenceData<CollectibleProgressionData>("intelligence/collectible-progression.json");
    const collection = data.items[itemId];
    if (!collection) throw new Error(`Missing collectible progression for ${itemId}`);
    return collection.regions.map((region) => ({
      kind: "pickup", name: collection.item.name, region: region.name,
      mapId: region.mapId, markerId: region.points[0]!.id, markerCount: region.points.length,
      source: "collectible-progression.json",
    }));
  }
  const source = await loadCollectableItemSource(itemId);
  return source ? [source] : [];
};

export const loadCollectableItemSource = (itemId: string): Promise<ItemAcquisitionSource | null> => {
  const definition = MAP_ITEM_PICKUP_SOURCES[itemId];
  if (!definition) return Promise.resolve(null);
  const { mapId, locationFile, category } = definition;
  const cached = sourcePromises.get(itemId);
  if (cached) return cached;

  const map = getMapDefinition(mapId);
  const promise = fetch(`${map.dataUrl}/${locationFile}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Collectable layer: HTTP ${response.status} for ${mapId}`);
      const layer = await response.json() as CollectableLayer;
      if (!Array.isArray(layer.locations) || typeof layer.source !== "string") {
        throw new Error(`Collectable layer has an invalid format for ${mapId}`);
      }
      const markers = layer.locations.filter((point) => point.category === category && point.itemId === itemId);
      const first = markers[0];
      if (!first) throw new Error(`Collectable item ${itemId} has no map marker on ${mapId}`);
      return {
        kind: "pickup" as const,
        name: first.name,
        region: map.name,
        mapId,
        markerId: first.id,
        markerCount: markers.length,
        source: layer.source,
      };
    });
  sourcePromises.set(itemId, promise);
  return promise;
};
