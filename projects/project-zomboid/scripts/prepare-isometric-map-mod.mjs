import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collapseCellsToRectangles,
  createIsometricSourceFingerprintFromRoots,
  getCellRange,
  readGameCells,
} from "./isometric-catalog.mjs";
import { readIsometricOutput } from "./isometric-output.mjs";
import { writePreparedMapModCatalog } from "./prepared-map-mod-catalog.mjs";
import { patchRendererMapCoordinates, RENDERER_PATCH_VERSION } from "./isometric-renderer-patches.mjs";

const RENDERER_REPOSITORY = "https://github.com/cff29546/pzmap2dzi.git";
const RENDERER_COMMIT = "6ceb95293e6a9247d17ed8873d3261ca8573fa65";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const cacheRoot = resolve(projectRoot, ".render-cache");
const rendererRoot = join(cacheRoot, "pzmap2dzi");
const defaultGameRoot = resolve(projectRoot, "..", "project-zomboid");
const defaultPublishedRoot = resolve(projectRoot, ".runtime-data", "map-data", "knox-country", "isometric-mods");

const readArgument = (name) => {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

const readArguments = (name) => {
  const prefix = `${name}=`;
  return process.argv.filter((value) => value.startsWith(prefix)).map((value) => value.slice(prefix.length));
};

const statusFile = readArgument("--status-file");
let statusDetails = {};
const writeStatus = (stage, details = {}) => {
  if (!statusFile) return;
  statusDetails = { ...statusDetails, ...details };
  const destination = resolve(statusFile);
  const temporary = `${destination}.tmp`;
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify({
    schemaVersion: 1,
    stage,
    ...statusDetails,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  renameSync(temporary, destination);
};

process.on("uncaughtException", (error) => {
  try {
    writeStatus("failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } catch (statusError) {
    console.error("Failed to write map preparation status.", statusError);
  }
  console.error(error);
  process.exit(1);
});

const slugify = (value) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("en-US")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 80);

const yamlString = (value) => `'${value.replaceAll("'", "''").replaceAll("\\", "/")}'`;

const parseKeyValueFile = (content) => Object.fromEntries(content
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .map((line) => line.replace(/\s*\/\/.*$/, "").trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator).trim().toLocaleLowerCase("en-US"), line.slice(separator + 1).trim()];
  }));

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: options.cwd ?? projectRoot,
  env: process.env,
  stdio: "inherit",
});

const replaceRequired = (source, pattern, replacement, label) => {
  if (!pattern.test(source)) throw new Error(`Renderer configuration field was not found: ${label}.`);
  return source.replace(pattern, replacement);
};

const getVariants = (modRoot) => {
  const candidates = [{ root: modRoot, build: "41", rank: 0 }];
  for (const entry of readdirSync(modRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.toLocaleLowerCase("en-US") === "common") {
      candidates.push({ root: join(modRoot, entry.name), build: "common", rank: 1 });
    } else if (/^\d+(?:\.\d+)*$/.test(entry.name)) {
      candidates.push({ root: join(modRoot, entry.name), build: entry.name, rank: 100 + Number.parseFloat(entry.name) });
    }
  }
  return candidates
    .filter(({ root }) => existsSync(join(root, "media", "maps")))
    .sort((left, right) => right.rank - left.rank);
};

const resolveTextureRoot = (root) => {
  const direct = resolve(root);
  if (existsSync(join(direct, "media", "texturepacks"))) return join(direct, "media", "texturepacks");
  if (basename(direct).toLocaleLowerCase("en-US") === "texturepacks") return direct;
  throw new Error(`Texture dependency has no media/texturepacks folder: ${direct}.`);
};

const ensureRenderer = () => {
  mkdirSync(cacheRoot, { recursive: true });
  if (!existsSync(join(rendererRoot, ".git"))) run("git", ["clone", "--no-tags", RENDERER_REPOSITORY, rendererRoot]);
  run("git", ["fetch", "--depth", "1", "origin", RENDERER_COMMIT], { cwd: rendererRoot });
  run("git", ["checkout", "--detach", RENDERER_COMMIT], { cwd: rendererRoot });
  patchRendererMapCoordinates(rendererRoot);
};

const ensurePythonEnvironment = (pythonCommand) => {
  const virtualPython = join(rendererRoot, ".venv", "Scripts", "python.exe");
  const readyMarker = join(rendererRoot, ".venv", ".pzmap-ready");
  if (!existsSync(virtualPython)) run(pythonCommand, ["-m", "venv", join(rendererRoot, ".venv")]);
  if (!existsSync(readyMarker)) {
    run(virtualPython, ["-m", "pip", "install", "--disable-pip-version-check", "-r", join(rendererRoot, "requirements.txt")]);
    writeFileSync(readyMarker, `${RENDERER_COMMIT}\n`);
  }
  return virtualPython;
};

const gameRoot = resolve(process.env.PZ_GAME_DIR || readArgument("--game-root") || defaultGameRoot);
const modRoot = resolve(readArgument("--mod-root") || "");
if (!readArgument("--mod-root")) throw new Error("--mod-root=<path> is required.");
if (!existsSync(modRoot)) throw new Error(`Mod root does not exist: ${modRoot}.`);
const kind = readArgument("--kind") ?? "add-on";
if (kind !== "add-on" && kind !== "replacement") throw new Error("--kind must be add-on or replacement.");
const requestedMaps = readArguments("--map");
const variants = getVariants(modRoot);
if (variants.length === 0) throw new Error(`No Project Zomboid map folders were found under ${modRoot}.`);
const selectedMaps = [];
const seenMapNames = new Set();
for (const variant of variants) {
  const mapsRoot = join(variant.root, "media", "maps");
  for (const entry of readdirSync(mapsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || seenMapNames.has(entry.name.toLocaleLowerCase("en-US"))) continue;
    if (requestedMaps.length > 0 && !requestedMaps.some((name) => name.toLocaleLowerCase("en-US") === entry.name.toLocaleLowerCase("en-US"))) continue;
    const mapRoot = join(mapsRoot, entry.name);
    const cells = readGameCells(mapRoot);
    if (cells.length === 0) continue;
    selectedMaps.push({ name: entry.name, root: mapRoot, cells, build: variant.build, variantRoot: variant.root });
    seenMapNames.add(entry.name.toLocaleLowerCase("en-US"));
  }
}
if (selectedMaps.length === 0) throw new Error("None of the selected map folders contain .lotheader cells.");
if (requestedMaps.length > 0 && selectedMaps.length !== new Set(requestedMaps.map((name) => name.toLocaleLowerCase("en-US"))).size) {
  throw new Error("At least one requested --map folder was not found.");
}

const metadataPath = variants.map(({ root }) => join(root, "mod.info")).find(existsSync)
  ?? (existsSync(join(modRoot, "mod.info")) ? join(modRoot, "mod.info") : null);
const metadata = metadataPath ? parseKeyValueFile(readFileSync(metadataPath, "utf8")) : {};
const modId = readArgument("--mod-id") ?? metadata.id ?? basename(modRoot);
const displayName = readArgument("--display-name") ?? metadata.name ?? modId;
const workshopId = readArgument("--workshop-id");
const modKey = slugify(`${modId}${workshopId ? `-${workshopId}` : ""}`);
if (!modKey) throw new Error("The mod ID cannot be converted to a safe catalog key.");
const internalMaps = selectedMaps.map((map, index) => ({ ...map, id: `pzim-${modKey}-${index + 1}` }));
const ownTextureRoots = [...new Set(selectedMaps
  .map(({ variantRoot }) => join(variantRoot, "media", "texturepacks"))
  .filter(existsSync))];
const dependencyTextureRoots = readArguments("--dependency-root").map(resolveTextureRoot);
const textureRoots = [join(gameRoot, "media", "texturepacks"), ...ownTextureRoots, ...dependencyTextureRoots];
for (const requiredPath of [join(gameRoot, "media", "maps", "Muldraugh, KY"), textureRoots[0]]) {
  if (!existsSync(requiredPath)) throw new Error(`Project Zomboid render source was not found: ${requiredPath}.`);
}
const workerCount = process.env.PZ_RENDER_WORKERS || readArgument("--workers") || "4";
if (workerCount !== "auto" && (!Number.isInteger(Number(workerCount)) || Number(workerCount) <= 0)) {
  throw new Error("--workers must be auto or a positive integer.");
}
const layerRangeArgument = readArgument("--layers");
const layerRange = layerRangeArgument ? layerRangeArgument.split(",").map(Number) : null;
if (layerRange && (layerRange.length !== 2 || layerRange.some((value) => !Number.isInteger(value)))) {
  throw new Error("--layers must contain two comma-separated integers.");
}
const omitLevels = Number(readArgument("--omit-levels") ?? 1);
if (!Number.isInteger(omitLevels) || omitLevels < 0) throw new Error("--omit-levels must be a non-negative integer.");
const outputRoot = resolve(readArgument("--output-root") || join(cacheRoot, "isometric-mod-output", modKey));
const publishedRoot = resolve(readArgument("--publish-root") || defaultPublishedRoot);
const pythonCommand = process.env.PZ_RENDER_PYTHON || "python";
const planOnly = process.argv.includes("--plan");
const publishOnly = process.argv.includes("--publish-only");
const freshRender = process.argv.includes("--fresh");
if (publishOnly && freshRender) throw new Error("--publish-only cannot be combined with --fresh.");
const renderProfile = JSON.stringify({ kind, layerRange: layerRange ?? "all", imageFormat: "webp", quality: 88, omitLevels, rendererPatch: RENDERER_PATCH_VERSION });
const sourceFingerprint = createIsometricSourceFingerprintFromRoots({
  mapRoots: selectedMaps.map(({ root }) => root),
  textureRoots,
  rendererCommit: RENDERER_COMMIT,
  renderProfile,
});

const plan = {
  modKey,
  modId,
  displayName,
  workshopId: workshopId ?? null,
  kind,
  builds: [...new Set(selectedMaps.map(({ build }) => build))],
  maps: selectedMaps.map(({ name, cells }) => ({ name, cells: cells.length, cellRange: getCellRange(cells) })),
  totalCells: selectedMaps.reduce((total, { cells }) => total + cells.length, 0),
  dependencyTextureRoots,
  outputRoot,
  publishedRoot,
  sourceFingerprint,
};
writeStatus("analyzing", {
  modKey,
  modId,
  displayName,
  totalCells: plan.totalCells,
  mapCount: selectedMaps.length,
});
if (planOnly) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

writeStatus("preparing-runtime");
ensureRenderer();
const virtualPython = ensurePythonEnvironment(pythonCommand);
const descriptorPath = join(rendererRoot, "conf", "mod", `pzim-${modKey}.txt`);
const dependencyDefinitions = dependencyTextureRoots.map((root, index) => [
  `pzim-${modKey}-dependency-${index + 1}:`,
  "  texture: true",
  `  texture_path: ${yamlString(root)}`,
  "  texture_files:",
  "    - '.*[.]pack$'",
].join("\n"));
const mapDefinitions = internalMaps.map((map) => {
  const ownTextureRoot = join(map.variantRoot, "media", "texturepacks");
  const dependencies = dependencyTextureRoots.map((_, index) => `pzim-${modKey}-dependency-${index + 1}`);
  return [
    `${map.id}:`,
    `  map_path: ${yamlString(map.root)}`,
    ...(existsSync(ownTextureRoot) ? [
      "  texture: true",
      `  texture_path: ${yamlString(ownTextureRoot)}`,
      "  texture_files:",
      "    - '.*[.]pack$'",
    ] : []),
    ...(dependencies.length > 0 ? ["  depend:", ...dependencies.map((dependency) => `    - ${dependency}`)] : []),
  ].join("\n");
});
writeFileSync(descriptorPath, `${[...dependencyDefinitions, ...mapDefinitions].join("\n\n")}\n`);

const templatePath = join(rendererRoot, "conf", "conf.yaml");
const configurationPath = join(rendererRoot, "conf", `pzim-${modKey}.yaml`);
const cellRanges = collapseCellsToRectangles(selectedMaps.flatMap(({ cells }) => cells));
const cellRangesYaml = cellRanges.map((range) => `        - [${range.join(", ")}]`).join("\n");
let configuration = readFileSync(templatePath, "utf8");
configuration = replaceRequired(configuration, /^(pz_root:\s*\|-.*\r?\n)\s+.*$/m, `$1    ${gameRoot.replaceAll("\\", "/")}`, "pz_root");
configuration = replaceRequired(configuration, /^(output_root:\s*\|-.*\r?\n)\s+.*$/m, `$1    ${outputRoot.replaceAll("\\", "/")}`, "output_root");
configuration = replaceRequired(configuration, /^use_depend_texture_only:\s*false$/m, "use_depend_texture_only: true", "use_depend_texture_only");
configuration = replaceRequired(configuration, /^base_map:\s*default$/m, "base_map:", "base_map");
configuration = replaceRequired(configuration, /^mod_maps:\s*$/m, `mod_maps:\n${internalMaps.map(({ id }) => `    - ${id}`).join("\n")}`, "mod_maps");
configuration = replaceRequired(configuration, /^\s+worker_count:\s*auto$/m, `    worker_count: ${workerCount}`, "worker_count");
if (layerRange) configuration = replaceRequired(configuration, /^\s+layer_range:\s*all$/m, `    layer_range: [${layerRange.join(", ")}]`, "layer_range");
configuration = replaceRequired(configuration, /^\s+render_cell_range:\s*all$/m, `    render_cell_range:\n${cellRangesYaml}`, "render_cell_range");
configuration = replaceRequired(configuration, /^\s+omit_levels:\s*0$/m, `    omit_levels: ${omitLevels}`, "omit_levels");
configuration = replaceRequired(configuration, /^\s+image_save_options:\s*\{\}$/m, "    image_save_options:\n        webp: {quality: 88, method: 2}", "image_save_options");
configuration = replaceRequired(configuration, /^\s+enable_cache:\s*false$/m, "    enable_cache: true", "enable_cache");
writeFileSync(configurationPath, configuration);

if (freshRender && existsSync(outputRoot)) {
  const allowedRoot = resolve(cacheRoot, "isometric-mod-output");
  if (!outputRoot.startsWith(`${allowedRoot}\\`)) throw new Error(`Unsafe mod render output path: ${outputRoot}.`);
  rmSync(outputRoot, { recursive: true, force: true });
}
mkdirSync(outputRoot, { recursive: true });
if (!publishOnly) {
  writeStatus("unpacking");
  run(virtualPython, ["main.py", "-c", configurationPath, "unpack"], { cwd: rendererRoot });
  writeStatus("rendering");
  run(virtualPython, ["main.py", "-c", configurationPath, "render", "base"], { cwd: rendererRoot });
}

writeStatus("publishing");
const generatedAt = new Date().toISOString();
const builds = [...new Set(selectedMaps.map(({ build }) => build))];
for (const map of internalMaps) {
  const renderedRoot = join(outputRoot, "html", "map_data", "mod_maps", map.id, "base");
  if (!existsSync(join(renderedRoot, "map_info.json"))) throw new Error(`Renderer output is missing for ${map.name}.`);
  const mapSlug = slugify(map.name) || `map-${map.id}`;
  const destination = join(publishedRoot, modKey, mapSlug);
  const { mapInfo, floors } = readIsometricOutput(renderedRoot);
  for (const cell of map.cells) {
    if (!mapInfo.cell_rects?.some(([x, y, width, height]) =>
      cell.x >= x && cell.x < x + width && cell.y >= y && cell.y < y + height)) {
      throw new Error(`Renderer omitted map cell ${cell.x},${cell.y} from ${map.name}.`);
    }
  }
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(renderedRoot, destination, { recursive: true });
  const scale = 2 ** (mapInfo.skip ?? 0);
  const logicalMapInfo = {
    ...mapInfo,
    w: mapInfo.w * scale,
    h: mapInfo.h * scale,
    scale,
  };
  const cellRange = getCellRange(map.cells);
  const manifest = {
    id: `${modKey}:${mapSlug}`,
    tileSourceKind: "direct",
    renderer: "pzmap2dzi",
    rendererCommit: RENDERER_COMMIT,
    sourceFingerprint,
    renderProfile: JSON.parse(renderProfile),
    generatedAt,
    cellRange,
    layerRange: layerRange ?? [mapInfo.minlayer, mapInfo.maxlayer],
    complete: true,
    mapInfo: logicalMapInfo,
    floors,
    preparedMod: {
      key: modKey,
      modId,
      displayName,
      ...(workshopId ? { workshopId } : {}),
      builds,
      kind,
      mapFolder: map.name,
      cells: map.cells.map(({ x, y }) => `${x},${y}`),
    },
  };
  writeFileSync(join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
mkdirSync(publishedRoot, { recursive: true });
const catalog = writePreparedMapModCatalog(publishedRoot);
writeStatus("ready", {
  preparedMaps: internalMaps.length,
  catalogMods: catalog.mods.length,
});
console.log(JSON.stringify({ ...plan, preparedMaps: internalMaps.length, catalogMods: catalog.mods.length }, null, 2));
