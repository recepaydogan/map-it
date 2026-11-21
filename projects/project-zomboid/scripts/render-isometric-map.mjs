import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collapseCellsToRectangles,
  createIsometricSourceFingerprint,
  getCellRange,
  readGameCells,
  writeIsometricCatalog,
  writeStandaloneIsometricCatalog,
} from "./isometric-catalog.mjs";
import { readIsometricOutput } from "./isometric-output.mjs";

const RENDERER_REPOSITORY = "https://github.com/cff29546/pzmap2dzi.git";
const RENDERER_COMMIT = "6ceb95293e6a9247d17ed8873d3261ca8573fa65";
const PREVIEW_CELL_RANGE = [42, 38, 1, 1];
const PREVIEW_LAYER_RANGE = [0, 1];
const DEFAULT_GLOBAL_STORAGE_ESTIMATE_GB = 30;
const FREE_SPACE_RESERVE_GB = 25;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const defaultGameRoot = resolve(projectRoot, "..", "project-zomboid");
const cacheRoot = resolve(projectRoot, ".render-cache");
const rendererRoot = join(cacheRoot, "pzmap2dzi");
const defaultPublishedRoot = resolve(
  projectRoot,
  ".runtime-data",
  "map-data",
  "knox-country",
  "isometric-optimized",
);

const readArgument = (name) => {
  const prefix = `${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length);
};

const parseIntegerList = (value, fallback, expectedLength) => {
  if (!value) return fallback;
  const values = value.split(",").map((item) => Number(item.trim()));
  if (values.length !== expectedLength || values.some((item) => !Number.isInteger(item))) {
    throw new Error(`${expectedLength} comma-separated integers are required for ${value}.`);
  }
  return values;
};

const gameRoot = resolve(process.env.PZ_GAME_DIR || readArgument("--game-root") || defaultGameRoot);
const mapRoot = join(gameRoot, "media", "maps", "Muldraugh, KY");
const textureRoot = join(gameRoot, "media", "texturepacks");
const globalRender = process.argv.includes("--global");
const gameCells = globalRender ? readGameCells(mapRoot) : [];
const cellRanges = globalRender
  ? collapseCellsToRectangles(gameCells)
  : [parseIntegerList(readArgument("--cells"), PREVIEW_CELL_RANGE, 4)];
const cellRange = globalRender ? getCellRange(gameCells) : cellRanges[0];
const requestedLayers = readArgument("--layers");
const layerRange = globalRender && !requestedLayers
  ? [0, 1]
  : parseIntegerList(requestedLayers, PREVIEW_LAYER_RANGE, 2);
const omitLevels = Number(process.env.PZ_ISOMETRIC_OMIT_LEVELS || readArgument("--omit-levels") || 2);
if (!Number.isInteger(omitLevels) || omitLevels < 0) {
  throw new Error("PZ_ISOMETRIC_OMIT_LEVELS must be a non-negative integer.");
}
const packId = globalRender ? "global" : readArgument("--pack") ?? `cells-${cellRange.join("-")}`;
if (!/^[a-z0-9-]+$/.test(packId)) throw new Error(`Invalid isometric pack id: ${packId}.`);
const outputRoot = resolve(
  process.env.PZ_ISOMETRIC_OUTPUT_DIR
  || readArgument("--output-root")
  || join(cacheRoot, globalRender ? "isometric-global-output" : "isometric-output"),
);
const renderedRoot = join(outputRoot, "html", "map_data", "base");
const configuredPublishedRoot = resolve(
  process.env.PZ_ISOMETRIC_PUBLISH_DIR
  || readArgument("--publish-root")
  || defaultPublishedRoot,
);
const pythonCommand = process.env.PZ_RENDER_PYTHON || "python";
const publishOnly = process.argv.includes("--publish-only");
const freshRender = process.argv.includes("--fresh");
const planOnly = process.argv.includes("--plan");
const allowLowDisk = process.argv.includes("--allow-low-disk");
const publishInPlace = process.argv.includes("--publish-in-place");
if (publishInPlace && !globalRender) throw new Error("In-place publishing is only supported for global renders.");
const publishedRoot = publishInPlace
  ? renderedRoot
  : globalRender
    ? join(configuredPublishedRoot, "global")
    : join(configuredPublishedRoot, "packs", packId);
const workerCount = process.env.PZ_RENDER_WORKERS || readArgument("--workers") || "4";
if (workerCount !== "auto" && (!Number.isInteger(Number(workerCount)) || Number(workerCount) <= 0)) {
  throw new Error("PZ_RENDER_WORKERS must be 'auto' or a positive integer.");
}
const baseImageFormat = process.env.PZ_ISOMETRIC_BASE_FORMAT
  || readArgument("--base-format")
  || (globalRender ? "jpg" : "webp");
if (!new Set(["jpg", "webp"]).has(baseImageFormat)) {
  throw new Error("PZ_ISOMETRIC_BASE_FORMAT must be 'jpg' or 'webp'.");
}
const renderProfile = JSON.stringify({
  scope: globalRender ? "global" : "pack",
  layerRange: layerRange ?? "all",
  baseImageFormat,
  imageFormat: "webp",
  quality: 88,
  maximumDetailReduction: omitLevels,
});
const globalStorageEstimateGb = Number(
  process.env.PZ_GLOBAL_RENDER_MIN_FREE_GB || DEFAULT_GLOBAL_STORAGE_ESTIMATE_GB,
);

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: options.cwd ?? projectRoot,
  env: process.env,
  stdio: "inherit",
});

const replaceRequired = (source, pattern, replacement, label) => {
  if (!pattern.test(source)) throw new Error(`Renderer configuration field was not found: ${label}.`);
  return source.replace(pattern, replacement);
};

const yamlPath = (path) => path.replaceAll("\\", "/");

const ensureRenderer = () => {
  mkdirSync(cacheRoot, { recursive: true });
  if (!existsSync(join(rendererRoot, ".git"))) {
    run("git", ["clone", "--no-tags", RENDERER_REPOSITORY, rendererRoot]);
  }
  run("git", ["fetch", "--depth", "1", "origin", RENDERER_COMMIT], { cwd: rendererRoot });
  run("git", ["checkout", "--detach", RENDERER_COMMIT], { cwd: rendererRoot });
};

const ensurePythonEnvironment = () => {
  const virtualPython = join(rendererRoot, ".venv", "Scripts", "python.exe");
  const readyMarker = join(rendererRoot, ".venv", ".pzmap-ready");
  if (!existsSync(virtualPython)) run(pythonCommand, ["-m", "venv", join(rendererRoot, ".venv")]);
  if (!existsSync(readyMarker)) {
    run(virtualPython, ["-m", "pip", "install", "--disable-pip-version-check", "-r", join(rendererRoot, "requirements.txt")]);
    writeFileSync(readyMarker, `${RENDERER_COMMIT}\n`);
  }
  return virtualPython;
};

const writeRendererConfiguration = () => {
  const templatePath = join(rendererRoot, "conf", "conf.yaml");
  const generatedPath = join(rendererRoot, "conf", "pzim-generated.yaml");
  const cellRangesYaml = cellRanges.map((range) => `        - [${range.join(", ")}]`).join("\n");
  let configuration = readFileSync(templatePath, "utf8");

  configuration = replaceRequired(
    configuration,
    /^(pz_root:\s*\|-.*\r?\n)\s+.*$/m,
    `$1    ${yamlPath(gameRoot)}`,
    "pz_root",
  );
  configuration = replaceRequired(
    configuration,
    /^(output_root:\s*\|-.*\r?\n)\s+.*$/m,
    `$1    ${yamlPath(outputRoot)}`,
    "output_root",
  );
  configuration = replaceRequired(configuration, /^use_depend_texture_only:\s*false$/m, "use_depend_texture_only: true", "use_depend_texture_only");
  configuration = replaceRequired(configuration, /^\s+worker_count:\s*auto$/m, `    worker_count: ${workerCount}`, "worker_count");
  if (layerRange) {
    configuration = replaceRequired(
      configuration,
      /^\s+layer_range:\s*all$/m,
      `    layer_range: [${layerRange.join(", ")}]`,
      "layer_range",
    );
  }
  configuration = replaceRequired(
    configuration,
    /^\s+dzi_cell_range\[default\]:\s*all_mod_maps$/m,
    `    dzi_cell_range[default]:\n${cellRangesYaml}`,
    "dzi_cell_range",
  );
  configuration = replaceRequired(
    configuration,
    /^\s+render_cell_range:\s*all$/m,
    `    render_cell_range:\n${cellRangesYaml}`,
    "render_cell_range",
  );
  configuration = replaceRequired(configuration, /^\s+enable_cache:\s*false$/m, "    enable_cache: true", "enable_cache");
  configuration = replaceRequired(
    configuration,
    /^\s+image_fmt_base_layer0:\s*jpg$/m,
    `    image_fmt_base_layer0: ${baseImageFormat}`,
    "image_fmt_base_layer0",
  );
  configuration = replaceRequired(
    configuration,
    /^\s+image_save_options:\s*\{\}$/m,
    "    image_save_options:\n        jpg: {quality: 88}\n        webp: {quality: 88, method: 2}",
    "image_save_options",
  );
  configuration = replaceRequired(
    configuration,
    /^\s+omit_levels:\s*0$/m,
    `    omit_levels: ${omitLevels}`,
    "omit_levels",
  );

  writeFileSync(generatedPath, configuration);
  return generatedPath;
};

const publishOutput = () => {
  if (!existsSync(join(renderedRoot, "map_info.json"))) {
    throw new Error(`The renderer did not produce a base map at ${renderedRoot}.`);
  }
  if (!publishInPlace) {
    if (!publishedRoot.startsWith(`${configuredPublishedRoot}\\`)) {
      throw new Error(`Unsafe isometric publish path: ${publishedRoot}.`);
    }
    rmSync(publishedRoot, { recursive: true, force: true });
    mkdirSync(dirname(publishedRoot), { recursive: true });
    cpSync(renderedRoot, publishedRoot, { recursive: true });
  }

  const { mapInfo, floors } = readIsometricOutput(publishedRoot);

  const renderManifest = {
    id: packId,
    scope: globalRender ? "global" : "preview",
    renderer: "pzmap2dzi",
    rendererCommit: RENDERER_COMMIT,
    sourceFingerprint,
    renderProfile: JSON.parse(renderProfile),
    generatedAt: new Date().toISOString(),
    cellRange,
    layerRange: layerRange ?? [mapInfo.minlayer, mapInfo.maxlayer],
    complete: globalRender,
    mapInfo: { ...mapInfo, scale: mapInfo.scale ?? 1 },
    floors,
  };
  writeFileSync(join(publishedRoot, "manifest.json"), `${JSON.stringify(renderManifest, null, 2)}\n`);
  if (publishInPlace) writeStandaloneIsometricCatalog({ publishedRoot, mapRoot, manifest: renderManifest });
  else writeIsometricCatalog({ publishedRoot: configuredPublishedRoot, mapRoot });
};

for (const requiredPath of [mapRoot, textureRoot]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Project Zomboid render source was not found: ${requiredPath}.`);
  }
}

const sourceFingerprint = process.env.PZ_ISOMETRIC_SOURCE_FINGERPRINT || createIsometricSourceFingerprint({
  mapRoot,
  textureRoot,
  rendererCommit: RENDERER_COMMIT,
  renderProfile,
});

if (planOnly) {
  mkdirSync(outputRoot, { recursive: true });
  const disk = statfsSync(outputRoot, { bigint: true });
  const freeSpaceGb = Number(disk.bavail * disk.bsize) / 1024 ** 3;
  console.log(JSON.stringify({
    scope: globalRender ? "global" : "preview",
    gameRoot,
    outputRoot,
    publishedRoot,
    publishMode: publishInPlace ? "in-place" : "copy",
    totalCells: globalRender ? gameCells.length : cellRange[2] * cellRange[3],
    cellRange,
    cellRanges,
    layerRange: layerRange ?? "all",
    freeSpaceGb: Math.round(freeSpaceGb * 10) / 10,
    estimatedStorageGb: globalRender ? globalStorageEstimateGb : null,
    reserveGb: FREE_SPACE_RESERVE_GB,
    workerCount,
    baseImageFormat,
    omitLevels,
    sourceFingerprint,
    readyToRender: !globalRender || freeSpaceGb >= globalStorageEstimateGb + FREE_SPACE_RESERVE_GB,
  }, null, 2));
  process.exit(0);
}

if (globalRender && !publishOnly && !allowLowDisk) {
  if (!Number.isFinite(globalStorageEstimateGb) || globalStorageEstimateGb <= 0) {
    throw new Error("PZ_GLOBAL_RENDER_MIN_FREE_GB must be a positive number.");
  }
  mkdirSync(outputRoot, { recursive: true });
  const disk = statfsSync(outputRoot, { bigint: true });
  const freeSpaceGb = Number(disk.bavail * disk.bsize) / 1024 ** 3;
  const requiredSpaceGb = globalStorageEstimateGb + FREE_SPACE_RESERVE_GB;
  if (freeSpaceGb < requiredSpaceGb) {
    throw new Error(
      `Global render requires about ${globalStorageEstimateGb} GB plus a ${FREE_SPACE_RESERVE_GB} GB reserve, but only ${freeSpaceGb.toFixed(1)} GB is free at ${outputRoot}. Set PZ_ISOMETRIC_OUTPUT_DIR to a larger drive or remote volume.`,
    );
  }
}

ensureRenderer();
if (publishOnly) {
  publishOutput();
  console.log(`Published the existing isometric render to ${publishedRoot}.`);
  process.exit(0);
}
const virtualPython = ensurePythonEnvironment();
const configurationPath = writeRendererConfiguration();
if (freshRender) {
  if (!renderedRoot.startsWith(`${outputRoot}\\`)) {
    throw new Error(`Unsafe isometric render output path: ${renderedRoot}.`);
  }
  rmSync(renderedRoot, { recursive: true, force: true });
}
mkdirSync(outputRoot, { recursive: true });
run(virtualPython, ["main.py", "-c", configurationPath, "unpack"], { cwd: rendererRoot });
run(virtualPython, ["main.py", "-c", configurationPath, "render", "base"], { cwd: rendererRoot });
publishOutput();

console.log(`Published isometric cells ${cellRange.join(",")} and layers ${layerRange?.join(",") ?? "all"} to ${publishedRoot}.`);
