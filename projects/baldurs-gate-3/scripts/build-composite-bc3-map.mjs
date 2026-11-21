import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Layer files are temporary. Do not retain Windows input handles past stitching.
sharp.cache(false);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const buildBc3Script = path.join(scriptDirectory, "build-bc3-map.mjs");
const buildRasterScript = path.join(scriptDirectory, "build-raster-map.mjs");

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    result.set(key.slice(2), value);
  }
  for (const required of ["layers", "output", "display-name"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}.`);
  }
  return result;
};

const runNodeScript = (script, arguments_) => {
  const result = spawnSync(process.execPath, [script, ...arguments_], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${path.basename(script)} failed.`);
  }
  return result.stdout;
};

const stitchLevelZero = async (directory, metadata) => {
  const width = metadata.bounds.maxX - metadata.bounds.minX;
  const height = metadata.bounds.maxY - metadata.bounds.minY;
  const tileSize = metadata.tileSize;
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push({
        input: path.join(directory, "tiles", "0", `tile${column}x${row}.webp`),
        left: column * tileSize,
        top: row * tileSize,
      });
    }
  }
  return sharp({
    create: {
      width: columns * tileSize,
      height: rows * tileSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles)
    .extract({ left: 0, top: 0, width, height })
    .png()
    .toBuffer();
};

const main = async () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const layers = JSON.parse(arguments_.get("layers"));
  if (!Array.isArray(layers) || layers.length < 2) {
    throw new Error("--layers must contain at least two BC3 source layers.");
  }
  const pixelsPerWorldUnit = Number(arguments_.get("pixels-per-world-unit") ?? 20);
  if (!Number.isFinite(pixelsPerWorldUnit) || pixelsPerWorldUnit <= 0) {
    throw new Error("--pixels-per-world-unit must be a positive finite number.");
  }
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bg3-map-composite-"));
  try {
    const preparedLayers = [];
    for (const [index, layer] of layers.entries()) {
      const layerDirectory = path.join(temporaryRoot, `layer-${index}`);
      const bounds = layer.worldBounds;
      if (!bounds || ![bounds.centerX, bounds.centerY, bounds.width, bounds.height].every(Number.isFinite)) {
        throw new Error(`Layer ${index} has invalid world bounds.`);
      }
      runNodeScript(buildBc3Script, [
        "--source", path.resolve(layer.source),
        "--output", layerDirectory,
        "--display-name", `Composite layer ${index + 1}`,
        "--world-x", String(bounds.centerX),
        "--world-y", String(bounds.centerY),
        "--world-width", String(bounds.width),
        "--world-height", String(bounds.height),
        "--world-origin", "center",
        "--flip-y", String(layer.flipY ?? true),
        "--crop-content", String(layer.cropContent ?? true),
        "--content-padding", String(layer.contentPadding ?? 64),
        "--max-level", "0",
        "--lossless-output", "true",
        ...(layer.expectedSourceSize ? ["--expected-source-width", String(layer.expectedSourceSize.width),
          "--expected-source-height", String(layer.expectedSourceSize.height)] : []),
      ]);
      const metadata = JSON.parse(fs.readFileSync(path.join(layerDirectory, "metadata.json"), "utf8"));
      preparedLayers.push({
        image: await stitchLevelZero(layerDirectory, metadata),
        metadata,
      });
    }

    const worldBounds = preparedLayers.map(({ metadata }) => metadata.coordinateReference.worldBounds);
    const union = {
      x: Math.min(...worldBounds.map((bounds) => bounds.x)),
      y: Math.min(...worldBounds.map((bounds) => bounds.y)),
    };
    const maxX = Math.max(...worldBounds.map((bounds) => bounds.x + bounds.width));
    const maxY = Math.max(...worldBounds.map((bounds) => bounds.y + bounds.height));
    union.width = maxX - union.x;
    union.height = maxY - union.y;
    const canvasWidth = Math.ceil(union.width * pixelsPerWorldUnit);
    const canvasHeight = Math.ceil(union.height * pixelsPerWorldUnit);
    const composites = [];
    for (const { image, metadata } of preparedLayers) {
      const bounds = metadata.coordinateReference.worldBounds;
      const width = Math.max(1, Math.round(bounds.width * pixelsPerWorldUnit));
      const height = Math.max(1, Math.round(bounds.height * pixelsPerWorldUnit));
      composites.push({
        // Both dimensions come from the authored world rectangle. Preserve
        // its complete extent; the default cover fit crops rounded edges.
        input: await sharp(image).resize(width, height, { kernel: "lanczos3", fit: "fill" }).png().toBuffer(),
        left: Math.round((bounds.x - union.x) * pixelsPerWorldUnit),
        top: Math.round((maxY - (bounds.y + bounds.height)) * pixelsPerWorldUnit),
      });
    }
    const compositePath = path.join(temporaryRoot, "composite.png");
    await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite(composites).png().toFile(compositePath);

    const rasterOutput = runNodeScript(buildRasterScript, [
      "--source", compositePath,
      "--output", path.resolve(arguments_.get("output")),
      "--display-name", arguments_.get("display-name"),
      "--description", arguments_.get("description") ?? "",
      "--generated-at", arguments_.get("generated-at") ?? "",
      "--source-build", arguments_.get("source-build") ?? "",
      "--world-x", String(union.x),
      "--world-y", String(union.y),
      "--world-width", String(union.width),
      "--world-height", String(union.height),
      "--world-origin", "minimum",
      "--flip-y", "true",
      "--location-sources", "locations.json",
      "--content-source", "content.json",
      ...["logical-width", "logical-height", "coordinate-frame"].flatMap((name) => arguments_.has(name) ? [`--${name}`, arguments_.get(name)] : []),
      "--native-dimensions-verified", String(preparedLayers.every(({ metadata }) => metadata.rasterEncoding.nativeDimensionsVerified)),
    ]);
    process.stdout.write(rasterOutput);
    console.log(`Composite BC3 map: ${preparedLayers.length} layers over ${union.width.toFixed(3)}x${union.height.toFixed(3)} world units.`);
  } finally {
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (path.dirname(resolvedTemporaryRoot) !== path.resolve(os.tmpdir())
      || !path.basename(resolvedTemporaryRoot).startsWith("bg3-map-composite-")) {
      throw new Error(`Refusing to remove unexpected temporary path: ${resolvedTemporaryRoot}`);
    }
    fs.rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error("Composite BC3 map build failed:", error);
  process.exitCode = 1;
});
