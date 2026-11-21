import type { MapAtlasDefinition } from "./map-registry";
import type { MapCoordinate, MapPoint, MapSearchIndex } from "./types";

export type MapBounds = MapSearchIndex["maps"][number]["bounds"];
export type AtlasProjectedPoint<T extends MapPoint> = Omit<
  T,
  "x" | "y" | "mapId" | "sourceCoordinate"
> & {
  x: number;
  y: number;
  mapId: string;
  sourceCoordinate: MapCoordinate;
};

export const getMapPointInstanceId = (point: Pick<MapPoint, "id" | "mapId">) =>
  point.mapId ? `${point.mapId}:${point.id}` : point.id;

export const projectPointToAtlas = <T extends MapPoint>(
  atlas: MapAtlasDefinition,
  boundsByMapId: ReadonlyMap<string, MapBounds>,
  point: T,
): AtlasProjectedPoint<T> | null => {
  if (!point.mapId) return null;
  const placement = atlas.placements.find(({ mapId }) => mapId === point.mapId);
  const bounds = boundsByMapId.get(point.mapId);
  if (!placement || !bounds) return null;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (width <= 0 || height <= 0) return null;
  return {
    ...point,
    sourceCoordinate: point.sourceCoordinate ?? { x: point.x, y: point.y },
    x: placement.x + ((point.x - bounds.minX) / width) * placement.width,
    y: placement.y + ((point.y - bounds.minY) / height) * placement.height,
    mapId: point.mapId,
  } as AtlasProjectedPoint<T>;
};

export const unprojectAtlasCoordinate = (
  atlas: MapAtlasDefinition,
  boundsByMapId: ReadonlyMap<string, MapBounds>,
  coordinate: MapCoordinate,
): { mapId: string; coordinate: MapCoordinate } | null => {
  const placement = [...atlas.placements].reverse().find((candidate) =>
    coordinate.x >= candidate.x
    && coordinate.x <= candidate.x + candidate.width
    && coordinate.y >= candidate.y
    && coordinate.y <= candidate.y + candidate.height);
  if (!placement) return null;
  const bounds = boundsByMapId.get(placement.mapId);
  if (!bounds) return null;
  return {
    mapId: placement.mapId,
    coordinate: {
      x: bounds.minX + ((coordinate.x - placement.x) / placement.width) * (bounds.maxX - bounds.minX),
      y: bounds.minY + ((coordinate.y - placement.y) / placement.height) * (bounds.maxY - bounds.minY),
    },
  };
};

export const getPointSourceCoordinate = (point: MapPoint): MapCoordinate =>
  point.sourceCoordinate ?? point;
