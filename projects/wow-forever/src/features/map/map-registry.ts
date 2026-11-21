import { MAP_DATA_BASE_URL } from "./map-data-url.ts";
import { dungeonFloorId, dungeonMaps, type DungeonMap } from "./dungeon-maps.ts";

export const REMOVED_MAP_CATEGORY_IDS = new Set([
  "shop-sign", "repair-site", "signpost", "directional-signpost", "world-objective",
]);

export interface MapDefinition {
  id: string;
  name: string;
  nameKey?: string;
  dataUrl: string;
  locationFiles?: string[];
  /** Land-based starting point when the minimap has no player position. */
  minimapInitialCenter?: { x: number; y: number };
}

export interface DungeonFloorDefinition {
  id: string;
  name: string;
  dungeon: DungeonMap;
  floorIndex: number;
  minimapInitialCenter?: never;
}

export type SelectedMapDefinition = MapDefinition | DungeonFloorDefinition;

/** Client-file relationships verified for the current beta terrain atlas. */
export const MAP_SOURCE = {
  product: "wow_classic_beta",
  installDir: "C:/Program Files (x86)/World of Warcraft",
  atlasUiMapId: 947,
  atlasWidth: 32_768,
  atlasHeight: 21_845,
  adtWorldSize: 1600 / 3,
  continents: [
    { mapId: 1, wdtFileDataId: 782779, name: "Kalimdor" },
    { mapId: 0, wdtFileDataId: 775971, name: "Eastern Kingdoms" },
  ],
  atlasInsets: [
    // Visual placement on the overview; these are not in-game world coordinates.
    { id: "zephras-isle", mapId: 2991, labelKey: "map.zephrasIsle", wdtFileDataId: 7198644,
      originX: 14_200, originY: 1_800, scale: 0.95 },
  ],
} as const;

export const MAP_DEFINITIONS: MapDefinition[] = [
  { id: "azeroth", name: "Azeroth", dataUrl: `${MAP_DATA_BASE_URL}/world-atlas`,
    // The Crossroads in Kalimdor, from client-settlement-poi-35 in the atlas.
    minimapInitialCenter: { x: 8306.226128976601, y: 11157.902187897347 },
    locationFiles: ["locations-client.json", "locations-forever-hunter-pets.json", "locations-forever-vendors.json", "locations-settlements.json", "locations-flight.json", "locations-instances.json", "locations-points-of-interest.json", "locations-world-signposts.json", "locations-world-objectives.json", "locations-boats.json", "locations-transport-signs.json", "locations-mapgenie-transport.json", "locations-service-signs.json", "locations-banks.json", "locations-repair-sites.json", "locations-repair-vendors.json", "locations-profession-trainers.json", "locations-forever-all-new-trainers.json", "locations-forever-all-updates.json", "locations-class-trainers.json", "locations-mapgenie-community.json", "locations-mapgenie-supplements.json", "locations-thunder-bluff-signs.json", "locations-zephras-signs.json", "locations-wayfinding.json", "locations-gatherables.json", "locations-forever-all-gatherables.json", "locations-forever-all-new-gathering.json", "locations-books.json", "locations-forever-all-books.json", "locations-forever-all-rares.json", "locations-forever-all-quest-givers.json", "locations-forever-all-new-quest-givers.json", "locations-forever-all-quests.json"] },
  { id: "city-of-dalaran", name: "City of Dalaran", nameKey: "map.instanceCoverage.names.949849",
    dataUrl: `${MAP_DATA_BASE_URL}/wdt-6982267` },
];
/** Map folders kept in Vite output for preview and R2 planning; CDN OPKs remove them. */
export const MAP_BUNDLED_ASSET_DIRS = [
  "world-atlas", "wdt-782779", "wdt-775971", "wdt-7198644", "wdt-6982267",
  "client-artwork", "client-icons", "dungeons",
] as const;
export const DEFAULT_MAP_ID = MAP_DEFINITIONS[0]!.id;
export const MAP_ITEM_PICKUP_SOURCES: Record<string, { mapId: string; locationFile: string; category: string }> = {};
const dungeonFloorDefinitions = new Map<string, DungeonFloorDefinition>(dungeonMaps.flatMap((dungeon) =>
  dungeon.floors.map((_, floorIndex) => {
    const id = dungeonFloorId(dungeon.id, floorIndex);
    return [id, { id, name: dungeon.name, dungeon, floorIndex }];
  })));
export const hasMapDefinition = (id: string): boolean =>
  dungeonFloorDefinitions.has(id) || MAP_DEFINITIONS.some((definition) => definition.id === id);
export const getMapDefinition = (id: string | null | undefined): SelectedMapDefinition =>
  (id ? dungeonFloorDefinitions.get(id) : undefined)
  ?? MAP_DEFINITIONS.find((definition) => definition.id === id) ?? MAP_DEFINITIONS[0]!;
