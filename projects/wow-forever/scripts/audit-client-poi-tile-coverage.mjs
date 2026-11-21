/** Record whether published client POIs sit on extracted local terrain pixels. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const published = await readJson("data/client-research/published-point-of-interest-evidence.json");
if (atlas.source?.build !== published.source.build) {
  throw new Error("The atlas and published POIs belong to different builds.");
}
const tileCache = new Map();
const records = [];
for (const marker of published.markers) {
  const layer = atlas.terrainLayers.find(({ id }) => id === `map-${marker.mapId}`);
  if (!layer) throw new Error(`No terrain layer for AreaPOI ${marker.poiId}.`);
  const tileSize = layer.tileSize;
  const sourceX = (marker.atlasPosition.x - layer.originX) / layer.scaleX;
  const sourceY = (marker.atlasPosition.y - layer.originY) / layer.scaleY;
  const tileX = Math.floor(sourceX / tileSize);
  const tileY = Math.floor(sourceY / tileSize);
  const tileKey = `${tileX},${tileY}`;
  const covered = layer.tileCoverage[0].includes(tileKey);
  let alpha = null;
  if (covered) {
    const tilePath = resolve(root, "public/maps/world-atlas", layer.basePath,
      `tiles/0/tile${tileX}x${tileY}.webp`);
    if (!tileCache.has(tilePath)) {
      tileCache.set(tilePath, await sharp(tilePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
    }
    const { data, info } = tileCache.get(tilePath);
    const pixelX = Math.floor(sourceX - tileX * tileSize);
    const pixelY = Math.floor(sourceY - tileY * tileSize);
    alpha = data[(pixelY * info.width + pixelX) * info.channels + 3];
  }
  records.push({ poiId: marker.poiId, name: marker.name, mapId: marker.mapId,
    tileKey, covered, alpha });
}
await writeFile(join(root, "data/client-research/published-poi-tile-coverage.json"),
  `${JSON.stringify({ source: { product: atlas.source.product, build: atlas.source.build },
    rule: "The client POI position is sampled against the matching extracted terrain layer at detail level 0. Transparent pixels can represent sea or erased source backdrops and do not by themselves invalidate a POI.",
    records }, null, 2)}\n`);
console.log(`Sampled ${records.length} published POIs: ${records.filter(({ covered }) => !covered).length} outside tile coverage, ${records.filter(({ alpha }) => alpha === 0).length} on transparent pixels.`);
