export interface MapTown {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface MapLocation {
  id: string;
  name: string;
  category: string;
  label: string;
  subtype: string;
  lootProfileId?: string;
  lootProfileIds?: string[];
  buildingType?: string;
  roomTypes?: string[];
  floors?: number[];
  roomCount?: number;
  bounds?: [minX: number, minY: number, maxX: number, maxY: number];
  townId: string;
  town: string;
  x: number;
  y: number;
}

export interface MapLootItem {
  id: string;
  name?: string;
  /** Relative likelihood inside this profile, normalized to 1-100. */
  weight: number;
}

export interface MapItemCatalogEntry {
  id: string;
  name: string;
  lootable: boolean;
  tags?: string[];
}

export interface MapLootIndexEntry {
  id: string;
  bestWeight: number;
  locationCount: number;
  profileIds: string[];
}

export interface MapCraftIngredient {
  kind: "item" | "tag" | "fluid";
  options: string[];
  amount: number;
  amountMax?: number;
  consumed: boolean;
}

export interface MapCraftOutput {
  itemId: string;
  amount: number;
  amountMax?: number;
}

export interface MapCraftSkill {
  id: string;
  level: number;
}

export interface MapCraftRecipe {
  id: string;
  kind: "craft" | "evolved";
  recipeId: string;
  name: string;
  category: string;
  inputs: MapCraftIngredient[];
  outputs: MapCraftOutput[];
  skills: MapCraftSkill[];
  requiresLearning: boolean;
  dynamicIngredients: boolean;
}

export interface MapCraftingData {
  recipes: MapCraftRecipe[];
  totalRecipes: number;
  craftRecipes: number;
  evolvedRecipes: number;
  recipesWithConcreteOutputs: number;
  outputItems: number;
}

export interface MapLootProfile {
  id: string;
  items: MapLootItem[];
  matchedDistributions: number;
}

export type MapForagingZoneKind =
  | "Nav"
  | "TownZone"
  | "TrailerPark"
  | "FarmLand"
  | "Farm"
  | "Vegitation"
  | "Forest"
  | "DeepForest";

export type MapForagingZoneRect = [x: number, y: number, width: number, height: number];

export interface MapForagingZoneDefinition {
  densityMin: number;
  densityMax: number;
  refillPercent: number;
}

export interface MapForagingData {
  definitions: Record<MapForagingZoneKind, MapForagingZoneDefinition>;
  zones: Record<MapForagingZoneKind, MapForagingZoneRect[]>;
  totalZones: number;
}

export type MapVehicleSpawnCategory =
  | "standard"
  | "performance"
  | "emergency"
  | "service"
  | "rural"
  | "wreck"
  | "traffic";

export interface MapVehicleSpawnModel {
  id: string;
  name: string;
  spawnChance: number;
}

export interface MapVehicleSpawnDefinition {
  id: string;
  label: string;
  category: MapVehicleSpawnCategory;
  vehicles: MapVehicleSpawnModel[];
  baseVehicleQuality?: number;
  spawnRate?: number;
  chanceToSpawnBurnt?: number;
  chanceToPartDamage?: number;
  chanceToSpawnKey?: number;
}

export type MapVehicleSpawnZone = [
  definitionIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
];

export interface MapVehicleSpawnData {
  definitions: MapVehicleSpawnDefinition[];
  zones: MapVehicleSpawnZone[];
  totalZones: number;
}

export interface MapSpawnPoint {
  id: string;
  townId: string;
  town: string;
  x: number;
  y: number;
  z: number;
  professions: string[];
}

export interface MapSpawnProfession {
  id: string;
  label: string;
  pointCount: number;
}

export interface MapSpawnData {
  points: MapSpawnPoint[];
  professions: MapSpawnProfession[];
  totalPoints: number;
  totalTowns: number;
}

export type UserMarkerColor = "sage" | "amber" | "red" | "blue" | "violet";
export type UserMarkerIcon = "pin" | "home" | "flag" | "vehicle" | "supplies" | "danger";
export const USER_MARKER_GROUP_IDS = ["general", "safehouses", "my-position", "loot", "vehicles", "danger"] as const;
export type UserMarkerGroup = typeof USER_MARKER_GROUP_IDS[number];
export type UserMarkerStyleChange = Partial<Pick<UserMapMarker, "color" | "icon" | "imageCategory">>;

export interface UserMapMarker {
  id: string;
  name: string;
  category: "custom";
  label: string;
  subtype: "custom";
  townId: string;
  town: string;
  x: number;
  y: number;
  floors?: number[];
  color?: UserMarkerColor;
  icon?: UserMarkerIcon;
  imageCategory?: string;
  group?: UserMarkerGroup;
  mapId?: string;
}

export type MapPoint = MapLocation | UserMapMarker;

export const isUserMapMarker = (point: MapPoint): point is UserMapMarker =>
  point.category === "custom" && point.subtype === "custom" && point.townId === "personal";

export interface MapMetadata {
  id: string;
  displayName: string;
  description?: string;
  schemaVersion: number;
  gameBuild: string;
  generatedAt: string;
  source: string;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  tileSize: number;
  detailLevels: number[];
  towns: MapTown[];
  locations: MapLocation[];
  items?: MapItemCatalogEntry[];
  lootIndex?: MapLootIndexEntry[];
  crafting?: MapCraftingData;
  lootProfiles?: Record<string, MapLootProfile>;
  globalLootProfileId?: string;
  foraging?: MapForagingData;
  vehicleSpawns?: MapVehicleSpawnData;
  spawnPoints?: MapSpawnData;
  statistics: {
    towns: number;
    searchableLocations: number;
  };
  attribution?: string;
  creator?: string;
  navigationBaseUrls?: string[];
  tileSource: MapTileSource;
}

export type MapTileSource =
  | {
      kind: "static";
      basePath: string;
      tilePattern: string;
    }
  | {
      kind: "community";
      packageKey: string;
      tilePattern: string;
    };

export interface MapView {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface MapCoordinate {
  x: number;
  y: number;
}

export interface MapRouteWaypoint extends MapCoordinate {
  id: string;
  label?: string;
}

export interface SavedMapRoute {
  id: string;
  mapId: string;
  name?: string;
  points: MapRouteWaypoint[];
  source?: "loot-run";
  lootRunId?: string;
  updatedAt: string;
}

export interface SavedLootRunItem {
  id: string;
  name: string;
}

export interface SavedLootRun {
  id: string;
  mapId: string;
  itemId: string;
  itemName: string;
  items: SavedLootRunItem[];
  locationIds: string[];
  completedLocationIds: string[];
  createdAt: string;
  updatedAt: string;
}
