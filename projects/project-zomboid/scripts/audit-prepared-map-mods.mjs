import assert from "node:assert/strict";
import { existsSync, mkdirSync, openSync, closeSync, readSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";

const argumentsByName = new Map(
  process.argv.slice(2).map((argument) => {
    const [name, ...valueParts] = argument.replace(/^--/, "").split("=");
    return [name, valueParts.join("=")];
  }),
);

const root = resolve(
  argumentsByName.get("root") || ".runtime-data/map-data/knox-country/isometric-mods",
);
const auditRoot = resolve(argumentsByName.get("out") || ".render-cache/prepared-mod-audit");
const expectedWorkshopIds = new Set(
  (argumentsByName.get("expect") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const fast = argumentsByName.has("fast");

const catalog = JSON.parse(readFileSync(join(root, "catalog.json"), "utf8"));
assert.equal(catalog.schemaVersion, 1, "Prepared mod catalog schema is unsupported.");
assert.ok(Array.isArray(catalog.mods), "Prepared mod catalog has no mod list.");

const getLayerName = (floor) => `layer${floor}`;
const isInsideRectangle = ([cellX, cellY], [x, y, width, height]) =>
  cellX >= x && cellX < x + width && cellY >= y && cellY < y + height;
const parseCell = (cell) => cell.split(",").map(Number);
const readWebpSignature = (path) => {
  const descriptor = openSync(path, "r");
  try {
    const signature = Buffer.alloc(12);
    assert.equal(readSync(descriptor, signature, 0, signature.length, 0), signature.length);
    assert.equal(signature.subarray(0, 4).toString("ascii"), "RIFF", `${path} has no RIFF header.`);
    assert.equal(signature.subarray(8, 12).toString("ascii"), "WEBP", `${path} is not WebP.`);
  } finally {
    closeSync(descriptor);
  }
};

const createOverview = async (overlay, overlayRoot) => {
  const floor = overlay.source.floors.find((candidate) => candidate.floor === 0);
  assert.ok(floor, `${overlay.source.id} has no Ground floor.`);
  const maximumLevel = Math.ceil(Math.log2(Math.max(floor.width, floor.height)));
  const overviewLevel = [...floor.levels]
    .sort((left, right) => right - left)
    .find((level) => Math.max(floor.width, floor.height) / 2 ** (maximumLevel - level) <= 4096)
    ?? Math.min(...floor.levels);
  const scale = 2 ** (maximumLevel - overviewLevel);
  const width = Math.ceil(floor.width / scale);
  const height = Math.ceil(floor.height / scale);
  const tileRoot = join(overlayRoot, `${getLayerName(0)}_files`, String(overviewLevel));
  const inputs = readdirSync(tileRoot)
    .filter((name) => extname(name).toLowerCase() === ".webp")
    .map((name) => {
      const match = /^(\d+)_(\d+)\.webp$/i.exec(name);
      assert.ok(match, `Unexpected tile name: ${name}.`);
      return {
        input: join(tileRoot, name),
        left: Number(match[1]) * floor.tileSize,
        top: Number(match[2]) * floor.tileSize,
      };
    });
  assert.ok(inputs.length > 0, `${overlay.source.id} overview level is empty.`);
  mkdirSync(auditRoot, { recursive: true });
  const outputPath = join(auditRoot, `${overlay.source.id.replace(/[^a-z0-9-]+/gi, "-")}.png`);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 9, g: 12, b: 11, alpha: 1 },
    },
  }).composite(inputs).png().toFile(outputPath);
  return outputPath;
};

const report = [];
for (const mod of catalog.mods) {
  assert.ok(typeof mod.workshopId === "string", `${mod.displayName} has no Workshop ID.`);
  expectedWorkshopIds.delete(mod.workshopId);
  assert.ok(Array.isArray(mod.overlays) && mod.overlays.length > 0, `${mod.displayName} has no overlay.`);
  if (mod.dataPath) {
    const dataPath = join(root, mod.dataPath);
    assert.ok(existsSync(dataPath), `${mod.displayName} data file is missing.`);
    const data = JSON.parse(readFileSync(dataPath, "utf8"));
    assert.equal(data.schemaVersion, 1, `${mod.displayName} data schema is unsupported.`);
    assert.ok(Array.isArray(data.locations), `${mod.displayName} has no searchable location list.`);
    assert.ok(Array.isArray(data.lootIndex), `${mod.displayName} has no loot index list.`);
    if (data.locations.length > 0) {
      assert.ok(data.lootIndex.length > 0, `${mod.displayName} has locations but no loot index.`);
    } else {
      const mappedZoneCount =
        (data.statistics?.foragingZones ?? 0)
        + (data.statistics?.vehicleSpawnZones ?? 0)
        + (data.statistics?.spawnPoints ?? 0);
      assert.equal(data.statistics?.buildings, 0, `${mod.displayName} has buildings but no searchable locations.`);
      assert.ok(mappedZoneCount > 0, `${mod.displayName} has neither searchable locations nor mapped zones.`);
    }
  }

  let imageCount = 0;
  let byteCount = 0;
  const overviews = [];
  for (const overlay of mod.overlays) {
    const overlayRoot = join(root, overlay.source.basePath);
    assert.ok(existsSync(overlayRoot), `${overlay.source.id} output directory is missing.`);
    assert.equal(overlay.source.complete, true, `${overlay.source.id} is incomplete.`);
    const uniqueCells = new Set(overlay.cells);
    assert.equal(uniqueCells.size, overlay.cells.length, `${overlay.source.id} has duplicate cells.`);
    const rectangles = overlay.source.mapInfo.cell_rects;
    assert.ok(Array.isArray(rectangles) && rectangles.length > 0, `${overlay.source.id} has no cell rectangles.`);
    for (const cell of overlay.cells.map(parseCell)) {
      assert.equal(cell.length, 2, `${overlay.source.id} has an invalid cell.`);
      assert.ok(rectangles.some((rectangle) => isInsideRectangle(cell, rectangle)), `${overlay.source.id} cell ${cell} is outside its rectangles.`);
    }

    for (const floor of overlay.source.floors) {
      const layerName = getLayerName(floor.floor);
      const descriptorPath = join(overlayRoot, `${layerName}.dzi`);
      assert.ok(existsSync(descriptorPath), `${overlay.source.id} is missing ${layerName}.dzi.`);
      const descriptor = readFileSync(descriptorPath, "utf8");
      assert.match(descriptor, new RegExp(`TileSize="${floor.tileSize}"`));
      assert.match(descriptor, new RegExp(`Width="${floor.width}" Height="${floor.height}"`));
      for (const level of floor.levels) {
        const levelRoot = join(overlayRoot, `${layerName}_files`, String(level));
        assert.ok(existsSync(levelRoot), `${overlay.source.id} is missing ${layerName} level ${level}.`);
        const images = readdirSync(levelRoot)
          .filter((name) => extname(name).toLowerCase() === `.${floor.format}`);
        assert.ok(images.length > 0, `${overlay.source.id} ${layerName} level ${level} has no images.`);
        const ranges = floor.tileRanges?.[String(level)];
        assert.ok(Array.isArray(ranges), `${overlay.source.id} ${layerName} level ${level} has no tile ranges.`);
        const coveredTiles = new Set();
        for (const [row, minimumColumn, maximumColumn] of ranges) {
          for (let column = minimumColumn; column <= maximumColumn; column += 1) {
            coveredTiles.add(`${column}_${row}`);
          }
        }
        assert.equal(
          coveredTiles.size,
          images.length,
          `${overlay.source.id} ${layerName} level ${level} tile range count differs from its images.`,
        );
        for (const image of images) {
          const tileName = image.slice(0, -(floor.format.length + 1));
          assert.ok(
            coveredTiles.has(tileName),
            `${overlay.source.id} ${layerName} level ${level} does not cover ${image}.`,
          );
          const imagePath = join(levelRoot, image);
          if (fast) readWebpSignature(imagePath);
          else {
            const stats = await sharp(imagePath).metadata();
            assert.equal(stats.format, floor.format, `${imagePath} has an unexpected format.`);
          }
          imageCount += 1;
          byteCount += statSync(imagePath).size;
        }
      }
    }

    if (!fast) {
      const webpFiles = readdirSync(overlayRoot, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".webp");
      for (const entry of webpFiles) readWebpSignature(join(entry.parentPath, entry.name));
      overviews.push(await createOverview(overlay, overlayRoot));
    }
  }

  report.push({
    mod: mod.displayName,
    workshopId: mod.workshopId,
    cells: mod.overlays.reduce((total, overlay) => total + overlay.cells.length, 0),
    images: imageCount,
    imageMB: Number((byteCount / 1024 / 1024).toFixed(1)),
    overviews: overviews.map((path) => basename(path)),
  });
}

assert.equal(expectedWorkshopIds.size, 0, `Missing expected Workshop IDs: ${[...expectedWorkshopIds].join(", ")}.`);
console.log(JSON.stringify({ catalogMods: catalog.mods.length, report, auditRoot }, null, 2));
