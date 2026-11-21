import { MAP_DATA_BASE_URL } from "./map-data-url.ts";
export const REMOVED_MAP_CATEGORY_IDS = new Set<string>();
export interface MapDefinition {
  id: string; name: string; nameKey?: string; dataUrl: string; locationFiles?: string[];
}
/** Replace the empty workspace with verified game maps using the same data contract. */
export const MAP_DEFINITIONS: MapDefinition[] = [{
  id: "workspace", name: "Map workspace", nameKey: "map.maps.names.workspace",
  dataUrl: `${MAP_DATA_BASE_URL}/workspace`, locationFiles: [],
}];
export const MAP_BUNDLED_ASSET_DIRS = ["workspace", "category-icons"];
export const DEFAULT_MAP_ID = MAP_DEFINITIONS[0]!.id;
export const TRACKING_REGION_MAPS: Readonly<Record<string, { id: string; width: number; height: number }>> = {};
export const MAP_ITEM_PICKUP_SOURCES: Record<string, { mapId: string; locationFile: string; category: string }> = {};
export const resolveMapId = (id: string): string => id;
export const hasMapDefinition = (id: string): boolean => MAP_DEFINITIONS.some(definition => definition.id === resolveMapId(id));
export const getMapDefinition = (id: string | null | undefined): MapDefinition =>
  MAP_DEFINITIONS.find(definition => definition.id === (id ? resolveMapId(id) : id)) ?? MAP_DEFINITIONS[0]!;
