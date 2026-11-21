import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createIsometricSourceFingerprint, readGameCells } from "./isometric-catalog.mjs";

const RENDERER_COMMIT = "6ceb95293e6a9247d17ed8873d3261ca8573fa65";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const gameRoot = resolve(process.env.PZ_GAME_DIR || resolve(projectRoot, "..", "project-zomboid"));
const mapRoot = join(gameRoot, "media", "maps", "Muldraugh, KY");
const textureRoot = join(gameRoot, "media", "texturepacks");
const renderTowns = process.argv.includes("--towns");
const planPath = join(
  projectRoot,
  ".render-cache",
  renderTowns ? "isometric-town-plan.json" : "isometric-world-plan.json",
);
const publishRoot = resolve(
  process.env.PZ_ISOMETRIC_PUBLISH_DIR
  || join(projectRoot, ".runtime-data", "map-data", "knox-country", "isometric-optimized"),
);
const outputRoot = resolve(
  process.env.PZ_ISOMETRIC_OUTPUT_DIR
  || join(projectRoot, ".render-cache", "isometric-output"),
);

const readArgument = (name) => {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

const parsePositiveInteger = (value, fallback, label) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
};

const chunkSize = parsePositiveInteger(readArgument("--chunk-size"), 2, "chunk-size");
const renderAll = process.argv.includes("--all");
const limit = parsePositiveInteger(readArgument("--limit"), renderAll ? Number.MAX_SAFE_INTEGER : 1, "limit");
const layerRange = readArgument("--layers") ?? "0,1";
const omitLevels = parsePositiveInteger(readArgument("--omit-levels"), 2, "omit-levels");
const planOnly = process.argv.includes("--plan");
const force = process.argv.includes("--force");

const townRanges = [
  { id: "louisville", name: "Louisville", x: 39, y: 3, width: 10, height: 13 },
  { id: "valley-station", name: "Valley Station", x: 41, y: 16, width: 4, height: 5 },
  { id: "west-point", name: "West Point", x: 35, y: 21, width: 7, height: 5 },
  { id: "riverside", name: "Riverside", x: 18, y: 16, width: 8, height: 5 },
  { id: "muldraugh", name: "Muldraugh", x: 33, y: 30, width: 5, height: 7 },
  { id: "rosewood", name: "Rosewood", x: 25, y: 36, width: 5, height: 6 },
  { id: "march-ridge", name: "March Ridge", x: 32, y: 41, width: 3, height: 4 },
  { id: "fallas-lake", name: "Fallas Lake", x: 22, y: 26, width: 4, height: 4 },
  { id: "echo-creek", name: "Echo Creek", x: 10, y: 34, width: 4, height: 5 },
  { id: "brandenburg", name: "Brandenburg", x: 5, y: 18, width: 5, height: 5 },
  { id: "ekron", name: "Ekron", x: 0, y: 30, width: 4, height: 4 },
  { id: "irvington", name: "Irvington", x: 3, y: 45, width: 8, height: 6 },
];

if (!existsSync(mapRoot)) throw new Error(`Project Zomboid map data was not found: ${mapRoot}.`);
if (!existsSync(textureRoot)) throw new Error(`Project Zomboid textures were not found: ${textureRoot}.`);

const renderProfile = JSON.stringify({
  scope: "pack",
  layerRange: layerRange.split(",").map(Number),
  baseImageFormat: process.env.PZ_ISOMETRIC_BASE_FORMAT || "webp",
  imageFormat: "webp",
  quality: 88,
  maximumDetailReduction: omitLevels,
});
const sourceFingerprint = createIsometricSourceFingerprint({
  mapRoot,
  textureRoot,
  rendererCommit: RENDERER_COMMIT,
  renderProfile,
});

const cells = readGameCells(mapRoot);
const gameCellKeys = new Set(cells.map(({ x, y }) => `${x},${y}`));
const countCellsInRange = ({ x, y, width, height }) => {
  let count = 0;
  for (let cellX = x; cellX < x + width; cellX += 1) {
    for (let cellY = y; cellY < y + height; cellY += 1) count += Number(gameCellKeys.has(`${cellX},${cellY}`));
  }
  return count;
};
const createWorldPacks = () => {
  const chunks = new Map();
  for (const cell of cells) {
    const x = Math.floor(cell.x / chunkSize) * chunkSize;
    const y = Math.floor(cell.y / chunkSize) * chunkSize;
    const key = `${x},${y}`;
    const chunk = chunks.get(key) ?? { x, y, width: chunkSize, height: chunkSize, cells: 0 };
    chunk.cells += 1;
    chunks.set(key, chunk);
  }
  return [...chunks.values()]
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((chunk) => ({ ...chunk, id: `cells-${chunk.x}-${chunk.y}-${chunk.width}-${chunk.height}` }));
};
const packs = renderTowns
  ? townRanges.map((town) => ({ ...town, cells: countCellsInRange(town), id: `town-${town.id}` }))
  : createWorldPacks();
const plannedCellKeys = new Set();
for (const pack of packs) {
  for (let x = pack.x; x < pack.x + pack.width; x += 1) {
    for (let y = pack.y; y < pack.y + pack.height; y += 1) {
      if (gameCellKeys.has(`${x},${y}`)) plannedCellKeys.add(`${x},${y}`);
    }
  }
}
const plan = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: renderTowns ? "towns" : "world",
  totalCells: plannedCellKeys.size,
  chunkSize,
  packCount: packs.length,
  layerRange,
  omitLevels,
  workerCount: readArgument("--workers") ?? process.env.PZ_RENDER_WORKERS ?? "4",
  sourceFingerprint,
  outputRoot,
  publishRoot,
  packs,
};
mkdirSync(dirname(planPath), { recursive: true });
writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Planned ${packs.length} resumable ${renderTowns ? "town" : "world"} packs for ${plannedCellKeys.size} Project Zomboid cells.`);
if (planOnly) process.exit(0);

const catalogPath = join(publishRoot, "catalog.json");
const completedPackIds = new Set();
if (!force && existsSync(catalogPath)) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  for (const pack of catalog.packs ?? []) {
    if (pack.sourceFingerprint === sourceFingerprint) completedPackIds.add(pack.id);
  }
}

let rendered = 0;
for (const pack of packs) {
  if (!force && completedPackIds.has(pack.id)) continue;
  if (rendered >= limit) break;
  for (const storageRoot of new Set([outputRoot, publishRoot])) {
    mkdirSync(storageRoot, { recursive: true });
    const disk = statfsSync(storageRoot, { bigint: true });
    const freeBytes = disk.bavail * disk.bsize;
    if (freeBytes < 25n * 1024n ** 3n) {
      throw new Error(`Isometric rendering stopped to preserve at least 25 GB at ${storageRoot}.`);
    }
  }
  execFileSync(process.execPath, [
    join(scriptDirectory, "render-isometric-map.mjs"),
    `--pack=${pack.id}`,
    `--cells=${pack.x},${pack.y},${pack.width},${pack.height}`,
    `--layers=${layerRange}`,
    `--omit-levels=${omitLevels}`,
    "--fresh",
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PZ_ISOMETRIC_OUTPUT_DIR: outputRoot,
      PZ_ISOMETRIC_PUBLISH_DIR: publishRoot,
      PZ_RENDER_WORKERS: readArgument("--workers") ?? process.env.PZ_RENDER_WORKERS ?? "4",
      PZ_ISOMETRIC_SOURCE_FINGERPRINT: sourceFingerprint,
    },
    stdio: "inherit",
  });
  rendered += 1;
}

console.log(`Rendered ${rendered} new isometric pack${rendered === 1 ? "" : "s"}.`);
