import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { optimizeIsometricMap } from "./isometric-map-optimizer.mjs";

const root = mkdtempSync(join(tmpdir(), "pzim-isometric-optimizer-"));
const sourceRoot = join(root, "source");
const targetRoot = join(root, "target");
for (const level of [0, 1, 2]) {
  const directory = join(sourceRoot, "layer0_files", String(level));
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "0_0.webp"), "tile");
}
writeFileSync(join(sourceRoot, "layer0.dzi"), '<Image TileSize="1024" Format="webp"><Size Width="4096" Height="2048"/></Image>');
writeFileSync(join(sourceRoot, "map_info.json"), "{}");
writeFileSync(join(sourceRoot, "manifest.json"), JSON.stringify({
  renderer: "test",
  rendererCommit: "test",
  cellRange: [0, 0, 1, 1],
  layerRange: [0, 1],
  complete: false,
  mapInfo: { w: 4096, h: 2048, x0: 0, y0: 0, sqr: 128, scale: 1, minlayer: 0, maxlayer: 1, cell_size: 256 },
  floors: [{ floor: 0, tileSize: 1024, format: "webp", width: 4096, height: 2048, levels: [0, 1, 2] }],
}));
writeFileSync(join(sourceRoot, "catalog.json"), JSON.stringify({
  schemaVersion: 1,
  worldCellRange: [0, 0, 1, 1],
  cellSize: 256,
  totalCells: 1,
  renderedCells: 1,
  complete: false,
  floors: [0],
  packs: [{ id: "legacy-preview", basePath: "." }],
}));

const catalog = optimizeIsometricMap({ sourceRoot, targetRoot, droppedLevels: 2 });
const manifest = JSON.parse(readFileSync(join(targetRoot, "manifest.json"), "utf8"));
const dzi = readFileSync(join(targetRoot, "layer0.dzi"), "utf8");
assert.deepEqual(catalog.floors, [0]);
assert.deepEqual(manifest.floors[0].levels, [0]);
assert.equal(manifest.mapInfo.scale, 4);
assert.equal(manifest.mapInfo.w, 1024);
assert.match(dzi, /Width="1024"/);
assert.match(dzi, /Height="512"/);
console.log("Ground-only isometric optimization tests passed.");
