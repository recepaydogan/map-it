import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(".runtime-data/map-data/knox-country/isometric-optimized/global");
const outputRoot = resolve(".render-cache/cumulative-floor-a-b");
const level = "10";
const tileName = "0_0.webp";
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const sourceFloors = manifest.floors
  .filter(({ floor, tileRanges }) => floor > 0 && floor <= 29 && tileRanges?.[level])
  .sort((left, right) => right.floor - left.floor);
const inputs = sourceFloors.map(({ floor }) => join(root, `layer${floor}_files`, level, tileName));
const metadata = await sharp(inputs[0]).metadata();
await mkdir(outputRoot, { recursive: true });
await sharp({
  create: {
    width: metadata.width,
    height: metadata.height,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(inputs.map((input) => ({ input })))
  .png()
  .toFile(join(outputRoot, "reverse-level10.png"));

await sharp({
  create: {
    width: metadata.width,
    height: metadata.height,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(inputs.map((input) => ({ input })))
  .webp({ quality: 90, alphaQuality: 100, smartSubsample: true, effort: 0 })
  .toFile(join(outputRoot, "reverse-level10.webp"));

await sharp(join(root, "cumulative/layer29_files", level, tileName))
  .png()
  .toFile(join(outputRoot, "current-level10.png"));

console.log(JSON.stringify({ floors: sourceFloors.map(({ floor }) => floor), level, tileName }, null, 2));
