import type { MapMetadata, MapTileSource } from "./types";
import { MAP_DATA_BASE_URL } from "./map-data-url";

export const getMapTileSource = (data: MapMetadata): MapTileSource => data.tileSource ?? {
  kind: "static",
  basePath: MAP_DATA_BASE_URL,
  tilePattern: "tiles/{level}/tile{x}x{y}.png",
};

export const selectMapDetailLevel = (zoom: number, levels: number[], targetScale = 0.72) => {
  const target = Math.max(0, Math.round(Math.log2(targetScale / zoom)));
  return levels.reduce((nearest, level) =>
    Math.abs(level - target) < Math.abs(nearest - target) ? level : nearest, levels[0] ?? 0);
};

export const resolveMapTilePath = (pattern: string, level: number, x: number, y: number) => pattern
  .replace("{level}", String(level))
  .replace("{x}", String(x))
  .replace("{y}", String(y));
