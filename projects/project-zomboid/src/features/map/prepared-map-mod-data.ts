import type {
  MapCraftingData,
  MapForagingData,
  MapItemCatalogEntry,
  MapLocation,
  MapLootIndexEntry,
  MapLootProfile,
  MapMetadata,
  MapSpawnData,
  MapTown,
  MapVehicleSpawnData,
} from "./types";
import { cleanMapDisplayName } from "./map-display-name";

export interface PreparedMapModData {
  schemaVersion: 1;
  generatedAt: string;
  towns: MapTown[];
  locations: MapLocation[];
  items: MapItemCatalogEntry[];
  crafting: MapCraftingData;
  lootIndex: MapLootIndexEntry[];
  lootProfiles: Record<string, MapLootProfile>;
  foraging?: MapForagingData;
  vehicleSpawns?: MapVehicleSpawnData;
  spawnPoints?: MapSpawnData;
  statistics: Record<string, number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireArray = (value: unknown, label: string) => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
};

export const parsePreparedMapModData = (value: unknown): PreparedMapModData => {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Prepared map mod data format is not supported.");
  }
  if (!isRecord(value.lootProfiles) || !isRecord(value.statistics)) {
    throw new Error("Prepared map mod loot profiles or statistics are invalid.");
  }
  if (!isRecord(value.crafting)) throw new Error("Prepared map mod crafting data is invalid.");
  return {
    schemaVersion: 1,
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "",
    towns: (requireArray(value.towns, "Prepared map mod towns") as MapTown[])
      .map((town) => ({ ...town, name: cleanMapDisplayName(town.name) })),
    locations: (requireArray(value.locations, "Prepared map mod locations") as MapLocation[])
      .map((location) => ({
        ...location,
        name: cleanMapDisplayName(location.name),
        town: cleanMapDisplayName(location.town),
      })),
    items: requireArray(value.items, "Prepared map mod items") as MapItemCatalogEntry[],
    crafting: value.crafting as unknown as MapCraftingData,
    lootIndex: requireArray(value.lootIndex, "Prepared map mod loot index") as MapLootIndexEntry[],
    lootProfiles: value.lootProfiles as Record<string, MapLootProfile>,
    foraging: isRecord(value.foraging) ? value.foraging as unknown as MapForagingData : undefined,
    vehicleSpawns: isRecord(value.vehicleSpawns) ? value.vehicleSpawns as unknown as MapVehicleSpawnData : undefined,
    spawnPoints: isRecord(value.spawnPoints)
      ? {
        ...(value.spawnPoints as unknown as MapSpawnData),
        points: (value.spawnPoints as unknown as MapSpawnData).points.map((point) => ({
          ...point,
          town: cleanMapDisplayName(point.town),
        })),
      }
      : undefined,
    statistics: value.statistics as Record<string, number>,
  };
};

const mergeCrafting = (base: MapCraftingData | undefined, mod: MapCraftingData) => {
  const recipes = [...new Map([...(base?.recipes ?? []), ...mod.recipes].map((recipe) => [recipe.id, recipe])).values()];
  return {
    recipes,
    totalRecipes: recipes.length,
    craftRecipes: recipes.filter(({ kind }) => kind === "craft").length,
    evolvedRecipes: recipes.filter(({ kind }) => kind === "evolved").length,
    recipesWithConcreteOutputs: recipes.filter(({ outputs }) => outputs.length > 0).length,
    outputItems: new Set(recipes.flatMap(({ outputs }) => outputs.map(({ itemId }) => itemId))).size,
  };
};

const getModBounds = (affectedCells: string[], cellSize: number) => {
  const cells = affectedCells.map((cell) => cell.split(",").map(Number))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (cells.length === 0) throw new Error("Prepared map mod does not declare any cells.");
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return {
    minX: Math.min(...xs) * cellSize,
    minY: Math.min(...ys) * cellSize,
    maxX: (Math.max(...xs) + 1) * cellSize,
    maxY: (Math.max(...ys) + 1) * cellSize,
  };
};

const createAffectedCellLookup = (affectedCells: string[], cellSize: number) => {
  const cells = new Set(affectedCells);
  return (point: { x: number; y: number }) => cells.has(
    `${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)}`,
  );
};

export const createPreparedMapModMetadata = (
  base: MapMetadata,
  mod: PreparedMapModData,
  affectedCells: string[],
  cellSize = 256,
): MapMetadata => {
  const modBounds = getModBounds(affectedCells, cellSize);
  const isInsideAffectedCell = createAffectedCellLookup(affectedCells, cellSize);
  const items = [...new Map([...(base.items ?? []), ...mod.items].map((item) => [item.id, item])).values()];
  const towns = [
    ...base.towns.filter((town) => !isInsideAffectedCell(town)),
    ...mod.towns,
  ];
  const locations = [
    ...base.locations.filter((location) => !isInsideAffectedCell(location)),
    ...mod.locations,
  ];
  const lootIndex = [...new Map([
    ...(base.lootIndex ?? []),
    ...mod.lootIndex,
  ].map((entry) => [entry.id, entry])).values()];
  return {
    ...base,
    bounds: {
      minX: Math.min(base.bounds.minX, modBounds.minX),
      minY: Math.min(base.bounds.minY, modBounds.minY),
      maxX: Math.max(base.bounds.maxX, modBounds.maxX),
      maxY: Math.max(base.bounds.maxY, modBounds.maxY),
    },
    towns,
    locations,
    items,
    crafting: mergeCrafting(base.crafting, mod.crafting),
    lootProfiles: { ...(base.lootProfiles ?? {}), ...mod.lootProfiles },
    lootIndex,
    foraging: mod.foraging ?? base.foraging,
    vehicleSpawns: mod.vehicleSpawns ?? base.vehicleSpawns,
    spawnPoints: mod.spawnPoints ?? base.spawnPoints,
    statistics: {
      ...base.statistics,
      ...mod.statistics,
      towns: towns.length,
      searchableLocations: locations.length,
    },
  };
};
