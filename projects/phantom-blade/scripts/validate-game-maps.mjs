/** Verify coverage, native bounds, and every full-resolution tile's source pixels. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const sourceArgument = process.argv.indexOf("--source");
if (sourceArgument < 0 || !process.argv[sourceArgument + 1]) {
  throw new Error("Usage: node scripts/validate-game-maps.mjs --source <verified-extraction-directory>");
}
const source = path.resolve(process.argv[sourceArgument + 1]);
const project = path.resolve(import.meta.dirname, "..");
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const catalog = await readJson(path.join(project, "public/data/maps/catalog.json"));
const textures = await readJson(path.join(source, "texture-manifest.json"));
const names = (await readJson(path.join(project, "src/i18n/locales/en.json"))).map.maps.names;
sharp.cache(false);
sharp.concurrency(2);
let total = 0;
let exact = 0;

for (const map of catalog.maps) {
  const base = path.join(project, "public/maps", map.id);
  const metadata = await readJson(path.join(base, "metadata.json"));
  const texture = textures.find((item) => item.asset === map.source.asset);
  if (!texture || names[map.id] !== map.name || map.nameKey !== `map.maps.names.${map.id}`) {
    throw new Error(`Invalid source or UI label: ${map.id}.`);
  }
  if (metadata.bounds.minX !== 0 || metadata.bounds.minY !== 0
    || metadata.bounds.maxX !== texture.width || metadata.bounds.maxY !== texture.height
    || metadata.tileSize !== map.tileSize || metadata.locations.length !== 0) {
    throw new Error(`Invalid native bounds or unexpected marker data: ${map.id}.`);
  }
  const { data: pixels, info } = await sharp(path.join(source, texture.output)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let mapTiles = 0;
  for (const level of metadata.detailLevels) {
    const columns = Math.ceil(info.width / (metadata.tileSize * 2 ** level));
    const rows = Math.ceil(info.height / (metadata.tileSize * 2 ** level));
    const coverage = new Set(metadata.tileCoverage[metadata.detailLevels.indexOf(level)]);
    const files = await fs.readdir(path.join(base, "tiles", String(level)));
    if (coverage.size !== columns * rows || files.length !== coverage.size) throw new Error(`Incomplete level ${map.id}/${level}.`);
    const jobs = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      if (!coverage.has(`${x},${y}`)) throw new Error(`Missing coverage ${map.id}/${level}/${x},${y}.`);
      jobs.push({ x, y });
    }
    for (let start = 0; start < jobs.length; start += 4) {
      await Promise.all(jobs.slice(start, start + 4).map(async ({ x, y }) => {
        const file = path.join(base, "tiles", String(level), `tile${x}x${y}.webp`);
        const image = sharp(file);
        const tile = await image.metadata();
        if (tile.format !== "webp" || tile.width !== metadata.tileSize || tile.height !== metadata.tileSize) {
          throw new Error(`Invalid tile ${file}.`);
        }
        if (level === 0) {
          const actual = await image.ensureAlpha().raw().toBuffer();
          const width = Math.min(metadata.tileSize, info.width - x * metadata.tileSize);
          const height = Math.min(metadata.tileSize, info.height - y * metadata.tileSize);
          const expectedHash = createHash("sha256");
          const actualHash = createHash("sha256");
          for (let row = 0; row < height; row++) {
            const nativeStart = ((y * metadata.tileSize + row) * info.width + x * metadata.tileSize) * 4;
            expectedHash.update(pixels.subarray(nativeStart, nativeStart + width * 4));
            const tileStart = row * metadata.tileSize * 4;
            actualHash.update(actual.subarray(tileStart, tileStart + width * 4));
          }
          if (expectedHash.digest("hex") !== actualHash.digest("hex")) throw new Error(`Source pixel mismatch in ${file}.`);
          exact++;
        }
      }));
    }
    mapTiles += jobs.length;
  }
  if (mapTiles !== map.tileCount) throw new Error(`Wrong catalog tile count: ${map.id}.`);
  total += mapTiles;
  console.log(`${map.id}: ${mapTiles} valid tiles; every native-resolution pixel matches the source.`);
}
console.log(`Verified ${catalog.maps.length} maps, ${total} tiles, ${exact} native-resolution tiles with identical source pixels.`);
