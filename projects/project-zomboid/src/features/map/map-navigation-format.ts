export const NAVIGATION_EDGE_OPEN = 0;
export const NAVIGATION_EDGE_DOOR = 1;
export const NAVIGATION_EDGE_CLIMB = 2;
export const NAVIGATION_EDGE_BLOCKED = 3;

export const NAVIGATION_NORTH_SHIFT = 0;
export const NAVIGATION_WEST_SHIFT = 2;
export const NAVIGATION_EDGE_MASK = 0b11;
export const NAVIGATION_SQUARE_BLOCKED = 1 << 4;
export const NAVIGATION_SQUARE_SLOW = 1 << 5;

export interface MapNavigationManifest {
  schemaVersion: 1;
  cellSize: number;
  regionSize: number;
  encoding: "gzip-cell-region-grid-v1";
  coarse: {
    path: string;
    scale: number;
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  regions: {
    x: number;
    y: number;
    path: string;
    cells: [x: number, y: number, offset: number, length: number][];
  }[];
  costs: {
    cardinal: number;
    diagonal: number;
    door: number;
    climb: number;
    slowTerrain: number;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseMapNavigationManifest = (value: unknown): MapNavigationManifest => {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.cellSize !== "number"
    || value.cellSize <= 0
    || typeof value.regionSize !== "number"
    || !Number.isInteger(value.regionSize)
    || value.regionSize <= 0
    || value.encoding !== "gzip-cell-region-grid-v1"
    || !isRecord(value.coarse)
    || !Array.isArray(value.regions)
    || !isRecord(value.costs)) {
    throw new Error("Map navigation manifest is invalid.");
  }
  const regions: MapNavigationManifest["regions"] = [];
  for (const region of value.regions) {
    if (!isRecord(region)
      || !Number.isInteger(region.x)
      || !Number.isInteger(region.y)
      || typeof region.path !== "string"
      || !Array.isArray(region.cells)) throw new Error("Map navigation regions are invalid.");
    const cells: MapNavigationManifest["regions"][number]["cells"] = [];
    for (const cell of region.cells) {
      if (!Array.isArray(cell)
        || cell.length !== 4
        || !cell.every((part) => Number.isInteger(part))
        || Number(cell[2]) < 0
        || Number(cell[3]) <= 0) throw new Error("Map navigation cells are invalid.");
      cells.push([Number(cell[0]), Number(cell[1]), Number(cell[2]), Number(cell[3])]);
    }
    regions.push({ x: Number(region.x), y: Number(region.y), path: region.path, cells });
  }
  const coarse = value.coarse;
  if (typeof coarse.path !== "string"
    || typeof coarse.scale !== "number"
    || !Number.isInteger(coarse.scale)
    || coarse.scale <= 1
    || typeof coarse.minX !== "number"
    || typeof coarse.minY !== "number"
    || typeof coarse.width !== "number"
    || !Number.isInteger(coarse.width)
    || coarse.width <= 0
    || typeof coarse.height !== "number"
    || !Number.isInteger(coarse.height)
    || coarse.height <= 0) {
    throw new Error("Map coarse navigation manifest is invalid.");
  }
  const costs = value.costs;
  for (const key of ["cardinal", "diagonal", "door", "climb", "slowTerrain"] as const) {
    if (typeof costs[key] !== "number" || costs[key] < 0) {
      throw new Error(`Map navigation cost ${key} is invalid.`);
    }
  }
  return {
    schemaVersion: 1,
    cellSize: value.cellSize,
    regionSize: value.regionSize,
    encoding: value.encoding,
    coarse: {
      path: coarse.path,
      scale: coarse.scale,
      minX: coarse.minX,
      minY: coarse.minY,
      width: coarse.width,
      height: coarse.height,
    },
    regions,
    costs: {
      cardinal: Number(costs.cardinal),
      diagonal: Number(costs.diagonal),
      door: Number(costs.door),
      climb: Number(costs.climb),
      slowTerrain: Number(costs.slowTerrain),
    },
  };
};

export const getNavigationEdge = (value: number, shift: number) =>
  (value >> shift) & NAVIGATION_EDGE_MASK;
