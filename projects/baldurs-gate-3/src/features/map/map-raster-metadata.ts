import type { MapMetadata } from "./types";

export type MapRasterMetadata = Pick<MapMetadata, "bounds" | "tileSize" | "tileImageSize" | "detailLevels" | "tileSource">;

/** Load imagery independently of the potentially large marker/content payloads. */
export const parseMapRasterMetadata = (raw: unknown, basePath: string): MapRasterMetadata => {
  if (!raw || typeof raw !== "object") throw new Error("Invalid map raster metadata.");
  const value = raw as Record<string, unknown>;
  const bounds = value.bounds as MapMetadata["bounds"] | undefined;
  if (!bounds || ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)
    || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    throw new Error("Map raster bounds must have a positive finite area.");
  }
  if (typeof value.tileSize !== "number" || !Number.isInteger(value.tileSize) || value.tileSize <= 0
    || !Array.isArray(value.detailLevels) || value.detailLevels.length === 0
    || !value.detailLevels.every((level) => Number.isInteger(level) && level >= 0)) {
    throw new Error("Map raster tile size or detail levels are invalid.");
  }
  const tileImageSize = value.tileImageSize as MapMetadata["tileImageSize"];
  if (tileImageSize !== undefined && (!tileImageSize
    || !Number.isInteger(tileImageSize.width) || !Number.isInteger(tileImageSize.height)
    || tileImageSize.width <= 0 || tileImageSize.height <= 0)) {
    throw new Error("Map raster image dimensions must be positive integers.");
  }
  return {
    bounds,
    ...(tileImageSize ? { tileImageSize } : {}),
    tileSize: value.tileSize,
    detailLevels: value.detailLevels,
    tileSource: {
      basePath,
      tilePattern: typeof value.tilePattern === "string" && value.tilePattern
        ? value.tilePattern : "tiles/{level}/tile{x}x{y}.webp",
    },
  };
};
