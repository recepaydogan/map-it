import assert from "node:assert/strict";
import fs from "node:fs";
import { getVisibleMapTiles, selectMapDetailLevel } from "../src/features/map/map-tile-utils.ts";
import { parseMapRasterMetadata } from "../src/features/map/map-raster-metadata.ts";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";

const levels = [0, 1, 2, 3, 4, 5];
assert.equal(selectMapDetailLevel(0.2, levels), 1);
assert.equal(selectMapDetailLevel(0.2, levels, 0.72, 2), 0, "High-density displays request finer tiles.");
assert.equal(selectMapDetailLevel(8, levels), 0, "Extreme zoom retains the native tile level.");
assert.equal(selectMapDetailLevel(8, [2, 3]), 2, "Never request an absent detail level.");
assert.equal(selectMapDetailLevel(0.2, [...levels].reverse()), 1);
assert.equal(selectMapDetailLevel(0.01, [0, 2, 4]), 4);

const raster = parseMapRasterMetadata({
  bounds: { minX: -200, minY: 100, maxX: 1848, maxY: 1124 },
  tileSize: 256,
  detailLevels: levels,
}, "/maps/test");
const viewport = { width: 800, height: 600 };
assert.deepEqual(getVisibleMapTiles(raster, { left: 900, top: 0, width: 200, height: 100 }, viewport), []);
assert.deepEqual(getVisibleMapTiles(raster, { left: 0, top: 0, width: 200, height: 100 }, { width: 0, height: 0 }), []);
assert.throws(() => parseMapRasterMetadata({ ...raster, detailLevels: [-1] }, ""));
assert.throws(() => parseMapRasterMetadata({ ...raster, bounds: { minX: 1, maxX: 1, minY: 0, maxY: 1 } }, ""));
assert.throws(() => parseMapRasterMetadata({ ...raster, tileImageSize: { width: 0, height: 10 } }, ""));
assert.throws(() => parseMapRasterMetadata({ ...raster, tileImageSize: { width: 10, height: 0.5 } }, ""));
const nativeRaster = parseMapRasterMetadata({
  bounds: { minX: -200, minY: 100, maxX: 600, maxY: 500 },
  tileSize: 256, detailLevels: [0, 1, 2], tileImageSize: { width: 1600, height: 800 },
}, "/native");
const nativeTiles = getVisibleMapTiles(nativeRaster, { left: 0, top: 0, width: 1600, height: 800 }, { width: 1600, height: 800 });
const middleTile = nativeTiles.find((tile) => tile.column === 3 && tile.row === 1);
assert.equal(middleTile?.width, 256, "Tile resolution is independent of logical marker bounds");
assert.equal(middleTile.left + 32, (200 - nativeRaster.bounds.minX) / 800 * 1600, "A saved logical marker stays aligned with the higher-resolution source");
assert.equal(middleTile.top + 144, (300 - nativeRaster.bounds.minY) / 400 * 800);
const rectangle = { left: -1000, top: -450, width: 4096, height: 1536 };
const visible = getVisibleMapTiles(raster, rectangle, viewport, 2);
assert.ok(visible.length > 0 && visible.length < 32, "Only the visible portion of a zoomed map loads.");
for (const tile of visible) {
  assert.equal(tile.level, 0);
  assert.equal(tile.left, tile.column * 256 * 2);
  assert.equal(tile.top, tile.row * 256 * 1.5);
  assert.ok(rectangle.left + tile.left < viewport.width && rectangle.left + tile.left + tile.width > 0);
  assert.ok(rectangle.top + tile.top < viewport.height && rectangle.top + tile.top + tile.height > 0);
}

const ids = readRegisteredMapIds(fs.readFileSync("src/features/map/map-registry.ts", "utf8"));
const registry = fs.readFileSync("src/features/map/map-registry.ts", "utf8");
const start = registry.indexOf("[", registry.indexOf("export const MAP_ATLASES"));
const end = registry.indexOf("\n];", start);
const atlases = Function(`return (${registry.slice(start, end + 2)})`)();
let tileCount = 0;
for (const id of ids) {
  const metadata = parseMapRasterMetadata(JSON.parse(fs.readFileSync(`public/maps/${id}/metadata.json`)), `/maps/${id}`);
  const imageWidth = metadata.tileImageSize?.width ?? metadata.bounds.maxX - metadata.bounds.minX;
  const imageHeight = metadata.tileImageSize?.height ?? metadata.bounds.maxY - metadata.bounds.minY;
  for (const level of metadata.detailLevels) {
    const available = new Set(fs.readdirSync(`public/maps/${id}/tiles/${level}`));
    const span = metadata.tileSize * 2 ** level;
    for (let x = 0; x < Math.ceil(imageWidth / span); x += 1) {
      for (let y = 0; y < Math.ceil(imageHeight / span); y += 1) {
        assert.ok(available.has(`tile${x}x${y}.webp`), `${id} is missing tile ${level}/${x}/${y}`);
        tileCount += 1;
      }
    }
  }
  const placement = atlases.flatMap((atlas) => atlas.placements).find(({ mapId }) => mapId === id);
  assert.ok(Math.abs(placement.width / placement.height / (imageWidth / imageHeight) - 1) < 0.00001,
    `${id} is stretched instead of preserving the native raster aspect ratio`);
  const rect = { left: 0, top: 0, width: placement.width * 3, height: placement.height * 3 };
  const detailed = getVisibleMapTiles(metadata, rect, viewport, 2);
  assert.ok(detailed.length > 0, `${id} has visible native tiles at close zoom`);
  assert.ok(detailed.length < 160, `${id} does not mount its entire pyramid`);
  // A tile corner and a marker at that source coordinate must land on the same pixel.
  for (const tile of detailed) {
    const sourceX = metadata.bounds.minX + tile.column * metadata.tileSize * 2 ** tile.level / imageWidth * (metadata.bounds.maxX - metadata.bounds.minX);
    const sourceY = metadata.bounds.minY + tile.row * metadata.tileSize * 2 ** tile.level / imageHeight * (metadata.bounds.maxY - metadata.bounds.minY);
    assert.ok(Math.abs(tile.left - (sourceX - metadata.bounds.minX) / (metadata.bounds.maxX - metadata.bounds.minX) * rect.width) < 1e-8);
    assert.ok(Math.abs(tile.top - (sourceY - metadata.bounds.minY) / (metadata.bounds.maxY - metadata.bounds.minY) * rect.height) < 1e-8);
  }
}
console.log(`Map raster tests passed: ${ids.length} maps, ${tileCount} referenced tiles, high-density LOD and marker alignment.`);
