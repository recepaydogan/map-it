import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadEnv } from "vite";
import { MAP_WEBP_OPTIONS } from "./lib/map-raster-encoding.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const overviewLongEdge = 3072;
const arguments_ = process.argv.slice(2);
const ifLocalIndex = arguments_.indexOf("--if-local");
if (ifLocalIndex !== -1) {
  arguments_.splice(ifLocalIndex, 1);
  if (loadEnv("production", projectRoot, "VITE_").VITE_MAP_IMAGE_BASE_URL?.trim()) {
    console.log("Map overviews use the configured CDN; local generation skipped.");
    process.exit(0);
  }
}
const options = new Map();
for (let index = 0; index < arguments_.length; index += 2) {
  const key = arguments_[index];
  const value = arguments_[index + 1];
  if (!["--maps", "--root"].includes(key) || !value || options.has(key)) {
    throw new Error("Expected optional --maps comma-separated-map-ids and --root map-sources/staging-directory.");
  }
  options.set(key, value);
}
const mapsRoot = fs.realpathSync(path.resolve(projectRoot, options.get("--root") ?? "public/maps"));
if (options.has("--root") && !mapsRoot.startsWith(`${fs.realpathSync(path.join(projectRoot, "map-sources"))}${path.sep}`)) {
  throw new Error("Staged overviews must stay inside map-sources.");
}
const requestedIds = new Set((options.get("--maps") ?? "").split(",").filter(Boolean));
sharp.cache(false);

const availableMaps = fs.readdirSync(mapsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()
    && entry.name !== "sample"
    && fs.existsSync(path.join(mapsRoot, entry.name, "metadata.json")))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "en"));
for (const id of requestedIds) {
  if (!availableMaps.includes(id)) throw new Error(`Unknown map overview target: ${id}.`);
}
const mapDirectories = availableMaps.filter((id) => requestedIds.size === 0 || requestedIds.has(id));

for (const mapId of mapDirectories) {
  const mapRoot = path.join(mapsRoot, mapId);
  const metadata = JSON.parse(fs.readFileSync(path.join(mapRoot, "metadata.json"), "utf8"));
  const sourceWidth = metadata.tileImageSize?.width ?? metadata.bounds.maxX - metadata.bounds.minX;
  const sourceHeight = metadata.tileImageSize?.height ?? metadata.bounds.maxY - metadata.bounds.minY;
  const level = [...metadata.detailLevels]
    .sort((left, right) => right - left)
    .find((candidate) => Math.max(sourceWidth, sourceHeight) / (2 ** candidate) >= overviewLongEdge)
    ?? Math.min(...metadata.detailLevels);
  const scale = 2 ** level;
  const tileSize = metadata.tileSize;
  const width = Math.ceil(sourceWidth / scale);
  const height = Math.ceil(sourceHeight / scale);
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const composites = [];

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const tilePath = path.join(mapRoot, "tiles", String(level), `tile${column}x${row}.webp`);
      if (!fs.existsSync(tilePath)) throw new Error(`Missing overview source tile: ${tilePath}`);
      composites.push({ input: tilePath, left: column * tileSize, top: row * tileSize });
    }
  }

  if (composites.length === 0) {
    throw new Error(`${mapId} has no tiles at overview level ${level}.`);
  }

  try {
    const tiledOverview = await sharp({
      create: {
        width: columns * tileSize,
        height: rows * tileSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();
    await sharp(tiledOverview)
      .extract({ left: 0, top: 0, width, height })
      .resize({
        width: overviewLongEdge,
        height: overviewLongEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp(MAP_WEBP_OPTIONS)
      .toFile(path.join(mapRoot, "overview.webp"));
  } catch (error) {
    throw new Error(`Could not build the ${mapId} overview.`, { cause: error });
  }
}

console.log(`Built overview images for ${mapDirectories.length} maps.`);
