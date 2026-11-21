import { area12BlockWorlds } from "./er-map-data";
import { NOMINAL_SIZE } from "../../data/maps";
import type {
  RawErMapMarker,
  ErMapLayer,
  ErMapLayerDefinition,
  ErMapPosition,
} from "./types";

const GAME_TILE_SIZE = 256;
const MAP_TILE_WORLD_GRID_ORIGIN_X = 28;
const MAP_TILE_WORLD_GRID_ORIGIN_Z = 24;

export const TEST_MAP_LAYERS: Record<ErMapLayer, ErMapLayerDefinition> = {
  overworld: {
    key: "overworld",
    areaNo: "60",
    tileSet: "er-overworld",
    imageWidth: 6016,
    imageHeight: 6016,
    contentBounds: { left: 0, top: 0, right: 5576, bottom: 5284 },
    tileMinX: 0,
    tileMaxX: 40,
    tileMinZ: 0,
    tileMaxZ: 40,
    coordinateMode: "world-grid",
  },
  underground: {
    key: "underground",
    areaNo: "12",
    tileSet: "er-underground",
    imageWidth: 6400,
    imageHeight: 6912,
    contentBounds: { left: 0, top: 0, right: 6400, bottom: 6912 },
    // The stitched M01 canvas covers map-tile columns 2-26 and rows 8-34 of
    // the same tile-index space the M00 overworld canvas uses.
    tileMinX: 2,
    tileMaxX: 26,
    tileMinZ: 8,
    tileMaxZ: 34,
    coordinateMode: "world-blocks",
  },
  "dlc-realm-of-shadow": {
    key: "dlc-realm-of-shadow",
    areaNo: "61",
    tileSet: "er-dlc",
    imageWidth: 5120,
    imageHeight: 6144,
    contentBounds: { left: 0, top: 0, right: 5120, bottom: 6144 },
    tileMinX: 11,
    tileMaxX: 30,
    tileMinZ: 10,
    tileMaxZ: 33,
    coordinateMode: "world-grid",
  },
};

export const TEST_MAP_LAYER_ORDER: ErMapLayer[] = [
  "overworld",
  "underground",
  "dlc-realm-of-shadow",
];

export const layerForArea = (areaNo: string): ErMapLayer | null => {
  if (areaNo === "60") return "overworld";
  if (areaNo === "12") return "underground";
  if (areaNo === "61") return "dlc-realm-of-shadow";
  return null;
};

export const rawPositionFor = (
  marker: RawErMapMarker,
  layer: ErMapLayerDefinition,
): ErMapPosition => {
  if (marker.pixel) {
    return {
      x: (marker.pixel.x / NOMINAL_SIZE) * layer.imageWidth,
      y: (marker.pixel.y / NOMINAL_SIZE) * layer.imageHeight,
      rawWorldX: 0,
      rawWorldZ: 0,
      outsideCanvas: false,
    };
  }

  let rawWorldX: number;
  let rawWorldZ: number;
  let unresolvedBlock = false;

  if (layer.coordinateMode === "world-blocks") {
    // Area 12 stores (block=gridX, localX, localZ); the block's translation to
    // the area-60 world grid comes straight from WorldMapLegacyConvParam.
    const block = area12BlockWorlds[String(marker.gridX)];
    unresolvedBlock = !block;
    rawWorldX = marker.localX + (block?.worldX ?? 0);
    rawWorldZ = marker.localZ + (block?.worldZ ?? 0);
  } else {
    rawWorldX = (marker.gridX - 16) * GAME_TILE_SIZE + marker.localX;
    rawWorldZ = (marker.gridZ - 16) * GAME_TILE_SIZE + marker.localZ;
  }

  const position = worldPositionFor(rawWorldX, rawWorldZ, layer);
  return { ...position, outsideCanvas: unresolvedBlock || position.outsideCanvas };
};

export const worldPositionFor = (
  rawWorldX: number,
  rawWorldZ: number,
  layer: ErMapLayerDefinition,
): ErMapPosition => {
  // Both canvases are north-up mosaics of 256-unit map tiles whose indices
  // live in one shared space: world grid 28/24 maps to tile index 0 with a
  // half-tile shift, so a world coordinate projects onto any layer through
  // its tile window alone.
  const rawCanvasX =
    rawWorldX -
    (MAP_TILE_WORLD_GRID_ORIGIN_X - 16 + layer.tileMinX) * GAME_TILE_SIZE +
    GAME_TILE_SIZE / 2;
  const rawCanvasY =
    (layer.tileMaxZ + MAP_TILE_WORLD_GRID_ORIGIN_Z - 16) * GAME_TILE_SIZE +
    GAME_TILE_SIZE / 2 -
    rawWorldZ;

  const rawCanvasWidth =
    (layer.tileMaxX - layer.tileMinX + 1) * GAME_TILE_SIZE;
  const rawCanvasHeight =
    (layer.tileMaxZ - layer.tileMinZ + 1) * GAME_TILE_SIZE;
  const x = (rawCanvasX / rawCanvasWidth) * layer.imageWidth;
  const y = (rawCanvasY / rawCanvasHeight) * layer.imageHeight;

  return {
    x,
    y,
    rawWorldX,
    rawWorldZ,
    outsideCanvas:
      !Number.isFinite(x) || !Number.isFinite(y) ||
      x < layer.contentBounds.left ||
      x > layer.contentBounds.right ||
      y < layer.contentBounds.top ||
      y > layer.contentBounds.bottom,
  };
};
