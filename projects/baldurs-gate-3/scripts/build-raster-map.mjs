import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { MAP_WEBP_OPTIONS } from "./lib/map-raster-encoding.mjs";
import { preserveCoordinateFrame, readRasterFrame } from "./lib/map-raster-frame.mjs";

const parseArguments = (arguments_) => {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    values.set(key.slice(2), value);
  }
  for (const required of ["source", "output", "display-name"]) {
    if (!values.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return values;
};

const readNumber = (arguments_, name, fallback) => {
  if (!arguments_.has(name)) return fallback;
  const value = Number(arguments_.get(name));
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a finite number.`);
  return value;
};

const main = async () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sourcePath = path.resolve(arguments_.get("source"));
  const outputDirectory = path.resolve(arguments_.get("output"));
  const tileSize = readNumber(arguments_, "tile-size", 256);
  if (!fs.existsSync(sourcePath)) throw new Error(`Source raster does not exist: ${sourcePath}`);
  if (!Number.isInteger(tileSize) || tileSize < 64) throw new Error("--tile-size must be an integer of at least 64.");

  const sourceMetadata = await sharp(sourcePath).metadata();
  const sourceWidth = sourceMetadata.width;
  const sourceHeight = sourceMetadata.height;
  if (!sourceWidth || !sourceHeight) throw new Error(`Could not read raster dimensions: ${sourcePath}`);
  const frame = readRasterFrame(arguments_, sourceWidth, sourceHeight);
  const maximumLevel = Math.ceil(Math.log2(Math.max(sourceWidth, sourceHeight) / tileSize));
  const detailLevels = Array.from({ length: maximumLevel + 1 }, (_, level) => level);
  const tileRoot = path.join(outputDirectory, "tiles");
  if (path.dirname(tileRoot) !== outputDirectory || path.basename(tileRoot) !== "tiles") {
    throw new Error(`Refusing to replace an unexpected tile path: ${tileRoot}`);
  }
  fs.rmSync(tileRoot, { recursive: true, force: true });
  fs.mkdirSync(tileRoot, { recursive: true });

  const sourcePixels = await sharp(sourcePath).ensureAlpha().raw().toBuffer();
  let tileCount = 0;
  for (const level of detailLevels) {
    const scale = 2 ** level;
    const width = Math.max(1, Math.ceil(sourceWidth / scale));
    const height = Math.max(1, Math.ceil(sourceHeight / scale));
    const columns = Math.ceil(width / tileSize);
    const rows = Math.ceil(height / tileSize);
    const paddedWidth = columns * tileSize;
    const paddedHeight = rows * tileSize;
    const levelDirectory = path.join(tileRoot, String(level));
    fs.mkdirSync(levelDirectory, { recursive: true });
    // Each level pixel spans exactly 2 ** level source pixels in the viewer.
    // Materialize right/bottom padding first: Sharp extends after resizing.
    const gridWidth = width * scale;
    const gridHeight = height * scale;
    const grid = gridWidth === sourceWidth && gridHeight === sourceHeight
      ? sourcePixels
      : await sharp(sourcePixels, { raw: { width: sourceWidth, height: sourceHeight, channels: 4 } })
        .extend({ right: gridWidth - sourceWidth, bottom: gridHeight - sourceHeight,
          background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .raw().toBuffer();
    const { data, info } = await sharp(grid, { raw: { width: gridWidth, height: gridHeight, channels: 4 } })
      .resize(width, height, { kernel: "lanczos3", fit: "fill" })
      .extend({
        right: paddedWidth - width,
        bottom: paddedHeight - height,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        await sharp(data, {
          raw: { width: info.width, height: info.height, channels: info.channels },
        })
          .extract({
            left: column * tileSize,
            top: row * tileSize,
            width: tileSize,
            height: tileSize,
          })
          .webp(MAP_WEBP_OPTIONS)
          .toFile(path.join(levelDirectory, `tile${column}x${row}.webp`));
        tileCount += 1;
      }
    }
    console.log(`Level ${level}: ${columns}x${rows} tiles.`);
  }

  const hasWorldBounds = ["world-x", "world-y", "world-width", "world-height"]
    .every((name) => arguments_.has(name));
  const worldWidth = hasWorldBounds ? readNumber(arguments_, "world-width") : undefined;
  const worldHeight = hasWorldBounds ? readNumber(arguments_, "world-height") : undefined;
  const worldOrigin = arguments_.get("world-origin") ?? "minimum";
  if (!new Set(["minimum", "center"]).has(worldOrigin)) {
    throw new Error("--world-origin must be minimum or center.");
  }
  const worldX = hasWorldBounds ? readNumber(arguments_, "world-x") : undefined;
  const worldY = hasWorldBounds ? readNumber(arguments_, "world-y") : undefined;
  const coordinateReference = hasWorldBounds ? {
    worldBounds: {
      x: worldOrigin === "center" ? worldX - worldWidth / 2 : worldX,
      y: worldOrigin === "center" ? worldY - worldHeight / 2 : worldY,
      width: worldWidth,
      height: worldHeight,
    },
    imageBounds: { x: 0, y: 0, width: frame.width, height: frame.height },
    flipY: arguments_.get("flip-y") === "true",
  } : undefined;
  const metadata = {
    schemaVersion: 2,
    displayName: arguments_.get("display-name"),
    description: arguments_.get("description") ?? undefined,
    generatedAt: arguments_.get("generated-at") ?? undefined,
    attribution: arguments_.get("attribution") ?? undefined,
    sourceBuild: arguments_.get("source-build") ?? undefined,
    rasterEncoding: { format: "webp", ...MAP_WEBP_OPTIONS, intermediate: "source-raster",
      nativeDimensionsVerified: arguments_.get("native-dimensions-verified") === "true" },
    bounds: { minX: 0, minY: 0, maxX: frame.width, maxY: frame.height },
    ...(frame.tileImageSize ? { tileImageSize: frame.tileImageSize } : {}),
    coordinateReference,
    ...preserveCoordinateFrame(coordinateReference, JSON.parse(arguments_.get("coordinate-frame") ?? "null"), sourceWidth, sourceHeight),
    tileSize,
    detailLevels,
    tilePattern: "tiles/{level}/tile{x}x{y}.webp",
    locationSources: (arguments_.get("location-sources") ?? "")
      .split(",")
      .map((source) => source.trim())
      .filter(Boolean),
    contentSource: arguments_.get("content-source") ?? undefined,
    regions: [],
    locations: [],
  };
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Raster map: ${tileCount} tiles from ${sourceWidth}x${sourceHeight}.`);
};

main().catch((error) => {
  console.error("Raster map build failed:", error);
  process.exit(1);
});
