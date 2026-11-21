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

export const MAP_SOURCE = { steamAppId: 4262460, buildId: 26726105 } as const;

export const MAP_DEFINITIONS: MapDefinition[] = [
  { id: "looty-bay", name: "Looty Bay", nameKey: "robRun.maps.lootyBay", dataUrl: MAP_DATA_BASE_URL + "/looty-bay",
    locationFiles: ["codex-locations.json"],
    minimapInitialCenter: { x: 2048, y: 2048 } },
  { id: "prison", name: "Prison", nameKey: "robRun.maps.prison", dataUrl: MAP_DATA_BASE_URL + "/prison",
    locationFiles: ["codex-locations.json"] },
  { id: "lennys-motel", name: "Lenny's Motel", nameKey: "robRun.maps.lennysMotel", dataUrl: MAP_DATA_BASE_URL + "/lennys-motel",
    locationFiles: ["codex-locations.json"] },
  { id: "sales-center", name: "Sales Center", nameKey: "robRun.maps.salesCenter", dataUrl: MAP_DATA_BASE_URL + "/sales-center",
    locationFiles: ["codex-locations.json"] },
  { id: "settlement", name: "Settlement", nameKey: "robRun.maps.settlement", dataUrl: MAP_DATA_BASE_URL + "/settlement",
    locationFiles: ["codex-locations.json"] },
  { id: "settlement-2", name: "Settlement II", nameKey: "robRun.maps.settlementTwo", dataUrl: MAP_DATA_BASE_URL + "/settlement-2" },
  { id: "world", name: "World Map", nameKey: "robRun.maps.world", dataUrl: MAP_DATA_BASE_URL + "/world",
    locationFiles: ["codex-locations.json"] },
];

export const MAP_BUNDLED_ASSET_DIRS = MAP_DEFINITIONS.map(({ id }) => id);
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
