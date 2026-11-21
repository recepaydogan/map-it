import { worldToIsometricImage } from "./map-isometric-coordinates";
import { getIsometricPyramidMaximumLevel, isTileInIsometricRanges } from "./map-isometric-tile-ranges";
import type { MapIsometricFloor, MapIsometricManifest } from "./map-isometric-types";

interface Point {
  x: number;
  y: number;
}

const overlapsOnAxis = (left: Point[], right: Point[], axis: Point) => {
  const project = (point: Point) => point.x * axis.x + point.y * axis.y;
  const leftValues = left.map(project);
  const rightValues = right.map(project);
  return Math.max(...leftValues) >= Math.min(...rightValues)
    && Math.max(...rightValues) >= Math.min(...leftValues);
};

const polygonsOverlap = (left: Point[], right: Point[]) => {
  const getAxes = (polygon: Point[]) => polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    return { x: -(next.y - point.y), y: next.x - point.x };
  });
  const axes = [...getAxes(left), ...getAxes(right)];
  return axes.every((axis) => overlapsOnAxis(left, right, axis));
};

const getCellPolygon = (
  source: MapIsometricManifest,
  floorNumber: number,
  rectangle: [number, number, number, number],
) => {
  const [cellX, cellY, cellWidth, cellHeight] = rectangle;
  const size = source.mapInfo.cell_size;
  const minimumX = cellX * size;
  const minimumY = cellY * size;
  const maximumX = (cellX + cellWidth) * size;
  const maximumY = (cellY + cellHeight) * size;
  return [
    { x: minimumX, y: minimumY },
    { x: maximumX, y: minimumY },
    { x: maximumX, y: maximumY },
    { x: minimumX, y: maximumY },
  ].map((point) => worldToIsometricImage(point, floorNumber, source.mapInfo));
};

const getTilePolygon = (
  floor: MapIsometricFloor,
  level: number,
  tileX: number,
  tileY: number,
) => {
  const maximumLevel = getIsometricPyramidMaximumLevel(floor);
  const levelScale = 2 ** (maximumLevel - level);
  const left = tileX * floor.tileSize * levelScale;
  const top = tileY * floor.tileSize * levelScale;
  const right = Math.min(floor.width, (tileX + 1) * floor.tileSize * levelScale);
  const bottom = Math.min(floor.height, (tileY + 1) * floor.tileSize * levelScale);
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
};

export const isIsometricTileCovered = (
  source: MapIsometricManifest,
  floor: MapIsometricFloor,
  level: number,
  tileX: number,
  tileY: number,
) => {
  if (!floor.levels.includes(level)) return false;
  if (floor.tileRanges) {
    return isTileInIsometricRanges(floor.tileRanges, level, tileX, tileY);
  }
  const rectangles = source.mapInfo.cell_rects;
  if (!rectangles?.length) return true;
  const tilePolygon = getTilePolygon(floor, level, tileX, tileY);
  return rectangles.some((rectangle) =>
    polygonsOverlap(tilePolygon, getCellPolygon(source, floor.floor, rectangle)));
};
