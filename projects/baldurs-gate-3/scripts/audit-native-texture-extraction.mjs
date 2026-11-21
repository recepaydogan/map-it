import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { inspectBc3Raster } from "./lib/dds-source-inspection.mjs";

const root = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "map-sources/catalog/virtual-textures-exact.json"), "utf8"));
const entries = [];
for (const texture of catalog.textures) {
  const relative = `map-sources/processed/minimaps-exact/${texture.textureName}_0.dds`;
  const exact = fs.readFileSync(path.join(root, relative));
  const raster = inspectBc3Raster(exact, texture);
  assert.equal(exact.length, 128 + texture.width * texture.height, `${relative}: unexpected DDS payload size`);
  const old = fs.readFileSync(path.join(root, `map-sources/processed/minimaps/${texture.textureName}_0.dds`));
  const oldWidth = old.readUInt32LE(16);
  const oldHeight = old.readUInt32LE(12);
  assert.ok(oldWidth <= texture.width && oldHeight <= texture.height, "Previous source exceeds native dimensions");
  for (let row = 0; row < oldHeight / 4; row += 1) {
    assert.ok(old.subarray(128 + row * oldWidth * 4, 128 + (row + 1) * oldWidth * 4)
      .equals(exact.subarray(128 + row * texture.width * 4, 128 + row * texture.width * 4 + oldWidth * 4)),
    `${texture.textureName}: existing BC3 source blocks changed at row ${row}`);
  }
  entries.push({ texture: texture.textureName, source: relative, ...raster,
    previousWidth: oldWidth, previousHeight: oldHeight,
    restoredPixels: texture.width * texture.height - oldWidth * oldHeight,
    retainedBlocksIdentical: true });
}
const report = { schemaVersion: 1, stats: { textures: entries.length,
  recovered: entries.filter(({ restoredPixels }) => restoredPixels > 0).length,
  formerlyZeroSized: entries.filter(({ previousWidth, previousHeight }) => !previousWidth || !previousHeight).length,
  visible: entries.filter(({ status }) => status === "visible").length,
  transparent: entries.filter(({ status }) => status === "transparent").length,
  restoredPixels: entries.reduce((sum, { restoredPixels }) => sum + restoredPixels, 0) }, entries };
fs.writeFileSync(path.join(root, "map-sources/catalog/native-texture-extraction-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log("Native extraction audit:", report.stats);
