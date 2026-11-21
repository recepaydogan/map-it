import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const CELL_HEADER_PATTERN = /^(-?\d+)_(-?\d+)[.]lotheader$/;

const collectFileMetadata = (root, current = root, output = []) => {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) collectFileMetadata(root, path, output);
    if (!entry.isFile()) continue;
    const stats = statSync(path);
    output.push(`${relative(root, path).replaceAll("\\", "/")}:${stats.size}:${stats.mtimeMs}`);
  }
  return output;
};

export const createIsometricSourceFingerprint = ({ mapRoot, textureRoot, rendererCommit, renderProfile }) => {
  const hash = createHash("sha256");
  hash.update(`${rendererCommit}\n${renderProfile}\n`);
  for (const [label, root] of [["map", mapRoot], ["textures", textureRoot]]) {
    for (const metadata of collectFileMetadata(root).sort()) hash.update(`${label}/${metadata}\n`);
  }
  return `sha256:${hash.digest("hex")}`;
};

export const createIsometricSourceFingerprintFromRoots = ({ mapRoots, textureRoots, rendererCommit, renderProfile }) => {
  const hash = createHash("sha256");
  hash.update(`${rendererCommit}\n${renderProfile}\n`);
  for (const [label, roots] of [["map", mapRoots], ["textures", textureRoots]]) {
    for (const root of roots) {
      for (const metadata of collectFileMetadata(root).sort()) hash.update(`${label}/${root}/${metadata}\n`);
    }
  }
  return `sha256:${hash.digest("hex")}`;
};

export const readGameCells = (mapRoot) => readdirSync(mapRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name.match(CELL_HEADER_PATTERN))
  .filter(Boolean)
  .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));

export const getCellRange = (cells) => {
  if (cells.length === 0) throw new Error("No Project Zomboid map cells were found.");
  const minimumX = Math.min(...cells.map(({ x }) => x));
  const minimumY = Math.min(...cells.map(({ y }) => y));
  const maximumX = Math.max(...cells.map(({ x }) => x));
  const maximumY = Math.max(...cells.map(({ y }) => y));
  return [minimumX, minimumY, maximumX - minimumX + 1, maximumY - minimumY + 1];
};

const getContiguousIntervals = (values) => {
  const sorted = [...new Set(values)].sort((left, right) => left - right);
  const intervals = [];
  for (const value of sorted) {
    const current = intervals.at(-1);
    if (current && value === current[1] + 1) current[1] = value;
    else intervals.push([value, value]);
  }
  return intervals;
};

export const collapseCellsToRectangles = (cells) => {
  if (cells.length === 0) return [];
  const valuesByX = new Map();
  for (const { x, y } of cells) {
    const values = valuesByX.get(x) ?? [];
    values.push(y);
    valuesByX.set(x, values);
  }
  const columns = [...valuesByX]
    .map(([x, values]) => ({ x, intervals: getContiguousIntervals(values) }))
    .sort((left, right) => left.x - right.x);
  const rectangles = [];
  let run = null;
  const flush = () => {
    if (!run) return;
    for (const [minimumY, maximumY] of run.intervals) {
      rectangles.push([
        run.startX,
        minimumY,
        run.endX - run.startX + 1,
        maximumY - minimumY + 1,
      ]);
    }
  };
  for (const column of columns) {
    const key = JSON.stringify(column.intervals);
    if (run && column.x === run.endX + 1 && key === run.key) {
      run.endX = column.x;
      continue;
    }
    flush();
    run = { startX: column.x, endX: column.x, intervals: column.intervals, key };
  }
  flush();
  return rectangles;
};

const isCellInRange = ({ x, y }, [rangeX, rangeY, width, height]) =>
  x >= rangeX && x < rangeX + width && y >= rangeY && y < rangeY + height;

const readManifest = (path, id, basePath) => {
  if (!existsSync(path)) return null;
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  return { ...manifest, id: manifest.id ?? id, basePath };
};

export const writeIsometricCatalog = ({ publishedRoot, mapRoot }) => {
  const cells = readGameCells(mapRoot);
  const packs = [];
  const globalMap = readManifest(join(publishedRoot, "global", "manifest.json"), "global", "global");
  const legacyPack = readManifest(join(publishedRoot, "manifest.json"), "legacy-preview", ".");
  if (legacyPack) packs.push(legacyPack);

  const packsRoot = join(publishedRoot, "packs");
  if (existsSync(packsRoot)) {
    for (const entry of readdirSync(packsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pack = readManifest(
        join(packsRoot, entry.name, "manifest.json"),
        entry.name,
        `packs/${entry.name}`,
      );
      if (pack) packs.push(pack);
    }
  }

  const coverageSources = globalMap?.complete ? [...packs, globalMap] : packs;
  const renderedCellKeys = new Set();
  for (const pack of coverageSources) {
    for (const cell of cells) {
      if (isCellInRange(cell, pack.cellRange)) renderedCellKeys.add(`${cell.x},${cell.y}`);
    }
  }
  const floorSources = globalMap ? [...packs, globalMap] : packs;
  const floors = [...new Set(floorSources.flatMap((pack) => pack.floors.map(({ floor }) => floor)))]
    .sort((left, right) => right - left);
  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    worldCellRange: getCellRange(cells),
    cellSize: globalMap?.mapInfo.cell_size ?? packs[0]?.mapInfo.cell_size ?? 256,
    totalCells: cells.length,
    renderedCells: renderedCellKeys.size,
    complete: cells.length > 0 && renderedCellKeys.size === cells.length,
    floors,
    packs: packs.sort((left, right) => left.id.localeCompare(right.id)),
  };
  writeFileSync(join(publishedRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
};

export const writeStandaloneIsometricCatalog = ({ publishedRoot, mapRoot, manifest }) => {
  const cells = readGameCells(mapRoot);
  const pack = { ...manifest, basePath: "." };
  const catalog = {
    schemaVersion: 1,
    generatedAt: manifest.generatedAt,
    worldCellRange: getCellRange(cells),
    cellSize: manifest.mapInfo.cell_size,
    totalCells: cells.length,
    renderedCells: manifest.complete ? cells.length : manifest.cellRange[2] * manifest.cellRange[3],
    complete: manifest.complete,
    floors: manifest.floors.map(({ floor }) => floor),
    packs: [pack],
  };
  writeFileSync(join(publishedRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
};
