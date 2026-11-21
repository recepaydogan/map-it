import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseLotHeaderNavigationConfig } from "./map-lotheader-parser.mjs";
import { parseLotPackNavigation } from "./map-lotpack-navigation-parser.mjs";
import {
  NAVIGATION_CELL_SIZE,
  NAVIGATION_EDGE_BLOCKED,
  NAVIGATION_EDGE_MASK,
  NAVIGATION_NORTH_SHIFT,
  NAVIGATION_SCHEMA_VERSION,
  NAVIGATION_SQUARE_BLOCKED,
  NAVIGATION_SQUARE_SLOW,
  NAVIGATION_WEST_SHIFT,
  getNavigationEdge,
} from "./map-navigation-format.mjs";
import { buildNavigationTileProperties } from "./map-navigation-tile-properties.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const defaultGameRoot = "C:/Program Files (x86)/Steam/steamapps/common/ProjectZomboid";
const gameRoot = resolve(process.env.PZ_GAME_DIR || defaultGameRoot);
const mediaRoot = join(gameRoot, "media");
const mapRootArgument = process.argv.find((argument) => argument.startsWith("--map-root="));
const mapRoot = mapRootArgument
  ? resolve(mapRootArgument.slice("--map-root=".length))
  : join(mediaRoot, "maps", "Muldraugh, KY");
const defaultTarget = resolve(projectRoot, "public", "map-data", "knox-country", "navigation");
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const targetRoot = outputArgument ? resolve(outputArgument.slice("--output=".length)) : defaultTarget;
const requestedCells = new Set(
  process.argv
    .filter((argument) => argument.startsWith("--cell="))
    .map((argument) => argument.slice("--cell=".length)),
);
const headerPattern = /^(-?\d+)_(-?\d+)[.]lotheader$/;

const findMediaRoot = (path) => {
  let current = path;
  while (dirname(current) !== current) {
    if (basename(current).toLowerCase() === "media") return current;
    current = dirname(current);
  }
  return null;
};

const assertWithin = (parent, target, label) => {
  const child = relative(parent, target);
  if (child.startsWith("..") || resolve(parent, child) !== target) {
    throw new Error(`${label} must stay inside ${parent}.`);
  }
};

const installBuiltNavigation = (source, target) => {
  try {
    renameSync(source, target);
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "EPERM") throw error;
    // OneDrive can deny an otherwise valid directory rename on Windows. Keep
    // this fallback scoped to that error and copy the already-complete build.
    try {
      cpSync(source, target, { recursive: true, errorOnExist: true });
      rmSync(source, { recursive: true, force: true });
    } catch (copyError) {
      rmSync(target, { recursive: true, force: true });
      throw copyError;
    }
  }
};

if (!existsSync(mapRoot)) {
  throw new Error(`Project Zomboid map source was not found at ${mapRoot}. Set PZ_GAME_DIR to the game directory.`);
}
if (!outputArgument) {
  assertWithin(resolve(projectRoot, "public", "map-data"), targetRoot, "Navigation output");
}
if (requestedCells.size > 0 && !outputArgument) {
  throw new Error("A partial navigation build requires an explicit --output directory.");
}

const mapMediaRoot = findMediaRoot(mapRoot);
const tileDefinitionPaths = [
  ...readdirSync(mediaRoot)
    .filter((name) => name.endsWith(".tiles.txt"))
    .map((name) => join(mediaRoot, name)),
  ...(mapMediaRoot && mapMediaRoot !== mediaRoot
    ? readdirSync(mapMediaRoot)
      .filter((name) => name.endsWith(".tiles.txt"))
      .map((name) => join(mapMediaRoot, name))
    : []),
];
const tileDefinitionSources = [...new Set(tileDefinitionPaths)]
  .sort((left, right) => {
    const leftPatch = left.includes(".patch.");
    const rightPatch = right.includes(".patch.");
    return Number(leftPatch) - Number(rightPatch) || left.localeCompare(right);
  })
  .map((path) => readFileSync(path, "utf8"));
const navigationTiles = buildNavigationTileProperties(tileDefinitionSources);
const cells = readdirSync(mapRoot)
  .flatMap((name) => {
    const match = name.match(headerPattern);
    if (!match) return [];
    const cell = `${match[1]},${match[2]}`;
    if (requestedCells.size > 0 && !requestedCells.has(cell)) return [];
    return [{ x: Number(match[1]), y: Number(match[2]), headerName: name }];
  })
  .sort((left, right) => left.y - right.y || left.x - right.x);
if (cells.length === 0) throw new Error("No matching Project Zomboid map cells were found.");

const coarseScale = 8;
const regionSize = 8;
const minimumCellX = Math.min(...cells.map(({ x }) => x));
const minimumCellY = Math.min(...cells.map(({ y }) => y));
const maximumCellX = Math.max(...cells.map(({ x }) => x));
const maximumCellY = Math.max(...cells.map(({ y }) => y));
const coarseWidth = (maximumCellX - minimumCellX + 1) * NAVIGATION_CELL_SIZE / coarseScale;
const coarseHeight = (maximumCellY - minimumCellY + 1) * NAVIGATION_CELL_SIZE / coarseScale;
const coarseMinimumX = minimumCellX * NAVIGATION_CELL_SIZE;
const coarseMinimumY = minimumCellY * NAVIGATION_CELL_SIZE;
const coarseWalkableCounts = new Uint16Array(coarseWidth * coarseHeight);
const coarseSlowCounts = new Uint16Array(coarseWidth * coarseHeight);
const coarseNorthOpen = new Uint8Array(coarseWidth * coarseHeight);
const coarseWestOpen = new Uint8Array(coarseWidth * coarseHeight);

mkdirSync(dirname(targetRoot), { recursive: true });
const temporaryRoot = mkdtempSync(`${targetRoot}-build-`);
const regionRoot = join(temporaryRoot, "regions");
mkdirSync(regionRoot, { recursive: true });

try {
  let rawBytes = 0;
  let compressedBytes = 0;
  const regionPayloads = new Map();
  for (const [index, cell] of cells.entries()) {
    const lotpackPath = join(mapRoot, `world_${cell.x}_${cell.y}.lotpack`);
    if (!existsSync(lotpackPath)) throw new Error(`Lotpack is missing for cell ${cell.x},${cell.y}.`);
    const config = parseLotHeaderNavigationConfig(readFileSync(join(mapRoot, cell.headerName)));
    if (config.blockSize * config.blocksPerCell !== NAVIGATION_CELL_SIZE) {
      throw new Error(`Cell ${cell.x},${cell.y} uses unsupported size ${config.blockSize * config.blocksPerCell}.`);
    }
    const navigation = parseLotPackNavigation({
      buffer: readFileSync(lotpackPath),
      ...config,
      navigationTiles,
    });
    for (let localY = 0; localY < NAVIGATION_CELL_SIZE; localY += 1) {
      for (let localX = 0; localX < NAVIGATION_CELL_SIZE; localX += 1) {
        const value = navigation[localY * NAVIGATION_CELL_SIZE + localX];
        if ((value & NAVIGATION_SQUARE_BLOCKED) !== 0) continue;
        const worldX = cell.x * NAVIGATION_CELL_SIZE + localX;
        const worldY = cell.y * NAVIGATION_CELL_SIZE + localY;
        const coarseX = Math.floor((worldX - coarseMinimumX) / coarseScale);
        const coarseY = Math.floor((worldY - coarseMinimumY) / coarseScale);
        const coarseIndex = coarseY * coarseWidth + coarseX;
        coarseWalkableCounts[coarseIndex] += 1;
        if ((value & NAVIGATION_SQUARE_SLOW) !== 0) coarseSlowCounts[coarseIndex] += 1;
        if (localY % coarseScale === 0
          && getNavigationEdge(value, NAVIGATION_NORTH_SHIFT) !== NAVIGATION_EDGE_BLOCKED) {
          coarseNorthOpen[coarseIndex] = 1;
        }
        if (localX % coarseScale === 0
          && getNavigationEdge(value, NAVIGATION_WEST_SHIFT) !== NAVIGATION_EDGE_BLOCKED) {
          coarseWestOpen[coarseIndex] = 1;
        }
      }
    }
    const compressed = gzipSync(navigation, { level: 9 });
    const regionX = Math.floor(cell.x / regionSize);
    const regionY = Math.floor(cell.y / regionSize);
    const regionKey = `${regionX},${regionY}`;
    const payloads = regionPayloads.get(regionKey) ?? [];
    payloads.push({ cellX: cell.x, cellY: cell.y, compressed });
    regionPayloads.set(regionKey, payloads);
    rawBytes += navigation.byteLength;
    compressedBytes += compressed.byteLength;
    if ((index + 1) % 100 === 0 || index + 1 === cells.length) {
      console.log(`Built navigation for ${index + 1}/${cells.length} cells.`);
    }
  }

  const coarseNavigation = new Uint8Array(coarseWidth * coarseHeight);
  coarseNavigation.fill(
    NAVIGATION_SQUARE_BLOCKED
      | (NAVIGATION_EDGE_BLOCKED << NAVIGATION_NORTH_SHIFT)
      | (NAVIGATION_EDGE_BLOCKED << NAVIGATION_WEST_SHIFT),
  );
  for (let index = 0; index < coarseNavigation.length; index += 1) {
    if (coarseWalkableCounts[index] === 0) continue;
    let value = coarseNavigation[index] & ~NAVIGATION_SQUARE_BLOCKED;
    if (coarseNorthOpen[index]) value &= ~(NAVIGATION_EDGE_MASK << NAVIGATION_NORTH_SHIFT);
    if (coarseWestOpen[index]) value &= ~(NAVIGATION_EDGE_MASK << NAVIGATION_WEST_SHIFT);
    if (coarseSlowCounts[index] * 2 > coarseWalkableCounts[index]) value |= NAVIGATION_SQUARE_SLOW;
    coarseNavigation[index] = value;
  }
  const compressedCoarseNavigation = gzipSync(coarseNavigation, { level: 9 });
  writeFileSync(join(temporaryRoot, "coarse.bin.gz"), compressedCoarseNavigation);

  const regions = [...regionPayloads.entries()]
    .map(([key, payloads]) => {
      const [regionX, regionY] = key.split(",").map(Number);
      let offset = 0;
      const indexedCells = payloads.map(({ cellX, cellY, compressed }) => {
        const entry = [cellX, cellY, offset, compressed.byteLength];
        offset += compressed.byteLength;
        return entry;
      });
      const path = `regions/${regionX}_${regionY}.bin`;
      writeFileSync(join(temporaryRoot, path), Buffer.concat(payloads.map(({ compressed }) => compressed)));
      return { x: regionX, y: regionY, path, cells: indexedCells };
    })
    .sort((left, right) => left.y - right.y || left.x - right.x);

  const manifest = {
    schemaVersion: NAVIGATION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    gameBuild: "42",
    cellSize: NAVIGATION_CELL_SIZE,
    regionSize,
    encoding: "gzip-cell-region-grid-v1",
    coarse: {
      path: "coarse.bin.gz",
      scale: coarseScale,
      minX: coarseMinimumX,
      minY: coarseMinimumY,
      width: coarseWidth,
      height: coarseHeight,
    },
    regions,
    costs: {
      cardinal: 10,
      diagonal: 14,
      door: 6,
      climb: 30,
      slowTerrain: 8,
    },
    statistics: {
      cells: cells.length,
      regions: regions.length,
      rawBytes,
      compressedBytes,
      coarseRawBytes: coarseNavigation.byteLength,
      coarseCompressedBytes: compressedCoarseNavigation.byteLength,
    },
  };
  writeFileSync(join(temporaryRoot, "manifest.json"), `${JSON.stringify(manifest)}\n`);

  if (existsSync(targetRoot)) rmSync(targetRoot, { recursive: true, force: true });
  installBuiltNavigation(temporaryRoot, targetRoot);
  console.log(`Navigation data written to ${targetRoot}.`);
} catch (error) {
  rmSync(temporaryRoot, { recursive: true, force: true });
  throw error;
}
