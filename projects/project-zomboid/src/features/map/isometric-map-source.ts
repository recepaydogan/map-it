import type { MapIsometricCatalog, MapIsometricInfo, MapIsometricManifest } from "./map-isometric-types";
import { PROJECT_ZOMBOID_MAP_B42_GROUND_TILE_RANGES } from "./project-zomboid-map-b42-tile-ranges.ts";

interface ExternalIsometricMapOptions {
  basePath: string;
  generatedAt: string;
  id: string;
  payload: unknown;
}

export const PROJECT_ZOMBOID_MAP_B42_GENERATED_AT = "2026-08-08T06:44:39.000Z";

export const PROJECT_ZOMBOID_MAP_B42_METADATA = {
  w: 2_314_368,
  h: 1_019_040,
  cell_size: 256,
  minlayer: 0,
  maxlayer: 0,
  cell_rects: [[0, 18, 45, 45], [45, 3, 13, 60], [58, 0, 20, 63]],
  x0: 1_036_288,
  y0: -139_296,
  sqr: 128,
  git_commit: "6ceb95293e6a9247d17ed8873d3261ca8573fa65",
  tileRanges: PROJECT_ZOMBOID_MAP_B42_GROUND_TILE_RANGES,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireInteger = (value: unknown, label: string) => {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
  return value as number;
};

const requirePositiveInteger = (value: unknown, label: string) => {
  const parsed = requireInteger(value, label);
  if (parsed <= 0) throw new Error(`${label} must be positive.`);
  return parsed;
};

const parseCellRectangles = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0) throw new Error("External map has no cell rectangles.");
  return value.map((rectangle, index) => {
    if (!Array.isArray(rectangle) || rectangle.length !== 4) {
      throw new Error(`External map cell rectangle ${index} is invalid.`);
    }
    const [x, y, width, height] = rectangle.map((entry, entryIndex) =>
      requireInteger(entry, `External map cell rectangle ${index}.${entryIndex}`));
    if (width <= 0 || height <= 0) throw new Error(`External map cell rectangle ${index} is empty.`);
    return [x, y, width, height] as const;
  });
};

const getCellRange = (
  rectangles: ReturnType<typeof parseCellRectangles>,
): [number, number, number, number] => {
  const minimumX = Math.min(...rectangles.map(([x]) => x));
  const minimumY = Math.min(...rectangles.map(([, y]) => y));
  const maximumX = Math.max(...rectangles.map(([x, , width]) => x + width));
  const maximumY = Math.max(...rectangles.map(([, y, , height]) => y + height));
  return [minimumX, minimumY, maximumX - minimumX, maximumY - minimumY];
};

const createFloorDefinitions = (minimumFloor: number, maximumFloor: number, width: number, height: number) => {
  const maximumLevel = Math.ceil(Math.log2(Math.max(width, height)));
  const levels = Array.from({ length: maximumLevel + 1 }, (_, level) => level);
  return Array.from({ length: maximumFloor - minimumFloor + 1 }, (_, index) => maximumFloor - index)
    .map((floor) => ({
      floor,
      tileSize: 1024,
      format: floor === 0 ? "jpg" : "webp",
      width,
      height,
      levels,
    }));
};

const parseTileRanges = (value: unknown) => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("External map tile ranges must be an object.");
  return Object.fromEntries(Object.entries(value).map(([level, ranges]) => {
    if (!/^\d+$/.test(level) || !Array.isArray(ranges)) {
      throw new Error(`External map tile ranges for level ${level} are invalid.`);
    }
    return [level, ranges.map((range, index) => {
      if (!Array.isArray(range) || range.length !== 3 || range.some((entry) => !Number.isInteger(entry))) {
        throw new Error(`External map tile range ${level}.${index} is invalid.`);
      }
      return range as [number, number, number];
    })];
  }));
};

export const createExternalIsometricMap = ({
  basePath,
  generatedAt,
  id,
  payload,
}: ExternalIsometricMapOptions) => {
  if (!isRecord(payload)) throw new Error("External map metadata is invalid.");
  const width = requirePositiveInteger(payload.w, "External map width");
  const height = requirePositiveInteger(payload.h, "External map height");
  const minimumFloor = requireInteger(payload.minlayer, "External map minimum floor");
  const maximumFloor = requireInteger(payload.maxlayer, "External map maximum floor");
  if (maximumFloor < minimumFloor) throw new Error("External map floor range is invalid.");
  const tileRanges = parseTileRanges(payload.tileRanges);
  const rectangles = parseCellRectangles(payload.cell_rects);
  const cellRange = getCellRange(rectangles);
  const mapInfo: MapIsometricInfo = {
    w: width,
    h: height,
    x0: requireInteger(payload.x0, "External map X origin"),
    y0: requireInteger(payload.y0, "External map Y origin"),
    sqr: requirePositiveInteger(payload.sqr, "External map square size"),
    scale: 1,
    minlayer: minimumFloor,
    maxlayer: maximumFloor,
    cell_size: requirePositiveInteger(payload.cell_size, "External map cell size"),
    cell_rects: rectangles.map((rectangle) => [...rectangle]),
  };
  const floors = createFloorDefinitions(minimumFloor, maximumFloor, width, height).map((floor) =>
    floor.floor === 0 && tileRanges
      ? {
          ...floor,
          levels: Object.keys(tileRanges).map(Number).sort((left, right) => left - right),
          pyramidMaximumLevel: Math.ceil(Math.log2(Math.max(width, height))),
          tileRanges,
        }
      : floor);
  const totalCells = rectangles.reduce((total, [, , cellWidth, cellHeight]) => total + cellWidth * cellHeight, 0);
  const source: MapIsometricManifest = {
    id,
    basePath: basePath.replace(/\/$/, ""),
    tileSourceKind: "direct",
    renderer: "pzmap2dzi",
    rendererCommit: typeof payload.git_commit === "string" ? payload.git_commit : "unknown",
    generatedAt,
    cellRange,
    layerRange: [minimumFloor, maximumFloor + 1],
    complete: true,
    mapInfo,
    floors,
  };
  const catalog: MapIsometricCatalog = {
    schemaVersion: 1,
    generatedAt,
    worldCellRange: cellRange,
    cellSize: mapInfo.cell_size,
    totalCells,
    renderedCells: totalCells,
    complete: true,
    floors: floors.map(({ floor }) => floor),
    packs: [source],
  };
  return { catalog, source };
};
