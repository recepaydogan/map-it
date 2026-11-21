/** Verify the complete named AreaPOI venue cluster against native Dalaran terrain. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const profile = await readJson("data/client-research/area-poi-category-profile.json");
const identity = await readJson("data/client-research/wdt-map-identities.json");
const terrain = await readJson("public/maps/wdt-6982267/metadata.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const namedMap = identity.records.find(({ wdtFileDataId }) =>
  wdtFileDataId === terrain.source.wdtFileDataId)?.maps.find(({ mapId }) => mapId === 2959);
if (profile.source.build !== identity.source.build
  || profile.source.build !== terrain.source.build
  || profile.source.build !== atlas.source.build
  || namedMap?.name !== "City of Dalaran"
  || terrain.source.wdtFileDataId !== 6982267
  || terrain.source.tileCount !== 25
  || terrain.source.missingFileDataIds.length) {
  throw new Error("The Dalaran AreaPOI and native terrain sources differ.");
}
const mapWorldSize = 1600 / 3;
const ids = [8451, 8452, 8453, 8454, 8455, 8456, 8457, 8458];
const mapLayer = atlas.terrainLayers.find(({ id }) => id === "map-0");
if (!mapLayer) throw new Error("The Eastern Kingdoms atlas layer is missing.");
const pixelAlpha = async (base, tileSize, x, y, coverage) => {
  const tileX = Math.floor(x / tileSize);
  const tileY = Math.floor(y / tileSize);
  const key = `${tileX},${tileY}`;
  if (!coverage.includes(key)) throw new Error(`Missing native tile ${base}:${key}.`);
  const { data, info } = await sharp(join(root, base,
    `tiles/0/tile${tileX}x${tileY}.webp`)).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const pixelX = Math.floor(x - tileX * tileSize);
  const pixelY = Math.floor(y - tileY * tileSize);
  return { tile: key, alpha: data[(pixelY * info.width + pixelX) * info.channels + 3] };
};
const venues = [];
for (const poiId of ids) {
  const matches = profile.groups.flatMap((group) => group.records
    .filter((record) => record.poiId === poiId)
    .map((record) => ({ ...record, iconId: group.iconId,
      uiCategory: group.uiCategory, uiPriority: group.uiPriority })));
  const poi = matches[0];
  if (matches.length !== 1 || poi.mapId !== 0 || poi.iconId !== 0
    || poi.uiCategory !== 0 || poi.uiPriority !== (poiId === 8456 ? 0 : 7)) {
    throw new Error(`Dalaran venue AreaPOI ${poiId} changed.`);
  }
  const [worldX, worldY] = poi.worldPosition;
  const cityX = (32 - worldY / mapWorldSize - terrain.source.grid.minX) * terrain.tileSize;
  const cityY = (32 - worldX / mapWorldSize - terrain.source.grid.minY) * terrain.tileSize;
  const worldXOnTile = (poi.atlasPosition.x - mapLayer.originX) / mapLayer.scaleX;
  const worldYOnTile = (poi.atlasPosition.y - mapLayer.originY) / mapLayer.scaleY;
  if (cityX < terrain.bounds.minX || cityX > terrain.bounds.maxX
    || cityY < terrain.bounds.minY || cityY > terrain.bounds.maxY) {
    throw new Error(`AreaPOI ${poiId} lies outside the native Dalaran map.`);
  }
  const cityPixel = await pixelAlpha("public/maps/wdt-6982267", terrain.tileSize,
    cityX, cityY, terrain.tileCoverage[0]);
  const worldPixel = await pixelAlpha(join("public/maps/world-atlas", mapLayer.basePath),
    mapLayer.tileSize, worldXOnTile, worldYOnTile, mapLayer.tileCoverage[0]);
  if (!cityPixel.alpha || !worldPixel.alpha) {
    throw new Error(`AreaPOI ${poiId} lies on transparent terrain.`);
  }
  venues.push({ poiId, name: poi.name, mapId: poi.mapId,
    worldPosition: poi.worldPosition, atlasPosition: poi.atlasPosition,
    iconId: poi.iconId, uiCategory: poi.uiCategory,
    uiPriority: poi.uiPriority, cityPixel, worldPixel });
}
await writeFile(join(root, "data/client-research/dalaran-venue-trace.json"),
  `${JSON.stringify({ source: { product: profile.source.product,
    build: profile.source.build, areaPoi: { fileDataId: profile.source.fileDataId,
      sha256: profile.source.sha256 }, mapId: namedMap.mapId,
    mapName: namedMap.name, wdtFileDataId: terrain.source.wdtFileDataId,
    wdtSha256: terrain.source.wdtSha256 },
  rule: "Eight exact-name Eastern Kingdoms AreaPOIs occupy opaque native terrain inside the 25-tile client map named City of Dalaran. One venue has a distinct native UI priority but the same position/name family.",
  caveat: "AreaPOIs locate named venues; they do not identify vendors, inventories, trainers, or available services.",
  venues }, null, 2)}\n`);
console.log(`Verified ${venues.length} Dalaran venue POIs on both native maps.`);
