/**
 * Convert a square grid of exported map textures into the tile pyramid used by
 * the map viewer. Input files are named <prefix>_<column>_<row>.png, with
 * zero-based, two-digit grid coordinates. Run with --help for usage.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const usage = `Usage: node scripts/build-map-from-tiles.mjs \\
  --source <exported-texture-directory> --prefix <texture-prefix> \\
  --output <public/maps/map-id> --name <display-name>`;

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key === "--help") {
    console.log(usage);
    process.exit(0);
  }
  if (!key?.startsWith("--") || !value) throw new Error(usage);
  args.set(key.slice(2), value);
}
for (const key of ["source", "prefix", "output", "name"]) {
  if (!args.has(key)) throw new Error(`Missing --${key}.\n${usage}`);
}

const source = path.resolve(args.get("source"));
const output = path.resolve(args.get("output"));
const prefix = args.get("prefix");
const files = await fs.readdir(source);
const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_(\\d{2})_(\\d{2})\\.png$`);
const coordinates = files.flatMap((file) => {
  const match = pattern.exec(file);
  return match ? [{ file, column: Number(match[1]), row: Number(match[2]) }] : [];
});
if (coordinates.length === 0) throw new Error(`No matching textures in ${source}.`);

const columns = Math.max(...coordinates.map(({ column }) => column)) + 1;
const rows = Math.max(...coordinates.map(({ row }) => row)) + 1;
if (coordinates.length !== columns * rows) {
  throw new Error(`Incomplete grid: found ${coordinates.length} of ${columns * rows} textures.`);
}

const first = await sharp(path.join(source, coordinates[0].file)).metadata();
if (!first.width || !first.height || first.width !== first.height) {
  throw new Error("Source textures must be square.");
}
const tileSize = first.width;
const tiles = new Map();
for (const { file, column, row } of coordinates) {
  const metadata = await sharp(path.join(source, file)).metadata();
  if (metadata.width !== tileSize || metadata.height !== tileSize) {
    throw new Error(`${file} is not ${tileSize} × ${tileSize}.`);
  }
  tiles.set(`${column},${row}`, path.join(source, file));
}

let level = 0;
let levelColumns = columns;
let levelRows = rows;
let written = 0;
const detailLevels = [];
while (true) {
  detailLevels.push(level);
  const levelDirectory = path.join(output, "tiles", String(level));
  await fs.mkdir(levelDirectory, { recursive: true });
  for (let column = 0; column < levelColumns; column += 1) {
    for (let row = 0; row < levelRows; row += 1) {
      const input = tiles.get(`${column},${row}`);
      if (!input) throw new Error(`Missing tile ${column},${row} at level ${level}.`);
      if (level === 0) {
        const tilePath = path.join(levelDirectory, `tile${column}x${row}.webp`);
        await sharp(input).webp({ quality: 88, effort: 5 }).toFile(tilePath);
        tiles.set(`${column},${row}`, tilePath);
      }
      written += 1;
    }
  }
  console.log(`Level ${level}: ${levelColumns} × ${levelRows} tiles`);
  if (levelColumns === 1 && levelRows === 1) break;

  const next = new Map();
  const nextColumns = Math.ceil(levelColumns / 2);
  const nextRows = Math.ceil(levelRows / 2);
  for (let column = 0; column < nextColumns; column += 1) {
    for (let row = 0; row < nextRows; row += 1) {
      const parts = [];
      for (let dx = 0; dx < 2; dx += 1) {
        for (let dy = 0; dy < 2; dy += 1) {
          const input = tiles.get(`${column * 2 + dx},${row * 2 + dy}`);
          if (input) parts.push({ input, left: dx * tileSize, top: dy * tileSize });
        }
      }
      const nextPath = path.join(output, "tiles", String(level + 1), `tile${column}x${row}.webp`);
      await fs.mkdir(path.dirname(nextPath), { recursive: true });
      const { data, info } = await sharp({
        create: { width: tileSize * 2, height: tileSize * 2, channels: 4, background: "#00000000" },
      }).composite(parts).raw().toBuffer({ resolveWithObject: true });
      await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .resize(tileSize, tileSize).webp({ quality: 88, effort: 5 }).toFile(nextPath);
      next.set(`${column},${row}`, nextPath);
    }
  }
  tiles.clear();
  for (const [key, value] of next) tiles.set(key, value);
  levelColumns = nextColumns;
  levelRows = nextRows;
  level += 1;
}

const metadata = {
  schemaVersion: 1,
  displayName: args.get("name"),
  bounds: { minX: 0, minY: 0, maxX: columns * tileSize, maxY: rows * tileSize },
  tileSize,
  detailLevels,
  tilePattern: "tiles/{level}/tile{x}x{y}.webp",
  regions: [],
  locations: [],
};
await fs.writeFile(path.join(output, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Wrote ${written} tiles to ${output}`);
