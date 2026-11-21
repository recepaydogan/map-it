import { existsSync, readFileSync, readdirSync, statfsSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const globalRoot = resolve(projectRoot, ".runtime-data/map-data/knox-country/isometric-optimized/global");
const modRoot = resolve(projectRoot, ".runtime-data/map-data/knox-country/isometric-mods");
const measurementRoot = resolve(projectRoot, ".render-cache/isometric-floor-measurements");
const summaryPath = join(globalRoot, "floor-download-summary.json");
const argumentsByName = new Map(process.argv.slice(2).map((entry) => {
  const [name, ...parts] = entry.split("=");
  return [name, parts.join("=")];
}));
const readInteger = (name, fallback) => {
  const raw = argumentsByName.get(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
};

const startFloor = readInteger("--start-floor", 1);
const endFloor = readInteger("--end-floor", 30);
const maximumLevel = readInteger("--max-level", 22);
const measureConcurrency = readInteger("--measure-concurrency", 256);
const downloadConcurrency = readInteger("--download-concurrency", 64);
const budgetBytes = readInteger("--budget-gb", 60) * 1_000_000_000;
const diskReserveBytes = readInteger("--disk-reserve-gb", 1) * 1_000_000_000;

const addDirectoryFiles = (root, callback) => {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) addDirectoryFiles(path, callback);
    else if (entry.isFile()) callback(path);
  }
};

const collectModFloorSizes = () => {
  const sizes = new Map();
  const visit = (root) => {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(root, entry.name);
      const match = /^layer(-?\d+)_files$/.exec(entry.name);
      if (!match) {
        visit(path);
        continue;
      }
      const floor = Number(match[1]);
      let bytes = 0;
      addDirectoryFiles(path, (filePath) => { bytes += statSync(filePath).size; });
      sizes.set(floor, (sizes.get(floor) || 0) + bytes);
    }
  };
  visit(modRoot);
  return sizes;
};

const getGlobalFloorSize = (floor) => {
  const root = join(globalRoot, `layer${floor}_files`);
  if (!existsSync(root)) return 0;
  let bytes = 0;
  addDirectoryFiles(root, (filePath) => { bytes += statSync(filePath).size; });
  return bytes;
};

const runNode = (script, arguments_, allowedStatuses = new Set()) => {
  const result = spawnSync(process.execPath, [resolve(projectRoot, script), ...arguments_], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.status !== 0 && !allowedStatuses.has(result.status)) {
    throw new Error(`${script} failed with exit code ${result.status}.`);
  }
  return result.status;
};

const readMeasurement = (floor) => {
  const path = join(measurementRoot, `floor-${floor}-level-${maximumLevel}.json`);
  const state = JSON.parse(readFileSync(path, "utf8"));
  const levels = Array.from({ length: maximumLevel + 1 }, (_, level) => state.levels[level]);
  if (levels.some((level) => !level?.complete)) throw new Error(`Floor ${floor} measurement is incomplete.`);
  return levels.reduce((total, level) => total + level.bytes, 0);
};

const getDownloadedGlobalFloors = () => {
  const manifest = JSON.parse(readFileSync(join(globalRoot, "manifest.json"), "utf8"));
  return new Set(manifest.floors.map(({ floor }) => floor));
};

const formatGigabytes = (bytes) => `${(bytes / 1_000_000_000).toFixed(3)} GB`;

const main = () => {
  if (!existsSync(globalRoot)) throw new Error(`Global map root is missing: ${globalRoot}`);
  if (!existsSync(modRoot)) throw new Error(`Prepared mod root is missing: ${modRoot}`);
  const modFloorSizes = collectModFloorSizes();
  const downloadedGlobalFloors = getDownloadedGlobalFloors();
  const retainedFloors = new Set([...downloadedGlobalFloors].filter((floor) => floor <= startFloor - 1));
  let retainedBytes = [...retainedFloors].reduce(
    (total, floor) => total + getGlobalFloorSize(floor) + (modFloorSizes.get(floor) || 0),
    0,
  );
  const completed = [];
  let stopReason = "requested-range-complete";
  let firstUnavailableFloor;

  const writeSummary = () => writeFileSync(summaryPath, `${JSON.stringify({
    budgetBytes,
    maximumLevel,
    retainedBytes,
    retainedFloors: [...retainedFloors].sort((left, right) => left - right),
    completed,
    stopReason,
    ...(firstUnavailableFloor === undefined ? {} : { firstUnavailableFloor }),
  }, null, 2)}\n`);

  console.log(`Starting sequential floor mirror at ${startFloor}.`);
  console.log(`Current retained tile size: ${formatGigabytes(retainedBytes)} / ${formatGigabytes(budgetBytes)}.`);

  for (let floor = startFloor; floor <= endFloor; floor += 1) {
    console.log(`\n=== Measuring complete floor +${floor} ===`);
    const measurementStatus = runNode("scripts/measure-isometric-floor.mjs", [
      `--floor=${floor}`,
      `--max-level=${maximumLevel}`,
      `--concurrency=${measureConcurrency}`,
    ], new Set([2]));
    if (measurementStatus === 2) {
      stopReason = "source-floor-missing";
      firstUnavailableFloor = floor;
      console.log(`Floor +${floor} is not rendered by the source; all available positive floors are complete.`);
      break;
    }
    const vanillaBytes = readMeasurement(floor);
    const modBytes = modFloorSizes.get(floor) || 0;
    const floorBytes = vanillaBytes + modBytes;
    console.log(`Floor +${floor}: vanilla ${formatGigabytes(vanillaBytes)}, mods ${formatGigabytes(modBytes)}, total ${formatGigabytes(floorBytes)}.`);

    if (retainedBytes + floorBytes > budgetBytes) {
      stopReason = "budget-reached";
      console.log(`Floor +${floor} would exceed the complete-floor budget and will not be downloaded.`);
      break;
    }

    const disk = statfsSync(globalRoot);
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    if (vanillaBytes + diskReserveBytes > freeBytes) {
      throw new Error(
        `Floor +${floor} needs ${formatGigabytes(vanillaBytes)} but only ${formatGigabytes(freeBytes)} is free.`,
      );
    }

    console.log(`=== Downloading complete floor +${floor} ===`);
    runNode("scripts/fetch-isometric-tiles.mjs", [
      `--floor=${floor}`,
      `--max-level=${maximumLevel}`,
      `--concurrency=${downloadConcurrency}`,
    ]);
    const downloadedBytes = getGlobalFloorSize(floor);
    if (downloadedBytes !== vanillaBytes) {
      throw new Error(
        `Floor +${floor} size mismatch: measured ${vanillaBytes}, downloaded ${downloadedBytes}.`,
      );
    }

    retainedFloors.add(floor);
    retainedBytes += floorBytes;
    completed.push({ floor, vanillaBytes, modBytes, floorBytes, retainedBytes });
    writeSummary();
    console.log(`Floor +${floor} verified. Retained total: ${formatGigabytes(retainedBytes)}.`);
  }

  writeSummary();
  console.log(`Sequential mirror stopped at ${formatGigabytes(retainedBytes)} retained tile data.`);
};

main();
