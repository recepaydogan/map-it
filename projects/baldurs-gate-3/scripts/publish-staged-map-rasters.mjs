import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { writeGeneratedFile, withTransientFileRetry } from "./lib/write-generated-file.mjs";

const rasterFields = ["tileSize", "detailLevels", "tilePattern", "tileImageSize", "sourceImageBounds", "sourceTextureSize", "rasterEncoding"];
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));

const equalCoordinates = (current, staged, field) => {
  if (typeof current === "number" && typeof staged === "number") {
    assert.ok(Number.isFinite(current) && Number.isFinite(staged) && Math.abs(current - staged) < 1e-8,
      `${field} changed: ${current} -> ${staged}`);
  } else if (current && staged && typeof current === "object" && typeof staged === "object") {
    assert.deepEqual(Object.keys(current).sort(), Object.keys(staged).sort(), `${field} changed shape`);
    for (const key of Object.keys(current)) equalCoordinates(current[key], staged[key], `${field}.${key}`);
  } else assert.equal(staged, current, `${field} changed`);
};

export const assertStableRasterCoordinates = (current, staged) => {
  const before = current.coordinateReference;
  const after = staged.coordinateReference;
  assert.equal(after?.flipY, before?.flipY, "Map orientation changed");
  const project = (x, z, reference) => {
    const world = reference.worldBounds;
    const image = reference.imageBounds;
    for (const rectangle of [world, image]) assert.ok(rectangle
      && [rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite)
      && rectangle.width > 0 && rectangle.height > 0, "Invalid coordinate rectangle");
    return [image.x + (x - world.x) / world.width * image.width,
      image.y + (reference.flipY ? 1 - (z - world.y) / world.height : (z - world.y) / world.height) * image.height];
  };
  for (const [x, z] of [[before.worldBounds.x, before.worldBounds.y],
    [before.worldBounds.x + before.worldBounds.width, before.worldBounds.y + before.worldBounds.height]]) {
    const a = project(x, z, before);
    const b = project(x, z, after);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7, "World-to-map coordinateReference changed");
  }
  const image = after.imageBounds;
  equalCoordinates(staged.bounds, { minX: image.x, minY: image.y, maxX: image.x + image.width, maxY: image.y + image.height }, "bounds");
};

/** Recovering missing edge pixels may extend bounds, but cannot move saved points. */
export const mergeRasterMetadata = (current, staged) => {
  assertStableRasterCoordinates(current, staged);
  for (const field of ["schemaVersion", "sourceBuild", "locationSources", "contentSource"]) {
    assert.deepEqual(staged[field], current[field], `${field} changed`);
  }
  assert.equal(staged.tilePattern, "tiles/{level}/tile{x}x{y}.webp", "Unsupported staged tile path");
  assert.ok(Number.isInteger(staged.tileSize) && staged.tileSize > 0, "Invalid tile size");
  assert.ok(Array.isArray(staged.detailLevels) && staged.detailLevels.includes(0)
    && staged.detailLevels.every((level) => Number.isInteger(level) && level >= 0 && level <= 16)
    && new Set(staged.detailLevels).size === staged.detailLevels.length, "Invalid detail levels");
  const size = staged.tileImageSize ?? {
    width: staged.bounds.maxX - staged.bounds.minX, height: staged.bounds.maxY - staged.bounds.minY,
  };
  assert.ok([size.width, size.height].every((value) => Number.isInteger(value) && value > 0), "Invalid physical image dimensions");
  assert.equal(staged.rasterEncoding?.reusedLevelZero ?? false, false, "Quality replacement must use the original source");
  assert.equal(staged.rasterEncoding?.quality, 92, "Unexpected raster quality");
  assert.equal(staged.rasterEncoding?.alphaQuality, 100, "Unexpected alpha quality");
  assert.equal(staged.rasterEncoding?.nativeDimensionsVerified, true, "Staged imagery was not verified against the original texture dimensions");
  const merged = { ...current };
  for (const field of rasterFields) {
    delete merged[field];
    if (staged[field] !== undefined) merged[field] = staged[field];
  }
  // A different source rectangle is allowed only with the identical affine
  // world-to-map transform checked above. The old markers stay untouched.
  if (JSON.stringify(current.bounds) !== JSON.stringify(staged.bounds)) {
    merged.bounds = staged.bounds;
    merged.coordinateReference = staged.coordinateReference;
  }
  return merged;
};

export const validateStagedRaster = async (currentDirectory, stagedDirectory) => {
  const current = readJson(path.join(currentDirectory, "metadata.json"));
  const staged = readJson(path.join(stagedDirectory, "metadata.json"));
  const metadata = mergeRasterMetadata(current, staged);
  const width = staged.tileImageSize?.width ?? staged.bounds.maxX - staged.bounds.minX;
  const height = staged.tileImageSize?.height ?? staged.bounds.maxY - staged.bounds.minY;
  const files = [];
  for (const level of staged.detailLevels) {
    const span = staged.tileSize * 2 ** level;
    for (let x = 0; x < Math.ceil(width / span); x += 1) {
      for (let y = 0; y < Math.ceil(height / span); y += 1) {
        const relative = path.join("tiles", String(level), `tile${x}x${y}.webp`);
        const bytes = fs.readFileSync(path.join(stagedDirectory, relative));
        const info = await sharp(bytes).metadata();
        assert.ok(info.format === "webp" && info.width === staged.tileSize && info.height === staged.tileSize,
          `Invalid staged tile: ${relative}`);
        files.push(relative);
      }
    }
  }
  const overview = "overview.webp";
  const preview = await sharp(fs.readFileSync(path.join(stagedDirectory, overview))).metadata();
  assert.ok(preview.format === "webp" && preview.width > 0 && preview.height > 0
    && preview.width <= Math.min(width, 3072) && preview.height <= Math.min(height, 3072)
    && Math.abs(preview.width - preview.height * width / height) <= 2,
  "Staged overview does not match the native raster dimensions");
  return { metadata, files, overview };
};

/** A resume must keep the first complete backup, never back up mixed outputs. */
export const validateRasterBackup = (backupDirectory, ids, stagedRoot) => {
  const actual = fs.readdirSync(backupDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();
  assert.deepEqual(actual, [...ids].sort(), "Resume backup does not cover exactly the registered maps");
  for (const id of ids) {
    const directory = path.join(backupDirectory, id);
    const before = readJson(path.join(directory, "metadata.json"));
    const staged = readJson(path.join(stagedRoot, id, "metadata.json"));
    mergeRasterMetadata(before, staged);
    const width = before.tileImageSize?.width ?? before.bounds.maxX - before.bounds.minX;
    const height = before.tileImageSize?.height ?? before.bounds.maxY - before.bounds.minY;
    assert.ok(fs.statSync(path.join(directory, "overview.webp")).size > 0, "Backup overview is empty");
    for (const level of before.detailLevels) {
      const span = before.tileSize * 2 ** level;
      for (let x = 0; x < Math.ceil(width / span); x += 1) for (let y = 0; y < Math.ceil(height / span); y += 1) {
        const tile = path.join(directory, "tiles", String(level), `tile${x}x${y}.webp`);
        assert.ok(fs.statSync(tile).size > 0, `Backup tile is empty: ${tile}`);
      }
    }
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  assert.ok(args.length >= 2 && args[0] === "--source"
    && (args.length === 2 || (args[2] === "--publish" && (args.length === 3
      || (args.length === 5 && args[3] === "--resume-backup")))),
  "Expected --source map-sources/staging-directory [--publish [--resume-backup original-backup-directory]]");
  const root = path.resolve(import.meta.dirname, "..");
  const sources = fs.realpathSync(path.join(root, "map-sources"));
  const stage = fs.realpathSync(path.resolve(root, args[1]));
  assert.ok(stage.startsWith(`${sources}${path.sep}`), "Staging must be inside map-sources");
  const publicRoot = fs.realpathSync(path.join(root, "public", "maps"));
  const ids = readRegisteredMapIds(fs.readFileSync(path.join(root, "src/features/map/map-registry.ts"), "utf8"));
  const plans = [];
  sharp.cache(false);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Unsafe registered map ID");
    const source = fs.realpathSync(path.join(stage, id));
    const target = fs.realpathSync(path.join(publicRoot, id));
    assert.ok(source.startsWith(`${stage}${path.sep}`) && target.startsWith(`${publicRoot}${path.sep}`), "Map path escaped its root");
    plans.push({ id, source, target, ...await validateStagedRaster(target, source) });
  }
  console.log(`Validated ${plans.length} maps and ${plans.reduce((sum, plan) => sum + plan.files.length, 0)} tiles; logical coordinates unchanged.`);
  if (!args.includes("--publish")) return;

  // Back up every generated asset before the first public write. No marker or
  // content files are copied, deleted, or regenerated by raster publication.
  const backup = args[3] === "--resume-backup" ? fs.realpathSync(path.resolve(root, args[4]))
    : fs.mkdtempSync(path.join(sources, "quality-raster-backup-"));
  assert.equal(path.dirname(backup), sources, "Backup must be directly inside map-sources");
  assert.ok(path.basename(backup).startsWith("quality-raster-backup-"), "Invalid raster backup directory");
  if (args[3] === "--resume-backup") {
    validateRasterBackup(backup, ids, stage);
  } else {
    for (const { id, target } of plans) {
      const directory = path.join(backup, id);
      fs.mkdirSync(directory);
      fs.copyFileSync(path.join(target, "metadata.json"), path.join(directory, "metadata.json"));
      if (fs.existsSync(path.join(target, "overview.webp"))) fs.copyFileSync(path.join(target, "overview.webp"), path.join(directory, "overview.webp"));
      fs.cpSync(path.join(target, "tiles"), path.join(directory, "tiles"), { recursive: true, errorOnExist: true, force: false });
    }
  }
  console.log(`Original raster backup: ${backup}`);
  for (const { id, source, target, metadata, files, overview } of plans) {
    for (const relative of [...files, overview]) {
      const destination = path.join(target, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const bytes = fs.readFileSync(path.join(source, relative));
      await withTransientFileRetry(() => writeGeneratedFile(destination, bytes), {
        onRetry: (error, attempt) => console.warn(`Retrying ${id}/${relative} after ${error.code} (attempt ${attempt}).`),
      });
    }
    await withTransientFileRetry(() => writeGeneratedFile(path.join(target, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`), {
      onRetry: (error, attempt) => console.warn(`Retrying ${id}/metadata.json after ${error.code} (attempt ${attempt}).`),
    });
    console.log(`Published ${id}: ${files.length} tiles; markers and content untouched.`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
