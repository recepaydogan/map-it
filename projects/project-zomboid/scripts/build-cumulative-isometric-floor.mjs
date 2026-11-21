import { cpus } from "node:os";
import { copyFile, link, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";

const DEFAULT_ROOT = resolve(".runtime-data/map-data/knox-country/isometric-optimized/global");
const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const [name, ...valueParts] = argument.replace(/^--/, "").split("=");
  return [name, valueParts.join("=")];
}));
const root = resolve(argumentsByName.get("root") || DEFAULT_ROOT);
const targetFloor = Number.parseInt(argumentsByName.get("floor") || "29", 10);
const concurrency = Number.parseInt(
  argumentsByName.get("concurrency") || String(Math.min(8, cpus().length)),
  10,
);
const quality = Number.parseInt(argumentsByName.get("quality") || "90", 10);
const effort = Number.parseInt(argumentsByName.get("effort") || "1", 10);
const maximumLevel = Number.parseInt(argumentsByName.get("max-level") || "999", 10);
const pyramidMaximumLevelArgument = argumentsByName.get("pyramid-max-level");
const pyramidMaximumLevel = pyramidMaximumLevelArgument === undefined
  ? null
  : Number.parseInt(pyramidMaximumLevelArgument, 10);
const floorOrder = argumentsByName.get("floor-order") || "ascending";
if (!Number.isInteger(targetFloor) || targetFloor < 1) throw new Error("Floor must be a positive integer.");
if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Concurrency must be positive.");
if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error("Quality must be from 1 to 100.");
if (!Number.isInteger(effort) || effort < 0 || effort > 6) throw new Error("Effort must be from 0 to 6.");
if (!Number.isInteger(maximumLevel) || maximumLevel < 0) throw new Error("Maximum level must be non-negative.");
if (pyramidMaximumLevel !== null && (!Number.isInteger(pyramidMaximumLevel) || pyramidMaximumLevel < maximumLevel)) {
  throw new Error("Pyramid maximum level must be at least the generated maximum level.");
}
if (!["ascending", "descending"].includes(floorOrder)) {
  throw new Error("Floor order must be ascending or descending.");
}

sharp.concurrency(Math.max(1, Math.floor(cpus().length / concurrency)));
const manifestPath = join(root, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sourceFloors = manifest.floors
  .filter(({ floor }) => floor > 0 && floor <= targetFloor)
  .sort((left, right) => left.floor - right.floor);
const expectedFloors = Array.from({ length: targetFloor }, (_, index) => index + 1);
if (sourceFloors.map(({ floor }) => floor).join(",") !== expectedFloors.join(",")) {
  throw new Error(`Floors 1 through ${targetFloor} must be available before building a cumulative floor.`);
}
if (sourceFloors.some(({ tileRanges }) => !tileRanges)) {
  throw new Error("Every source floor must provide sparse tile ranges.");
}

const targetDefinition = sourceFloors.at(-1);
const layerName = argumentsByName.get("layer-name") || `cumulative/layer${targetFloor}`;
const outputRoot = join(root, `${layerName}_files`);
const tilesByLevel = new Map();
for (const floor of sourceFloors) {
  for (const [level, ranges] of Object.entries(floor.tileRanges)) {
    if (Number(level) > maximumLevel) continue;
    let tiles = tilesByLevel.get(level);
    if (!tiles) {
      tiles = new Map();
      tilesByLevel.set(level, tiles);
    }
    for (const [row, minimumColumn, maximumColumn] of ranges) {
      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        const tileName = `${column}_${row}`;
        const contributors = tiles.get(tileName) ?? [];
        contributors.push(floor.floor);
        tiles.set(tileName, contributors);
      }
    }
  }
}

const tasks = [];
for (const [level, tiles] of [...tilesByLevel].sort(([left], [right]) => Number(left) - Number(right))) {
  const levelRoot = join(outputRoot, level);
  await mkdir(levelRoot, { recursive: true });
  for (const [tileName, floors] of tiles) {
    tasks.push({
      level,
      tileName,
      floors,
      outputPath: join(levelRoot, `${tileName}.webp`),
    });
  }
}

const pathExistsWithContent = async (path) => {
  try {
    return (await stat(path)).size > 0;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
};
const createHardLinkOrCopy = async (source, target) => {
  try {
    await link(source, target);
  } catch (error) {
    if (error?.code === "EEXIST") return;
    await copyFile(source, target);
  }
};
const replaceFile = async (source, target) => {
  try {
    await rename(source, target);
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
    await copyFile(source, target);
    await unlink(source);
  }
};

let nextTask = 0;
let completed = 0;
let linked = 0;
let composited = 0;
let skipped = 0;
let outputBytes = 0;
const startedAt = Date.now();
const worker = async () => {
  while (nextTask < tasks.length) {
    const task = tasks[nextTask++];
    if (await pathExistsWithContent(task.outputPath)) {
      skipped += 1;
      outputBytes += (await stat(task.outputPath)).size;
    } else {
      const orderedFloors = floorOrder === "ascending" ? task.floors : [...task.floors].reverse();
      const inputs = orderedFloors.map((floor) => join(
        root,
        `layer${floor}_files`,
        task.level,
        `${task.tileName}.webp`,
      ));
      if (inputs.length === 1) {
        await createHardLinkOrCopy(inputs[0], task.outputPath);
        linked += 1;
      } else {
        const metadata = await sharp(inputs[0]).metadata();
        if (!metadata.width || !metadata.height) throw new Error(`Cannot read ${inputs[0]}.`);
        const temporaryPath = `${task.outputPath}.pending-${process.pid}-${nextTask}`;
        await unlink(temporaryPath).catch((error) => {
          if (error?.code !== "ENOENT") throw error;
        });
        await sharp({
          create: {
            width: metadata.width,
            height: metadata.height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite(inputs.map((input) => ({ input })))
          .webp({ quality, alphaQuality: 100, smartSubsample: true, effort })
          .toFile(temporaryPath);
        await replaceFile(temporaryPath, task.outputPath);
        composited += 1;
      }
      outputBytes += (await stat(task.outputPath)).size;
    }
    completed += 1;
    if (completed % 500 === 0 || completed === tasks.length) {
      const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
      const remainingSeconds = Math.round((tasks.length - completed) / (completed / elapsedSeconds));
      console.log(
        `Built ${completed}/${tasks.length}; composited ${composited}; linked ${linked}; skipped ${skipped}; ETA ${remainingSeconds}s.`,
      );
    }
  }
};
await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));

const tileRanges = {};
for (const [level, tiles] of tilesByLevel) {
  const columnsByRow = new Map();
  for (const tileName of tiles.keys()) {
    const [column, row] = tileName.split("_").map(Number);
    const columns = columnsByRow.get(row) ?? [];
    columns.push(column);
    columnsByRow.set(row, columns);
  }
  tileRanges[level] = [];
  for (const [row, columns] of [...columnsByRow].sort(([left], [right]) => left - right)) {
    columns.sort((left, right) => left - right);
    let rangeStart = columns[0];
    let previous = columns[0];
    for (const column of columns.slice(1)) {
      if (column === previous + 1) {
        previous = column;
        continue;
      }
      tileRanges[level].push([row, rangeStart, previous]);
      rangeStart = column;
      previous = column;
    }
    tileRanges[level].push([row, rangeStart, previous]);
  }
}

const descriptorPath = join(root, `${layerName}.dzi`);
await mkdir(dirname(descriptorPath), { recursive: true });
await writeFile(
  descriptorPath,
  `<?xml version="1.0" encoding="UTF-8"?>\n<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" TileSize="${targetDefinition.tileSize}" Overlap="0" Format="webp">\n  <Size Width="${targetDefinition.width}" Height="${targetDefinition.height}"/>\n</Image>\n`,
);
const cumulativeDefinition = {
  ...targetDefinition,
  layerName,
  sourceFloors: expectedFloors,
  ...(pyramidMaximumLevel === null ? {} : { pyramidMaximumLevel }),
  levels: [...tilesByLevel.keys()].map(Number).sort((left, right) => left - right),
  tileRanges,
};
manifest.cumulativeFloors = [
  ...(manifest.cumulativeFloors ?? []).filter(({ floor }) => floor !== targetFloor),
  cumulativeDefinition,
].sort((left, right) => right.floor - left.floor);
const temporaryManifestPath = `${manifestPath}.pending-${process.pid}`;
await writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await replaceFile(temporaryManifestPath, manifestPath);
console.log(JSON.stringify({
  floor: targetFloor,
  layerName,
  quality,
  effort,
  floorOrder,
  maximumLevel,
  files: tasks.length + 1,
  linked,
  composited,
  skipped,
  outputGiB: Number((outputBytes / 2 ** 30).toFixed(3)),
  elapsedMinutes: Number(((Date.now() - startedAt) / 60_000).toFixed(1)),
}, null, 2));
