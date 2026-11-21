import { MAP_DATA_BASE_URL } from "./map-data-url.ts";
import leonidaSunsetUrl from "./assets/leonida-sunset.webp";
import type { MapMetadata } from "./types";

export const LEONIDA_MAP_ARTWORK = leonidaSunsetUrl;
export const REMOVED_MAP_CATEGORY_IDS = new Set<string>();
export interface MapBackdrop {
  imageUrl: string;
  mapBounds: MapMetadata["bounds"];
}
export interface MapDefinition {
  id: string; name: string; nameKey?: string; dataUrl: string; locationFiles?: string[];
  defaultTerrainStyleId?: string;
  backdrop?: MapBackdrop;
}
/** Bundled Leonida map and its complete tile pyramid. */
export const MAP_DEFINITIONS: MapDefinition[] = [{
  id: "leonida", name: "Leonida", nameKey: "map.maps.names.leonida",
  dataUrl: `${MAP_DATA_BASE_URL}/leonida`, locationFiles: [],
  defaultTerrainStyleId: "day",
  backdrop: {
    imageUrl: LEONIDA_MAP_ARTWORK,
    mapBounds: { minX: -12000, minY: -9700, maxX: 4850, maxY: 8850 },
  },
}];
export const MAP_BUNDLED_ASSET_DIRS = ["leonida", "category-icons"];
export const DEFAULT_MAP_ID = MAP_DEFINITIONS[0]!.id;
export const TRACKING_REGION_MAPS: Readonly<Record<string, { id: string; width: number; height: number }>> = {};
export const MAP_ITEM_PICKUP_SOURCES: Record<string, { mapId: string; locationFile: string; category: string }> = {};
export const resolveMapId = (id: string): string => id;
export const hasMapDefinition = (id: string): boolean => MAP_DEFINITIONS.some(definition => definition.id === resolveMapId(id));
export const getMapDefinition = (id: string | null | undefined): MapDefinition =>
  MAP_DEFINITIONS.find(definition => definition.id === (id ? resolveMapId(id) : id)) ?? MAP_DEFINITIONS[0]!;
