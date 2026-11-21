import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LOSSLESS_WEBP_OPTIONS, MAP_WEBP_OPTIONS } from "./lib/map-raster-encoding.mjs";
import { preserveCoordinateFrame, readRasterFrame, readSourceCrop } from "./lib/map-raster-frame.mjs";

const TILE_SIZE = 256;
const DDS_MAGIC = 0x20534444;
const DXT5_FOUR_CC = 0x35545844;

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

const expandRgb565 = (value) => ({
  r: Math.round(((value >> 11) & 0x1f) * 255 / 31),
  g: Math.round(((value >> 5) & 0x3f) * 255 / 63),
  b: Math.round((value & 0x1f) * 255 / 31),
});

const interpolate = (left, right, leftWeight, divisor) =>
  Math.round((left * leftWeight + right * (divisor - leftWeight)) / divisor);

const decodeBc3Block = (block, target, targetWidth, targetHeight, originX, originY) => {
  const alpha = [block[0], block[1]];
  if (alpha[0] > alpha[1]) {
    for (let index = 1; index <= 6; index += 1) {
      alpha.push(interpolate(alpha[0], alpha[1], 7 - index, 7));
    }
  } else {
    for (let index = 1; index <= 4; index += 1) {
      alpha.push(interpolate(alpha[0], alpha[1], 5 - index, 5));
    }
    alpha.push(0, 255);
  }
  let alphaIndices = 0n;
  for (let index = 0; index < 6; index += 1) {
    alphaIndices |= BigInt(block[2 + index]) << BigInt(index * 8);
  }

  const color0 = expandRgb565(block.readUInt16LE(8));
  const color1 = expandRgb565(block.readUInt16LE(10));
  const colors = [
    color0,
    color1,
    {
      r: interpolate(color0.r, color1.r, 2, 3),
      g: interpolate(color0.g, color1.g, 2, 3),
      b: interpolate(color0.b, color1.b, 2, 3),
    },
    {
      r: interpolate(color0.r, color1.r, 1, 3),
      g: interpolate(color0.g, color1.g, 1, 3),
      b: interpolate(color0.b, color1.b, 1, 3),
    },
  ];
  const colorIndices = block.readUInt32LE(12);

  for (let pixel = 0; pixel < 16; pixel += 1) {
    const localX = pixel % 4;
    const localY = Math.floor(pixel / 4);
    const x = originX + localX;
    const y = originY + localY;
    if (x >= targetWidth || y >= targetHeight) continue;
    const color = colors[(colorIndices >> (pixel * 2)) & 0x3];
    const alphaIndex = Number((alphaIndices >> BigInt(pixel * 3)) & 0x7n);
    const offset = (y * TILE_SIZE + x) * 4;
    target[offset] = color.r;
    target[offset + 1] = color.g;
    target[offset + 2] = color.b;
    target[offset + 3] = alpha[alphaIndex];
  }
};

const buildAlphaPalette = (block) => {
  const alpha = [block[0], block[1]];
  if (alpha[0] > alpha[1]) {
    for (let index = 1; index <= 6; index += 1) alpha.push(interpolate(alpha[0], alpha[1], 7 - index, 7));
  } else {
    for (let index = 1; index <= 4; index += 1) alpha.push(interpolate(alpha[0], alpha[1], 5 - index, 5));
    alpha.push(0, 255);
  }
  return alpha;
};

const scanVisibleBounds = (fileDescriptor, header) => {
  const blockColumns = Math.ceil(header.width / 4);
  const blockRows = Math.ceil(header.height / 4);
  const row = Buffer.alloc(blockColumns * 16);
  let minX = header.width;
  let minY = header.height;
  let maxX = -1;
  let maxY = -1;
  for (let blockY = 0; blockY < blockRows; blockY += 1) {
    fs.readSync(fileDescriptor, row, 0, row.length, header.dataOffset + blockY * row.length);
    for (let blockX = 0; blockX < blockColumns; blockX += 1) {
      const block = row.subarray(blockX * 16, blockX * 16 + 16);
      const alpha = buildAlphaPalette(block);
      const color0 = expandRgb565(block.readUInt16LE(8));
      const color1 = expandRgb565(block.readUInt16LE(10));
      const colors = [
        color0,
        color1,
        {
          r: interpolate(color0.r, color1.r, 2, 3),
          g: interpolate(color0.g, color1.g, 2, 3),
          b: interpolate(color0.b, color1.b, 2, 3),
        },
        {
          r: interpolate(color0.r, color1.r, 1, 3),
          g: interpolate(color0.g, color1.g, 1, 3),
          b: interpolate(color0.b, color1.b, 1, 3),
        },
      ];
      const colorIndices = block.readUInt32LE(12);
      let alphaIndices = 0n;
      for (let index = 0; index < 6; index += 1) alphaIndices |= BigInt(block[2 + index]) << BigInt(index * 8);
      for (let pixel = 0; pixel < 16; pixel += 1) {
        const alphaIndex = Number((alphaIndices >> BigInt(pixel * 3)) & 0x7n);
        if (alpha[alphaIndex] === 0) continue;
        const color = colors[(colorIndices >> (pixel * 2)) & 0x3];
        if (Math.max(color.r, color.g, color.b) <= 3) continue;
        const x = blockX * 4 + pixel % 4;
        const y = blockY * 4 + Math.floor(pixel / 4);
        if (x >= header.width || y >= header.height) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("DDS contains no visible alpha pixels.");
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
};

const paddedBlockCrop = (bounds, header, padding) => {
  const minX = Math.max(0, Math.floor((bounds.x - padding) / 4) * 4);
  const minY = Math.max(0, Math.floor((bounds.y - padding) / 4) * 4);
  const maxX = Math.min(header.width, Math.ceil((bounds.x + bounds.width + padding) / 4) * 4);
  const maxY = Math.min(header.height, Math.ceil((bounds.y + bounds.height + padding) / 4) * 4);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const readDdsHeader = (fileDescriptor) => {
  const header = Buffer.alloc(148);
  const bytesRead = fs.readSync(fileDescriptor, header, 0, header.length, 0);
  if (bytesRead < 128 || header.readUInt32LE(0) !== DDS_MAGIC || header.readUInt32LE(4) !== 124) {
    throw new Error("Source is not a supported DDS file.");
  }
  const fourCc = header.readUInt32LE(84);
  if (fourCc !== DXT5_FOUR_CC) {
    throw new Error(`Only BC3/DXT5 DDS is supported; found FourCC 0x${fourCc.toString(16)}.`);
  }
  return {
    width: header.readUInt32LE(16),
    height: header.readUInt32LE(12),
    dataOffset: 128,
  };
};

const writeLevelZero = async (fileDescriptor, header, crop, levelDirectory) => {
  const blockColumns = Math.ceil(header.width / 4);
  const columns = Math.ceil(crop.width / TILE_SIZE);
  const rows = Math.ceil(crop.height / TILE_SIZE);
  const block = Buffer.alloc(16);
  for (let tileY = 0; tileY < rows; tileY += 1) {
    for (let tileX = 0; tileX < columns; tileX += 1) {
      const tileWidth = Math.min(TILE_SIZE, crop.width - tileX * TILE_SIZE);
      const tileHeight = Math.min(TILE_SIZE, crop.height - tileY * TILE_SIZE);
      const target = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
      const tileBlockColumns = Math.ceil(tileWidth / 4);
      const tileBlockRows = Math.ceil(tileHeight / 4);
      const sourceBlockX = (crop.x + tileX * TILE_SIZE) / 4;
      const sourceBlockY = (crop.y + tileY * TILE_SIZE) / 4;
      for (let blockY = 0; blockY < tileBlockRows; blockY += 1) {
        for (let blockX = 0; blockX < tileBlockColumns; blockX += 1) {
          const sourceIndex = (sourceBlockY + blockY) * blockColumns + sourceBlockX + blockX;
          fs.readSync(fileDescriptor, block, 0, block.length, header.dataOffset + sourceIndex * 16);
          decodeBc3Block(block, target, tileWidth, tileHeight, blockX * 4, blockY * 4);
        }
      }
      await sharp(target, { raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 } })
        .webp(LOSSLESS_WEBP_OPTIONS)
        .toFile(path.join(levelDirectory, `tile${tileX}x${tileY}.webp`));
    }
  }
  return { columns, rows };
};

const writeParentLevel = async (tileRoot, level, previousGrid) => {
  const levelDirectory = path.join(tileRoot, String(level));
  const previousDirectory = path.join(tileRoot, String(level - 1));
  fs.mkdirSync(levelDirectory, { recursive: true });
  const columns = Math.ceil(previousGrid.columns / 2);
  const rows = Math.ceil(previousGrid.rows / 2);
  for (let tileY = 0; tileY < rows; tileY += 1) {
    for (let tileX = 0; tileX < columns; tileX += 1) {
      const children = [];
      for (let childY = 0; childY < 2; childY += 1) {
        for (let childX = 0; childX < 2; childX += 1) {
          const sourceX = tileX * 2 + childX;
          const sourceY = tileY * 2 + childY;
          if (sourceX >= previousGrid.columns || sourceY >= previousGrid.rows) continue;
          children.push({
            input: path.join(previousDirectory, `tile${sourceX}x${sourceY}.webp`),
            left: childX * TILE_SIZE,
            top: childY * TILE_SIZE,
          });
        }
      }
      const combined = await sharp({
        create: { width: TILE_SIZE * 2, height: TILE_SIZE * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite(children)
        .png()
        .toBuffer();
      await sharp(combined)
        .resize(TILE_SIZE, TILE_SIZE, { kernel: "lanczos3" })
        .webp(LOSSLESS_WEBP_OPTIONS)
        .toFile(path.join(levelDirectory, `tile${tileX}x${tileY}.webp`));
    }
  }
  return { columns, rows };
};

const main = async () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sourcePath = path.resolve(arguments_.get("source"));
  const outputDirectory = path.resolve(arguments_.get("output"));
  if (!fs.existsSync(sourcePath)) throw new Error(`Source texture does not exist: ${sourcePath}`);
  const tileRoot = path.join(outputDirectory, "tiles");
  if (path.dirname(tileRoot) !== outputDirectory || path.basename(tileRoot) !== "tiles") {
    throw new Error(`Refusing to replace an unexpected tile path: ${tileRoot}`);
  }
  const reuseLevelZero = arguments_.get("reuse-level-zero") === "true";
  const losslessOutput = arguments_.get("lossless-output") === "true";
  if (reuseLevelZero && losslessOutput) throw new Error("Lossless source output cannot reuse an unverified encoded level zero.");
  const maximumLevel = readNumber(arguments_, "max-level", Number.POSITIVE_INFINITY);
  if (maximumLevel !== Number.POSITIVE_INFINITY && (!Number.isInteger(maximumLevel) || maximumLevel < 0)) {
    throw new Error("--max-level must be a non-negative integer.");
  }
  if (reuseLevelZero && !fs.existsSync(path.join(tileRoot, "0"))) {
    throw new Error("--reuse-level-zero requires an existing tiles/0 directory.");
  }

  const fileDescriptor = fs.openSync(sourcePath, "r");
  let header;
  let crop;
  let frame;
  let grid;
  try {
    header = readDdsHeader(fileDescriptor);
    if ((arguments_.has("expected-source-width") && header.width !== Number(arguments_.get("expected-source-width")))
      || (arguments_.has("expected-source-height") && header.height !== Number(arguments_.get("expected-source-height")))) {
      throw new Error(`Source DDS ${header.width}x${header.height} is not the complete native texture.`);
    }
    const fullCrop = { x: 0, y: 0, width: header.width, height: header.height };
    if (arguments_.has("source-crop") && arguments_.get("crop-content") === "true") throw new Error("Use either an explicit source crop or automatic content cropping.");
    crop = arguments_.has("source-crop") ? readSourceCrop(arguments_.get("source-crop"), header.width, header.height)
      : arguments_.get("crop-content") === "true"
      ? paddedBlockCrop(
        scanVisibleBounds(fileDescriptor, header),
        header,
        readNumber(arguments_, "content-padding", 256),
      )
      : fullCrop;
    frame = readRasterFrame(arguments_, crop.width, crop.height);
    // Validate source geometry before replacing an existing published pyramid.
    if (!reuseLevelZero) fs.rmSync(tileRoot, { recursive: true, force: true });
    fs.mkdirSync(path.join(tileRoot, "0"), { recursive: true });
    console.log(`Source crop: ${crop.x},${crop.y} ${crop.width}x${crop.height} from ${header.width}x${header.height}.`);
    const expectedGrid = {
      columns: Math.ceil(crop.width / TILE_SIZE),
      rows: Math.ceil(crop.height / TILE_SIZE),
    };
    if (reuseLevelZero) {
      const expectedTileCount = expectedGrid.columns * expectedGrid.rows;
      const actualTileCount = fs.readdirSync(path.join(tileRoot, "0"))
        .filter((name) => /^tile\d+x\d+\.webp$/.test(name)).length;
      if (actualTileCount !== expectedTileCount) {
        throw new Error(`Expected ${expectedTileCount} level-0 tiles, found ${actualTileCount}.`);
      }
      for (let level = 1; level <= 16; level += 1) {
        fs.rmSync(path.join(tileRoot, String(level)), { recursive: true, force: true });
      }
      grid = expectedGrid;
    } else {
      grid = await writeLevelZero(fileDescriptor, header, crop, path.join(tileRoot, "0"));
    }
  } finally {
    fs.closeSync(fileDescriptor);
  }
  console.log(`Level 0: ${grid.columns}x${grid.rows} tiles.`);
  const detailLevels = [0];
  while ((grid.columns > 1 || grid.rows > 1) && detailLevels.at(-1) < maximumLevel) {
    const level = detailLevels.length;
    grid = await writeParentLevel(tileRoot, level, grid);
    detailLevels.push(level);
    console.log(`Level ${level}: ${grid.columns}x${grid.rows} tiles.`);
  }

  // Finish every lower level before the final lossy encode. Otherwise each
  // parent inherits accumulated WebP damage from already-compressed children.
  if (!losslessOutput) {
    // Parent composites have finished; release libvips' cached input handles
    // before replacing their lossless working files on Windows.
    sharp.cache(false);
    for (const level of detailLevels) {
      if (reuseLevelZero && level === 0) continue;
      const directory = path.join(tileRoot, String(level));
      for (const filename of fs.readdirSync(directory).filter((name) => /^tile\d+x\d+\.webp$/.test(name))) {
        const output = path.join(directory, filename);
        await sharp(fs.readFileSync(output)).webp(MAP_WEBP_OPTIONS).toFile(output);
      }
    }
  }

  const hasWorldBounds = ["world-x", "world-y", "world-width", "world-height"]
    .every((name) => arguments_.has(name));
  const worldWidth = hasWorldBounds ? readNumber(arguments_, "world-width") : undefined;
  const worldHeight = hasWorldBounds ? readNumber(arguments_, "world-height") : undefined;
  const worldX = hasWorldBounds ? readNumber(arguments_, "world-x") : undefined;
  const worldY = hasWorldBounds ? readNumber(arguments_, "world-y") : undefined;
  const worldOrigin = arguments_.get("world-origin") ?? "minimum";
  if (!new Set(["minimum", "center"]).has(worldOrigin)) {
    throw new Error("--world-origin must be minimum or center.");
  }
  const fullWorldBounds = hasWorldBounds ? {
    x: worldOrigin === "center" ? worldX - worldWidth / 2 : worldX,
    y: worldOrigin === "center" ? worldY - worldHeight / 2 : worldY,
    width: worldWidth,
    height: worldHeight,
  } : undefined;
  const flipY = arguments_.get("flip-y") === "true";
  const coordinateReference = hasWorldBounds ? {
    worldBounds: {
      x: fullWorldBounds.x + crop.x / header.width * fullWorldBounds.width,
      y: fullWorldBounds.y + (flipY
        ? 1 - (crop.y + crop.height) / header.height
        : crop.y / header.height) * fullWorldBounds.height,
      width: crop.width / header.width * fullWorldBounds.width,
      height: crop.height / header.height * fullWorldBounds.height,
    },
    imageBounds: { x: 0, y: 0, width: frame.width, height: frame.height },
    flipY,
  } : undefined;
  const metadata = {
    schemaVersion: 2,
    displayName: arguments_.get("display-name"),
    description: arguments_.get("description") ?? undefined,
    generatedAt: arguments_.get("generated-at") ?? undefined,
    attribution: arguments_.get("attribution") ?? undefined,
    sourceBuild: arguments_.get("source-build") ?? undefined,
    rasterEncoding: { format: "webp", lossless: losslessOutput, ...(!losslessOutput ? MAP_WEBP_OPTIONS : {}),
      nativeDimensionsVerified: arguments_.has("expected-source-width") && arguments_.has("expected-source-height"),
      intermediate: "lossless", reusedLevelZero: reuseLevelZero },
    sourceTextureSize: { width: header.width, height: header.height },
    sourceImageBounds: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
    bounds: { minX: 0, minY: 0, maxX: frame.width, maxY: frame.height },
    ...(frame.tileImageSize ? { tileImageSize: frame.tileImageSize } : {}),
    coordinateReference,
    ...preserveCoordinateFrame(coordinateReference, JSON.parse(arguments_.get("coordinate-frame") ?? "null"), crop.width, crop.height),
    tileSize: TILE_SIZE,
    detailLevels,
    tilePattern: "tiles/{level}/tile{x}x{y}.webp",
    locationSources: (arguments_.get("location-sources") ?? "").split(",").map((source) => source.trim()).filter(Boolean),
    contentSource: arguments_.get("content-source") ?? undefined,
    regions: [],
    locations: [],
  };
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`BC3 map: ${crop.width}x${crop.height}, ${detailLevels.length} detail levels.`);
};

main().catch((error) => {
  console.error("BC3 map build failed:", error);
  process.exitCode = 1;
});
