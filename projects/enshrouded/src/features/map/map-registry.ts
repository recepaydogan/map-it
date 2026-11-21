import { MAP_DATA_BASE_URL } from "./map-data-url.ts";

export const REMOVED_MAP_CATEGORY_IDS = new Set<string>();

export interface MapDefinition {
  id: string;
  name: string;
  nameKey?: string;
  dataUrl: string;
  locationFiles?: string[];
}

/** Add Enshrouded maps and marker layers here as verified content becomes available. */
export const MAP_DEFINITIONS: MapDefinition[] = [
  { id: "enshrouded", name: "Enshrouded", dataUrl: `${MAP_DATA_BASE_URL}/enshrouded`,
    locationFiles: ["bestiary-locations.json"] },
];

export const MAP_BUNDLED_ASSET_DIRS = ["enshrouded"] as const;
export const DEFAULT_MAP_ID = MAP_DEFINITIONS[0]!.id;
export const MAP_ITEM_PICKUP_SOURCES: Record<string, { mapId: string; locationFile: string; category: string }> = {};
export const hasMapDefinition = (id: string): boolean =>
  MAP_DEFINITIONS.some((definition) => definition.id === id);
export const getMapDefinition = (id: string | null | undefined): MapDefinition =>
  MAP_DEFINITIONS.find((definition) => definition.id === id) ?? MAP_DEFINITIONS[0]!;
