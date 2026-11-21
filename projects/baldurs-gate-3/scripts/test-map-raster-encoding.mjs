import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { MAP_WEBP_OPTIONS } from "./lib/map-raster-encoding.mjs";
import { readRasterFrame, readSourceCrop } from "./lib/map-raster-frame.mjs";

sharp.cache(false);
assert.throws(() => readRasterFrame(new Map([["logical-width", "10"]]), 512, 512), /together/);
assert.throws(() => readRasterFrame(new Map([["logical-width", "-1"], ["logical-height", "20"]]), 512, 512), /positive/);
assert.throws(() => readSourceCrop('{"x":2,"y":0,"width":128,"height":128}', 512, 512), /boundary/);
assert.throws(() => readSourceCrop('{"x":508,"y":0,"width":128,"height":128}', 512, 512), /inside/);

const root = path.resolve(import.meta.dirname, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "map-raster-encoding-"));
const size = 512;
const raw = Buffer.alloc(size * size * 4);
const dds = Buffer.alloc(128 + size * size);
dds.writeUInt32LE(0x20534444, 0);
dds.writeUInt32LE(124, 4);
dds.writeUInt32LE(size, 12);
dds.writeUInt32LE(size, 16);
dds.writeUInt32LE(0x35545844, 84);
// Construct BC3 constant-colour blocks and an independent expected RGBA image.
// No production decoder is used to calculate the expected source pixels.
for (let y = 0; y < size / 4; y += 1) {
  for (let x = 0; x < size / 4; x += 1) {
    const r = (x * 3 + y) % 32;
    const g = (x + y * 5) % 64;
    const b = (x * 7 + y * 3) % 32;
    const alpha = (x + y) % 7 === 0 ? 85 : 255;
    const offset = 128 + (y * size / 4 + x) * 16;
    dds[offset] = alpha;
    dds.writeUInt16LE((r << 11) | (g << 5) | b, offset + 8);
    for (let py = 0; py < 4; py += 1) {
      for (let px = 0; px < 4; px += 1) {
        const pixel = ((y * 4 + py) * size + x * 4 + px) * 4;
        raw[pixel] = Math.round(r * 255 / 31);
        raw[pixel + 1] = Math.round(g * 255 / 63);
        raw[pixel + 2] = Math.round(b * 255 / 31);
        raw[pixel + 3] = alpha;
      }
    }
  }
}
const run = (script, args) => {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
};
const rgba = (input) => sharp(input).ensureAlpha().raw().toBuffer();
const error = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  let sum = 0;
  for (let index = 0; index < actual.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) sum += Math.abs(actual[index + channel] - expected[index + channel]);
  }
  return sum / (actual.length / 4 * 3);
};
try {
  const source = path.join(temporaryRoot, "source.dds");
  fs.writeFileSync(source, dds);
  const output = path.join(temporaryRoot, "published");
  const lossless = path.join(temporaryRoot, "intermediate");
  const common = ["--source", source, "--display-name", "Encoding fixture", "--max-level", "1"];
  run("build-bc3-map.mjs", [...common, "--output", output]);
  run("build-bc3-map.mjs", [...common, "--output", lossless, "--lossless-output", "true"]);
  const sourcePng = await sharp(raw, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
  let improvedError = 0;
  let previousError = 0;
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const tile = `tile${x}x${y}.webp`;
      const tilePng = await sharp(sourcePng).extract({ left: x * 256, top: y * 256, width: 256, height: 256 }).png().toBuffer();
      const expected = await rgba(tilePng);
      assert.deepEqual(await rgba(path.join(lossless, "tiles/0", tile)), expected, "Composite intermediates preserve original source pixels exactly");
      const published = await rgba(path.join(output, "tiles/0", tile));
      for (let index = 3; index < published.length; index += 4) assert.equal(published[index], expected[index], "Native silhouette alpha is lossless");
      improvedError += error(published, expected);
      previousError += error(await rgba(await sharp(tilePng).webp({ quality: 82, alphaQuality: 90, effort: 4 }).toBuffer()), expected);
    }
  }
  assert.ok(improvedError < previousError, "Higher quality encoding has lower source-pixel error on the deterministic fixture");
  const expectedParent = await sharp(sourcePng).resize(256, 256, { kernel: "lanczos3" }).webp(MAP_WEBP_OPTIONS).toBuffer();
  const parentError = error(await rgba(path.join(output, "tiles/1/tile0x0.webp")), await rgba(expectedParent));
  assert.ok(parentError < 0.75, `Parent is derived from lossless source tiles, not lossy published children (MAE ${parentError})`);
  const metadata = JSON.parse(fs.readFileSync(path.join(output, "metadata.json"), "utf8"));
  assert.deepEqual(metadata.bounds, { minX: 0, minY: 0, maxX: size, maxY: size });
  assert.equal(metadata.rasterEncoding.intermediate, "lossless");
  assert.equal(metadata.rasterEncoding.quality, 92);
  const logicalOutput = path.join(temporaryRoot, "logical-frame");
  run("build-bc3-map.mjs", [...common, "--output", logicalOutput, "--logical-width", "256", "--logical-height", "320",
    "--world-x", "0", "--world-y", "0", "--world-width", "100", "--world-height", "200"]);
  const logicalMetadata = JSON.parse(fs.readFileSync(path.join(logicalOutput, "metadata.json"), "utf8"));
  assert.deepEqual(logicalMetadata.bounds, { minX: 0, minY: 0, maxX: 256, maxY: 320 });
  assert.deepEqual(logicalMetadata.tileImageSize, { width: 512, height: 512 });
  assert.deepEqual(logicalMetadata.coordinateReference.imageBounds, { x: 0, y: 0, width: 256, height: 320 });
  const croppedOutput = path.join(temporaryRoot, "source-crop");
  run("build-bc3-map.mjs", [...common, "--output", croppedOutput, "--source-crop", '{"x":128,"y":256,"width":256,"height":128}']);
  const croppedMetadata = JSON.parse(fs.readFileSync(path.join(croppedOutput, "metadata.json"), "utf8"));
  assert.deepEqual(croppedMetadata.sourceImageBounds, { x: 128, y: 256, width: 256, height: 128 });
  assert.deepEqual(croppedMetadata.bounds, { minX: 0, minY: 0, maxX: 256, maxY: 128 });
  console.log(`Raster encoding passed: native RGB error ${(previousError / 4).toFixed(3)} → ${(improvedError / 4).toFixed(3)}, parent error ${parentError.toFixed(3)}, exact alpha and lossless composite intermediates.`);
} finally {
  const resolved = path.resolve(temporaryRoot);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("map-raster-encoding-")) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}
