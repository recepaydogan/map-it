/** Render a review image from the extracted local client tiles. */
import { readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const atlas = JSON.parse(await readFile(join(projectRoot, "public/maps/world-atlas/metadata.json"), "utf8"));
const width = 1200;
const height = Math.round(width * (atlas.bounds.maxY - atlas.bounds.minY)
  / (atlas.bounds.maxX - atlas.bounds.minX));
const scale = width / (atlas.bounds.maxX - atlas.bounds.minX);
const overlays = [];

for (const layer of atlas.terrainLayers) {
  const level = Math.min(5, layer.detailLevels.at(-1));
  const tileWorldSize = layer.tileSize * 2 ** level;
  const layerDir = join(projectRoot, "public/maps", layer.basePath.replace("../", ""));
  for (const coordinate of layer.tileCoverage[level]) {
    const [column, row] = coordinate.split(",").map(Number);
    const left = Math.round((layer.originX + column * tileWorldSize * layer.scaleX) * scale);
    const top = Math.round((layer.originY + row * tileWorldSize * layer.scaleY) * scale);
    const right = Math.round((layer.originX + (column + 1) * tileWorldSize * layer.scaleX) * scale);
    const bottom = Math.round((layer.originY + (row + 1) * tileWorldSize * layer.scaleY) * scale);
    const tilePath = join(layerDir, `tiles/${level}/tile${column}x${row}.webp`);
    const clippedLeft = Math.max(0, left);
    const clippedTop = Math.max(0, top);
    const clippedRight = Math.min(width, right);
    const clippedBottom = Math.min(height, bottom);
    if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) continue;
    const image = await sharp(tilePath).resize(right - left, bottom - top)
      .extract({ left: clippedLeft - left, top: clippedTop - top,
        width: clippedRight - clippedLeft, height: clippedBottom - clippedTop })
      .png().toBuffer();
    overlays.push({ input: image, left: clippedLeft, top: clippedTop });
  }
}

const output = join(projectRoot, "data/client-map-extraction/previews/world-atlas-after.png");
await mkdir(dirname(output), { recursive: true });
await sharp({ create: { width, height, channels: 4, background: atlas.backgroundColor } })
  .composite(overlays).png().toFile(output);
console.log(output);
