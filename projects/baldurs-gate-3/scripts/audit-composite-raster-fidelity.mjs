import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 5, "Usage: audit-composite-raster-fidelity.mjs <baseline-snapshot> <staged-raster-root> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [snapshotPath, rasterRoot, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
assert(!fs.existsSync(output));
sharp.cache(false);
const hashes = {};
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (file) => { const bytes = fs.readFileSync(path.resolve(root, file)); hashes[relative(file)] = digest(bytes); return bytes; };
const json = (file) => JSON.parse(read(file));
const source = (file) => read(file).toString("utf8").replaceAll("\r\n", "\n");
const snapshot = json(snapshotPath), prior = json(snapshot.proofPath);
assert.equal(digest(read(snapshot.proofPath)), snapshot.proofHash);
assert.deepEqual(prior.errors, []);
for (const [file, hash] of Object.entries(prior.hashes)) {
  const old = snapshot.snapshots[file]; if (old) assert.equal(old.hash, hash);
  assert.equal(digest(read(old?.path ?? file)), hash, `Baseline changed: ${file}`);
}
for (const capture of Object.values(snapshot.snapshots)) assert.equal(digest(read(capture.path)), capture.hash);
for (const file of ["scripts/build-composite-bc3-map.mjs", "scripts/build-raster-map.mjs"]) {
  const before = source(snapshot.snapshots[file].path), after = source(file);
  const withoutNewComments = after.replace(/\s*\/\/ Both dimensions come from the authored world rectangle\. Preserve\n\s*\/\/ its complete extent; the default cover fit crops rounded edges\./, "")
    .replace('  const sourcePixels = await sharp(sourcePath).ensureAlpha().raw().toBuffer();\n', "")
    .replace(/    \/\/ Each level pixel spans exactly 2 \*\* level source pixels in the viewer\.[\s\S]*?    const \{ data, info \} = await sharp\(grid, \{ raw: \{ width: gridWidth, height: gridHeight, channels: 4 \} \}\)/,
      "    const { data, info } = await sharp(sourcePath)");
  assert.equal(withoutNewComments.replace(', fit: "fill"', "").replaceAll(/\s+/g, " "), before.replaceAll(/\s+/g, " "), `Unexpected renderer change: ${file}`);
  assert(after.includes('kernel: "lanczos3", fit: "fill"'));
}
const rasterSource = source("scripts/build-raster-map.mjs");
for (const invariant of ["const gridWidth = width * scale;", "const gridHeight = height * scale;",
  ".extend({ right: gridWidth - sourceWidth, bottom: gridHeight - sourceHeight,", ".raw().toBuffer();",
  "sharp(grid, { raw: { width: gridWidth, height: gridHeight, channels: 4 } })"]) assert(rasterSource.includes(invariant));
const viewerSource = source("src/features/map/map-tile-utils.ts");
assert(viewerSource.includes("const tileSpan = raster.tileSize * 2 ** level;"));
assert.equal(digest(read("scripts/build-bc3-map.mjs")), snapshot.snapshots["scripts/build-bc3-map.mjs"].hash);
assert.equal(digest(read("scripts/lib/map-raster-encoding.mjs")), snapshot.snapshots["scripts/lib/map-raster-encoding.mjs"].hash);
const candidate = json(prior.candidate), config = json("map-sources/config/bc3-maps.json");
const recipes = config.maps.filter((map) => Array.isArray(map.layers));
const textureCatalog = json(config.nativeTextureCatalog);
const textures = new Map(textureCatalog.textures.map((texture) => [texture.textureName, texture]));
assert.deepEqual(fs.readdirSync(rasterRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(), recipes.map(({ id }) => id).sort());
read("scripts/read-native-raster-layer.py");
const results = [];
const errors = [];
for (const recipe of recipes) {
  const current = json(`public/maps/${recipe.id}/metadata.json`), staged = json(path.join(rasterRoot, recipe.id, "metadata.json"));
  const layers = recipe.layers.map((layer) => {
    read(layer.source);
    const result = spawnSync("python", ["scripts/read-native-raster-layer.py", JSON.stringify(layer)], { cwd: root, maxBuffer: 512 * 1024 * 1024 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr.toString());
    const length = result.stdout.readUInt32LE(0), info = JSON.parse(result.stdout.subarray(4, 4 + length));
    const pixels = result.stdout.subarray(4 + length);
    assert.equal(pixels.length, info.crop[2] * info.crop[3] * 4);
    const descriptor = textures.get(path.basename(layer.source).replace(/_0\.dds$/, ""));
    assert(descriptor && descriptor.width === info.nativeWidth && descriptor.height === info.nativeHeight);
    return { ...info, pixels, source: layer.source };
  });
  const minX = Math.min(...layers.map((l) => l.world.x)), minY = Math.min(...layers.map((l) => l.world.y));
  const maxX = Math.max(...layers.map((l) => l.world.x + l.world.width)), maxY = Math.max(...layers.map((l) => l.world.y + l.world.height));
  const ppu = recipe.pixelsPerWorldUnit ?? 20;
  const width = Math.ceil((maxX - minX) * ppu), height = Math.ceil((maxY - minY) * ppu);
  const actualSize = (meta) => meta.tileImageSize ?? { width: meta.bounds.maxX - meta.bounds.minX, height: meta.bounds.maxY - meta.bounds.minY };
  assert.deepEqual(actualSize(staged), { width, height });
  assert.deepEqual(actualSize(staged), actualSize(current));
  assert.deepEqual(staged.detailLevels, current.detailLevels);
  for (const field of ["schemaVersion", "displayName", "description", "sourceBuild", "rasterEncoding", "tileSize", "tilePattern", "locationSources", "contentSource", "regions", "locations"]) assert.deepEqual(staged[field], current[field], `${recipe.id}: ${field}`);
  const expectedWorld = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  for (const [field, value] of Object.entries(expectedWorld)) assert(Math.abs(staged.coordinateReference.worldBounds[field] - value) < 1e-8);
  assert.equal(staged.coordinateReference.flipY, current.coordinateReference.flipY);
  const project = (point, reference) => [reference.imageBounds.x + (point.x - reference.worldBounds.x) / reference.worldBounds.width * reference.imageBounds.width,
    reference.imageBounds.y + (reference.flipY ? 1 - (point.z - reference.worldBounds.y) / reference.worldBounds.height : (point.z - reference.worldBounds.y) / reference.worldBounds.height) * reference.imageBounds.height];
  const content = json(`${candidate.mapStage}/public/maps/${recipe.id}/content.json`);
  const locations = json(`${candidate.mapStage}/public/maps/${recipe.id}/locations.json`).locations;
  for (const entity of content.entities) {
    const before = project(entity.worldPosition, current.coordinateReference), after = project(entity.worldPosition, staged.coordinateReference);
    assert(Math.hypot(before[0] - after[0], before[1] - after[1]) < 1e-7, `Moved logical point: ${recipe.id}/${entity.id}`);
  }
  const composites = [];
  for (const layer of layers) {
    const { world: b, crop } = layer;
    composites.push({ input: await sharp(layer.pixels, { raw: { width: crop[2], height: crop[3], channels: 4 } })
      .resize(Math.round(b.width * ppu), Math.round(b.height * ppu), { fit: "fill", kernel: "lanczos3" }).png().toBuffer(),
    left: Math.round((b.x - minX) * ppu), top: Math.round((maxY - (b.y + b.height)) * ppu) });
  }
  const expected = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).raw().toBuffer();
  const levels = [];
  const levelZero = Buffer.alloc(width * height * 4);
  for (const level of staged.detailLevels) {
    const scale = 2 ** level;
    const w = Math.ceil(width / scale), h = Math.ceil(height / scale), tileSize = staged.tileSize;
    const cols = Math.ceil(w / tileSize), rows = Math.ceil(h / tileSize);
    // Independently copy original rows into a zero-filled, exact-scale grid.
    // This does not use the producer's Sharp pre-padding implementation.
    const gridWidth = w * scale, gridHeight = h * scale;
    assert.equal(w / gridWidth, 1 / scale);
    assert.equal(h / gridHeight, 1 / scale);
    const grid = Buffer.alloc(gridWidth * gridHeight * 4);
    for (let row = 0; row < height; row++) expected.copy(grid, row * gridWidth * 4, row * width * 4, (row + 1) * width * 4);
    const reference = await sharp(grid, { raw: { width: gridWidth, height: gridHeight, channels: 4 } }).resize(w, h, { fit: "fill", kernel: "lanczos3" })
      .extend({ right: cols * tileSize - w, bottom: rows * tileSize - h, background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
    let changedAlpha = 0, rgbError = 0, opaque = 0, tiles = 0;
    for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
      const bytes = read(path.join(rasterRoot, recipe.id, `tiles/${level}/tile${x}x${y}.webp`));
      const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert(decoded.info.width === tileSize && decoded.info.height === tileSize && decoded.info.channels === 4);
      if (level === 0) for (let row = 0; row < Math.min(tileSize, height - y * tileSize); row++) {
        decoded.data.copy(levelZero, ((y * tileSize + row) * width + x * tileSize) * 4,
          row * tileSize * 4, (row * tileSize + Math.min(tileSize, width - x * tileSize)) * 4);
      }
      for (let py = 0; py < tileSize; py++) for (let px = 0; px < tileSize; px++) {
        const a = (py * tileSize + px) * 4, b = ((y * tileSize + py) * cols * tileSize + x * tileSize + px) * 4;
        if (decoded.data[a + 3] !== reference[b + 3]) changedAlpha++;
        if (reference[b + 3] >= 240) { opaque++; rgbError += Math.abs(decoded.data[a] - reference[b]) + Math.abs(decoded.data[a + 1] - reference[b + 1]) + Math.abs(decoded.data[a + 2] - reference[b + 2]); }
      }
      tiles++;
    }
    if (changedAlpha) errors.push({ mapId: recipe.id, level, kind: "alpha-reconstruction", changedAlpha });
    levels.push({ level, tiles, changedAlpha, sourcePixelsPerLevelPixel: scale,
      nativePadding: { right: gridWidth - width, bottom: gridHeight - height },
      previousUnpaddedScale: { x: width / w, y: height / h },
      meanOpaqueRgbError: opaque ? rgbError / (3 * opaque) : 0 });
  }
  const oldTileCache = new Map();
  const pinAlphaChanges = [], existingTransparentPins = [];
  for (const location of locations) {
    const x = Math.floor((location.x - staged.bounds.minX) / (staged.bounds.maxX - staged.bounds.minX) * width);
    const y = Math.floor((location.y - staged.bounds.minY) / (staged.bounds.maxY - staged.bounds.minY) * height);
    const inBounds = x >= 0 && y >= 0 && x < width && y < height;
    let before = 0, after = 0;
    if (inBounds) {
      const tileSize = staged.tileSize, column = Math.floor(x / tileSize), row = Math.floor(y / tileSize);
      const key = `${column}x${row}`;
      if (!oldTileCache.has(key)) oldTileCache.set(key, await sharp(read(`public/maps/${recipe.id}/tiles/0/tile${key}.webp`)).ensureAlpha().raw().toBuffer());
      before = oldTileCache.get(key)[((y % tileSize) * tileSize + x % tileSize) * 4 + 3];
      after = levelZero[(y * width + x) * 4 + 3];
    }
    if (before !== after) pinAlphaChanges.push({ id: location.id, name: location.name, before, after });
    if (after === 0) existingTransparentPins.push({ id: location.id, name: location.name, before, after, inBounds });
    if (before >= 32 && after === 0) errors.push({ mapId: recipe.id, kind: "new-transparent-pin", id: location.id,
      name: location.name, before, after, physicalPosition: { x, y } });
  }
  const overview = read(path.join(rasterRoot, recipe.id, "overview.webp"));
  const overviewInfo = await sharp(overview).metadata();
  assert(overviewInfo.width > 0 && overviewInfo.height > 0 && Math.max(overviewInfo.width, overviewInfo.height) <= 3072);
  const result = { mapId: recipe.id, width, height, preservedWorldPositions: content.entities.length,
    checkedDisplayPins: locations.length, pinAlphaChanges, existingTransparentPins,
    nativeLayers: layers.map(({ pixels, ...info }) => info), levels, overviewBytes: overview.length };
  results.push(result);
  console.log(JSON.stringify({ mapId: recipe.id, alphaExact: levels.every((level) => level.changedAlpha === 0),
    levels: levels.length, pinsPreserved: content.entities.length, errors: errors.filter((error) => error.mapId === recipe.id).length }));
}
read(import.meta.filename); read("scripts/build-registered-bc3-maps.mjs"); read("scripts/build-map-overviews.mjs"); read("scripts/lib/write-generated-file.mjs");
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), expected, `Input changed during audit: ${file}`);
const report = { kind: "independent-native-composite-grid-audit", snapshotPath: relative(snapshotPath), rasterRoot: relative(rasterRoot),
  stage: candidate.mapStage, itemsPath: candidate.itemsPath, indexPath: candidate.indexPath, registryCandidate: prior.candidate,
  stats: { maps: results.length, nativeLayers: results.reduce((n, r) => n + r.nativeLayers.length, 0),
    tiles: results.reduce((n, r) => n + r.levels.reduce((a, l) => a + l.tiles, 0), 0),
    checkedDisplayPins: results.reduce((n, r) => n + r.checkedDisplayPins, 0),
    changedPinAlpha: results.reduce((n, r) => n + r.pinAlphaChanges.length, 0),
    existingTransparentPins: results.reduce((n, r) => n + r.existingTransparentPins.length, 0),
    preservedWorldPositions: results.reduce((n, r) => n + r.preservedWorldPositions, 0), baselineHashes: Object.keys(prior.hashes).length },
  results, errors, hashes,
  limitations: ["Independent DDS RGB decoding uses Pillow; BC3 alpha is decoded by NumPy with explicit nearest-UNORM8 rounding. Pillow differences are recorded per source.",
    "Crop/placement and raw grid padding are reconstructed independently; interpolation uses the same libvips kernel as production, not an independent resampler.",
    "Lossy WebP RGB is measured, not claimed byte-identical to native DDS. Alpha is compared exactly at every staged pyramid level.",
    "No publication or browser/game test occurred. Full coverage, scene semantics, saved-state migration and final publication remain open."] };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, errors: errors.length, hashes: Object.keys(hashes).length, output: relative(output) }));
if (errors.length) process.exitCode = 1;
