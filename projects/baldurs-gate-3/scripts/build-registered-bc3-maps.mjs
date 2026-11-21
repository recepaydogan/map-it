import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");

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
  return result;
};

const arguments_ = parseArguments(process.argv.slice(2));
const configPath = path.resolve(projectRoot, arguments_.get("config") ?? "map-sources/config/bc3-maps.json");
const concurrency = Number(arguments_.get("concurrency") ?? 2);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
  throw new Error("--concurrency must be an integer from 1 through 4.");
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const nativeTextureCatalog = config.nativeTextureCatalog
  ? new Map(JSON.parse(fs.readFileSync(path.resolve(projectRoot, config.nativeTextureCatalog), "utf8")).textures
    .map((texture) => [texture.textureName, texture])) : null;
const nativeSize = (source) => {
  if (!nativeTextureCatalog) return null;
  const id = /([0-9a-f]{32})_0\.dds$/i.exec(source)?.[1];
  const texture = nativeTextureCatalog.get(id);
  if (!texture) throw new Error(`No original texture descriptor for ${source}`);
  return { width: texture.width, height: texture.height };
};
if (!Array.isArray(config.maps) || config.maps.length === 0) {
  throw new Error("The BC3 build config needs a non-empty maps array.");
}

const requestedMapIds = new Set((arguments_.get("maps") ?? "")
  .split(",")
  .map((mapId) => mapId.trim())
  .filter(Boolean));
const maps = requestedMapIds.size > 0
  ? config.maps.filter((map) => requestedMapIds.has(map.id))
  : config.maps;
if (requestedMapIds.size > 0 && maps.length !== requestedMapIds.size) {
  const knownIds = new Set(config.maps.map((map) => map.id));
  const unknownIds = [...requestedMapIds].filter((mapId) => !knownIds.has(mapId));
  throw new Error(`Unknown configured map ids: ${unknownIds.join(", ")}.`);
}

const publicMapRoot = path.resolve(projectRoot, "public", "maps");
const sourceRoot = path.resolve(projectRoot, "map-sources");
const buildScript = path.join(scriptDirectory, "build-bc3-map.mjs");
const compositeBuildScript = path.join(scriptDirectory, "build-composite-bc3-map.mjs");
const isWithin = (child, parent) => child.startsWith(`${parent}${path.sep}`);
const outputRoot = arguments_.has("output-root") ? path.resolve(projectRoot, arguments_.get("output-root")) : publicMapRoot;
if (outputRoot !== publicMapRoot && !isWithin(outputRoot, sourceRoot)) {
  throw new Error("Staged map outputs must remain inside map-sources.");
}

const buildMap = (map) => new Promise((resolve, reject) => {
  const outputPath = path.resolve(outputRoot, map.id);
  if (!isWithin(outputPath, outputRoot)) {
    reject(new Error(`Refusing output outside the selected map root for ${map.id}: ${outputPath}`));
    return;
  }

  const commonArguments = [
    "--output", outputPath,
    "--display-name", map.displayName,
    "--description", map.description,
    "--generated-at", map.generatedAt ?? config.generatedAt,
    "--source-build", map.sourceBuild ?? config.sourceBuild,
    "--location-sources", "locations.json",
    "--content-source", "content.json",
  ];
  if (map.logicalSize) commonArguments.push("--logical-width", String(map.logicalSize.width), "--logical-height", String(map.logicalSize.height));
  const currentMetadata = path.join(publicMapRoot, map.id, "metadata.json");
  if (fs.existsSync(currentMetadata)) {
    const currentReference = JSON.parse(fs.readFileSync(currentMetadata, "utf8")).coordinateReference;
    if (currentReference) commonArguments.push("--coordinate-frame", JSON.stringify(currentReference));
  }
  let childArguments;
  if (Array.isArray(map.layers)) {
    const layers = map.layers.map((layer) => ({
      ...layer,
      source: path.resolve(projectRoot, layer.source),
      expectedSourceSize: nativeSize(layer.source),
    }));
    const invalidSource = layers.find(({ source }) => !isWithin(source, sourceRoot));
    if (invalidSource) {
      reject(new Error(`Refusing composite source outside map-sources for ${map.id}: ${invalidSource.source}`));
      return;
    }
    childArguments = [
      compositeBuildScript,
      "--layers", JSON.stringify(layers),
      "--pixels-per-world-unit", String(map.pixelsPerWorldUnit ?? 20),
      ...commonArguments,
    ];
  } else {
    const sourcePath = path.resolve(projectRoot, map.source);
    if (!isWithin(sourcePath, sourceRoot)) {
      reject(new Error(`Refusing source outside map-sources for ${map.id}: ${sourcePath}`));
      return;
    }
    childArguments = [
      buildScript,
      "--source", sourcePath,
      ...commonArguments,
      "--world-x", String(map.worldBounds.centerX),
      "--world-y", String(map.worldBounds.centerY),
      "--world-width", String(map.worldBounds.width),
      "--world-height", String(map.worldBounds.height),
      "--world-origin", "center",
      "--flip-y", String(map.flipY ?? config.flipY ?? true),
      "--crop-content", String(map.cropContent ?? config.cropContent ?? true),
      "--content-padding", String(map.contentPadding ?? config.contentPadding ?? 64),
      ...(map.sourceCrop ? ["--source-crop", JSON.stringify(map.sourceCrop)] : []),
      ...(nativeSize(map.source) ? ["--expected-source-width", String(nativeSize(map.source).width),
        "--expected-source-height", String(nativeSize(map.source).height)] : []),
    ];
  }

  const child = spawn(process.execPath, childArguments, {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errorOutput = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { errorOutput += chunk; });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code !== 0) {
      reject(new Error(`${map.id} BC3 build failed.\n${errorOutput || output}`));
      return;
    }
    process.stdout.write(`[${map.id}] ${output}`);
    resolve();
  });
});

let nextIndex = 0;
const workers = Array.from({ length: Math.min(concurrency, maps.length) }, async () => {
  while (nextIndex < maps.length) {
    const map = maps[nextIndex];
    nextIndex += 1;
    await buildMap(map);
  }
});

const results = await Promise.allSettled(workers);
const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
if (failures.length) throw new AggregateError(failures, `${failures.length} raster build worker(s) failed.`);
console.log(`BC3 tile pyramids rebuilt for ${maps.length} maps.`);
