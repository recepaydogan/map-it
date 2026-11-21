import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 5, "Usage: audit-composite-resize-fit.mjs <recipe-config> <map-id> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [recipeFile, mapId, reportFile] = process.argv.slice(2);
assert(!fs.existsSync(reportFile));
const hashes = {};
const read = (file) => {
  const bytes = fs.readFileSync(path.resolve(root, file));
  hashes[path.relative(root, path.resolve(root, file)).replaceAll("\\", "/")] = createHash("sha256").update(bytes).digest("hex");
  return bytes;
};
const config = JSON.parse(read(recipeFile)), recipe = config.maps.find((map) => map.id === mapId);
assert(recipe?.layers?.length > 1);
assert(recipe.layers.every((layer) => layer.cropContent === false), "This diagnostic requires uncropped source layers");
const decode = (code, args) => {
  const result = spawnSync("python", ["-c", code, ...args], { cwd: root, maxBuffer: 128 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.toString());
  const width = result.stdout.readUInt32LE(0), height = result.stdout.readUInt32LE(4);
  const pixels = result.stdout.subarray(8); assert.equal(pixels.length, width * height * 4);
  return { width, height, pixels };
};
const ddsDecoder = 'import struct,sys;from PIL import Image;i=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",*i.size)+i.tobytes())';
const native = recipe.layers.map((layer) => { read(layer.source); return decode(ddsDecoder, [layer.source]); });
const worlds = recipe.layers.map(({ worldBounds: b }) => ({ x: b.centerX - b.width / 2, y: b.centerY - b.height / 2, width: b.width, height: b.height }));
const minX = Math.min(...worlds.map((b) => b.x)), minY = Math.min(...worlds.map((b) => b.y));
const maxX = Math.max(...worlds.map((b) => b.x + b.width)), maxY = Math.max(...worlds.map((b) => b.y + b.height));
const ppu = recipe.pixelsPerWorldUnit;
const width = Math.ceil((maxX - minX) * ppu), height = Math.ceil((maxY - minY) * ppu);
const meta = JSON.parse(read(`public/maps/${mapId}/metadata.json`));
assert.deepEqual(meta.bounds, { minX: 0, minY: 0, maxX: width, maxY: height });
const actual = Buffer.alloc(width * height * 4);
for (let x = 0; x < Math.ceil(width / meta.tileSize); x++) for (let y = 0; y < Math.ceil(height / meta.tileSize); y++) {
  const tile = await sharp(read(`public/maps/${mapId}/tiles/0/tile${x}x${y}.webp`)).ensureAlpha().raw().toBuffer();
  for (let row = 0; row < Math.min(meta.tileSize, height - y * meta.tileSize); row++) {
    const start = row * meta.tileSize * 4, length = Math.min(meta.tileSize, width - x * meta.tileSize) * 4;
    tile.copy(actual, ((y * meta.tileSize + row) * width + x * meta.tileSize) * 4, start, start + length);
  }
}
const modes = {}, layerResults = [];
for (const fit of ["cover", "fill"]) {
  const inputs = [];
  for (const [index, image] of native.entries()) {
    const b = worlds[index], targetWidth = Math.round(b.width * ppu), targetHeight = Math.round(b.height * ppu);
    const resized = await sharp(image.pixels, { raw: { width: image.width, height: image.height, channels: 4 } })
      .resize(targetWidth, targetHeight, { kernel: "lanczos3", fit }).png().toBuffer({ resolveWithObject: true });
    inputs.push({ input: resized.data, left: Math.round((b.x - minX) * ppu), top: Math.round((maxY - b.y - b.height) * ppu) });
    if (fit === "cover") layerResults.push({ source: recipe.layers[index].source, nativeWidth: image.width, nativeHeight: image.height,
      targetWidth, targetHeight, horizontalScale: targetWidth / image.width, verticalScale: targetHeight / image.height });
  }
  modes[fit] = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(inputs).raw().toBuffer();
}
const pillowCode = `import json,math,struct,sys
from PIL import Image
c=json.load(open(sys.argv[1],encoding="utf-8"));r=next(m for m in c["maps"] if m["id"]==sys.argv[2]);p=r["pixelsPerWorldUnit"]
ws=[(b["centerX"]-b["width"]/2,b["centerY"]-b["height"]/2,b["width"],b["height"]) for b in (l["worldBounds"] for l in r["layers"])]
x=min(w[0] for w in ws);y=min(w[1] for w in ws);right=max(w[0]+w[2] for w in ws);top=max(w[1]+w[3] for w in ws)
out=Image.new("RGBA",(math.ceil((right-x)*p),math.ceil((top-y)*p)));rnd=lambda v:math.floor(v+0.5)
for l,w in zip(r["layers"],ws):
 im=Image.open(l["source"]).convert("RGBA").resize((rnd(w[2]*p),rnd(w[3]*p)),Image.Resampling.LANCZOS)
 out.alpha_composite(im,(rnd((w[0]-x)*p),rnd((top-w[1]-w[3])*p)))
sys.stdout.buffer.write(struct.pack("<II",*out.size)+out.tobytes())`;
const pillow = decode(pillowCode, [recipeFile, mapId]);
assert.equal(pillow.width, width); assert.equal(pillow.height, height);
const compare = (a, b) => {
  let changedAlphaPixels = 0, maxAlphaError = 0, alphaAbsoluteError = 0, lostOpaquePixels = 0;
  for (let offset = 3; offset < a.length; offset += 4) {
    const difference = Math.abs(a[offset] - b[offset]);
    changedAlphaPixels += Number(difference !== 0); maxAlphaError = Math.max(maxAlphaError, difference); alphaAbsoluteError += difference;
    lostOpaquePixels += Number(a[offset] >= 240 && b[offset] === 0);
  }
  return { changedAlphaPixels, maxAlphaError, alphaAbsoluteError, lostOpaquePixels };
};
read(import.meta.filename); read("scripts/build-composite-bc3-map.mjs"); read("scripts/build-raster-map.mjs"); read("scripts/build-bc3-map.mjs");
const report = { kind: "native-composite-fit-diagnostic", mapId, width, height, layers: layerResults,
  publishedVsCover: compare(actual, modes.cover), publishedVsFill: compare(actual, modes.fill),
  pillowVsPublished: compare(pillow.pixels, actual), pillowVsCover: compare(pillow.pixels, modes.cover), pillowVsFill: compare(pillow.pixels, modes.fill), hashes };
writeGeneratedFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, hashes: Object.keys(hashes).length }));
