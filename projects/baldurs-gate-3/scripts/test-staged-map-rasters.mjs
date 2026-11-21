import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { mergeRasterMetadata, validateStagedRaster, validateRasterBackup } from "./publish-staged-map-rasters.mjs";
import { preserveCoordinateFrame } from "./lib/map-raster-frame.mjs";

const current = {
  schemaVersion: 2, sourceBuild: "fixture", bounds: { minX: 0, minY: 0, maxX: 64, maxY: 32 },
  coordinateReference: { worldBounds: { x: -10, y: 20, width: 6.4, height: 3.2 },
    imageBounds: { x: 0, y: 0, width: 64, height: 32 }, flipY: true },
  tileSize: 64, detailLevels: [0], tilePattern: "tiles/{level}/tile{x}x{y}.webp",
  locationSources: ["locations.json"], contentSource: "content.json",
  locations: [{ id: "saved-marker", x: 32, y: 16 }], regions: [{ id: "kept-region" }],
};
const staged = { ...structuredClone(current), tileImageSize: { width: 128, height: 64 },
  rasterEncoding: { quality: 92, alphaQuality: 100, reusedLevelZero: false, nativeDimensionsVerified: true }, locations: [], regions: [] };
const merged = mergeRasterMetadata(current, staged);
assert.deepEqual(merged.locations, current.locations);
assert.deepEqual(merged.regions, current.regions);
assert.deepEqual(merged.tileImageSize, staged.tileImageSize);
assert.deepEqual(merged.coordinateReference, current.coordinateReference);
const recovered = { ...staged, ...preserveCoordinateFrame({ worldBounds: { x: -11, y: 19, width: 8, height: 5 }, flipY: true }, current.coordinateReference, 160, 100) };
assert.deepEqual(mergeRasterMetadata(current, recovered).bounds, recovered.bounds);
const drift = structuredClone(staged);
drift.coordinateReference.worldBounds.x += 1e-10;
assert.deepEqual(mergeRasterMetadata(current, drift).coordinateReference, current.coordinateReference);
drift.coordinateReference.worldBounds.x += 0.001;
assert.throws(() => mergeRasterMetadata(current, drift), /coordinateReference/);
for (const change of [
  { bounds: { ...current.bounds, maxX: 128 } }, { sourceBuild: "different" },
  { contentSource: "other.json" }, { locationSources: [] }, { detailLevels: [1] },
  { tilePattern: "../../{level}" }, { tileImageSize: { width: -1, height: 64 } },
  { rasterEncoding: { ...staged.rasterEncoding, reusedLevelZero: true } },
  { rasterEncoding: { ...staged.rasterEncoding, nativeDimensionsVerified: false } },
]) assert.throws(() => mergeRasterMetadata(current, { ...staged, ...change }));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "staged-raster-test-"));
sharp.cache(false);
try {
  const before = path.join(directory, "before");
  const after = path.join(directory, "after");
  fs.mkdirSync(before);
  fs.mkdirSync(path.join(after, "tiles", "0"), { recursive: true });
  fs.writeFileSync(path.join(before, "metadata.json"), JSON.stringify(current));
  fs.writeFileSync(path.join(after, "metadata.json"), JSON.stringify(staged));
  const tile = await sharp({ create: { width: 64, height: 64, channels: 4, background: "red" } }).webp().toBuffer();
  fs.writeFileSync(path.join(after, "tiles/0/tile0x0.webp"), tile);
  await assert.rejects(validateStagedRaster(before, after), /ENOENT/);
  fs.writeFileSync(path.join(after, "tiles/0/tile1x0.webp"), tile);
  await assert.rejects(validateStagedRaster(before, after), /ENOENT/);
  fs.writeFileSync(path.join(after, "overview.webp"), tile);
  await assert.rejects(validateStagedRaster(before, after), /overview/);
  fs.writeFileSync(path.join(after, "overview.webp"), await sharp(tile).resize(128, 64).webp().toBuffer());
  assert.equal((await validateStagedRaster(before, after)).files.length, 2);
  const backup = path.join(directory, "backup");
  const resumeStage = path.join(directory, "resume-stage");
  fs.mkdirSync(backup);
  fs.mkdirSync(resumeStage);
  fs.cpSync(before, path.join(backup, "example"), { recursive: true });
  fs.cpSync(after, path.join(resumeStage, "example"), { recursive: true });
  assert.throws(() => validateRasterBackup(backup, ["example"], resumeStage), /ENOENT/,
    "A partial backup cannot authorize resuming a replacement");
  fs.mkdirSync(path.join(backup, "example/tiles/0"), { recursive: true });
  fs.writeFileSync(path.join(backup, "example/overview.webp"), tile);
  fs.writeFileSync(path.join(backup, "example/tiles/0/tile0x0.webp"), tile);
  validateRasterBackup(backup, ["example"], resumeStage);
  assert.throws(() => validateRasterBackup(backup, ["example", "missing"], resumeStage), /registered maps/);
  fs.writeFileSync(path.join(backup, "example/tiles/0/tile0x0.webp"), Buffer.alloc(0));
  assert.throws(() => validateRasterBackup(backup, ["example"], resumeStage), /empty/);
  fs.writeFileSync(path.join(after, "tiles/0/tile1x0.webp"), Buffer.from("broken"));
  await assert.rejects(validateStagedRaster(before, after), /unsupported image format/);
} finally {
  assert.ok(directory.startsWith(`${os.tmpdir()}${path.sep}staged-raster-test-`));
  fs.rmSync(directory, { recursive: true, force: true });
}
console.log("Staged raster checks passed: stable coordinates, protected marker data, complete valid tiles.");
