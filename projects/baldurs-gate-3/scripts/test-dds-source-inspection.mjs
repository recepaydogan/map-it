import assert from "node:assert/strict";
import { inspectBc3Raster } from "./lib/dds-source-inspection.mjs";

const dds = (width = 4, height = 4) => {
  const result = Buffer.alloc(128 + Math.ceil(width / 4) * Math.ceil(height / 4) * 16);
  result.writeUInt32LE(0x20534444, 0);
  result.writeUInt32LE(124, 4);
  result.writeUInt32LE(width, 16);
  result.writeUInt32LE(height, 12);
  result.writeUInt32LE(0x35545844, 84);
  return result;
};
assert.deepEqual(inspectBc3Raster(dds(0, 128)), { status: "zero-sized", width: 0, height: 128 });
assert.equal(inspectBc3Raster(dds()).status, "transparent");
const visible = dds();
visible[128] = 255;
assert.equal(inspectBc3Raster(visible).status, "visible");
const shortPalette = dds();
shortPalette[130] = 7;
assert.equal(inspectBc3Raster(shortPalette).status, "visible", "Short alpha palette index 7 is opaque even when both endpoints are zero");
const clipped = dds(1, 1);
clipped[130] = 7 << 3;
assert.equal(inspectBc3Raster(clipped).status, "transparent", "Padding pixels beyond native dimensions do not count as image content");
assert.throws(() => inspectBc3Raster(visible.subarray(0, 140)), /Truncated/);
assert.throws(() => inspectBc3Raster(Buffer.alloc(128)), /header/);
assert.throws(() => inspectBc3Raster(dds(0, 128), { width: 68, height: 128 }), /disagree/);
assert.throws(() => inspectBc3Raster(dds(256, 256), { width: 352, height: 260 }), /disagree/);
console.log("DDS source inspection passed: zero-sized, transparent, visible, short alpha palette, edge padding and invalid input.");
