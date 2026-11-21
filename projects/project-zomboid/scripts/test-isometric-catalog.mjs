import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collapseCellsToRectangles,
  createIsometricSourceFingerprint,
  writeIsometricCatalog,
  writeStandaloneIsometricCatalog,
} from "./isometric-catalog.mjs";

assert.deepEqual(collapseCellsToRectangles([
  { x: 0, y: 2 }, { x: 0, y: 3 },
  { x: 1, y: 2 }, { x: 1, y: 3 },
  { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 },
]), [[0, 2, 2, 2], [2, 0, 1, 4]]);

const root = mkdtempSync(join(tmpdir(), "pzim-catalog-"));
const mapRoot = join(root, "map");
const publishedRoot = join(root, "isometric");
const textureRoot = join(root, "textures");
const packRoot = join(publishedRoot, "packs", "cells-0-0-2-2");
mkdirSync(mapRoot, { recursive: true });
mkdirSync(textureRoot, { recursive: true });
mkdirSync(packRoot, { recursive: true });
for (const name of ["0_0.lotheader", "1_0.lotheader", "0_1.lotheader"]) {
  writeFileSync(join(mapRoot, name), "");
}
writeFileSync(join(textureRoot, "tiles.pack"), "first");
writeFileSync(join(packRoot, "manifest.json"), JSON.stringify({
  id: "cells-0-0-2-2",
  renderer: "test",
  rendererCommit: "test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  cellRange: [0, 0, 2, 2],
  layerRange: [0, 1],
  complete: false,
  mapInfo: { cell_size: 256 },
  floors: [{ floor: 0 }],
}));

try {
  const catalog = writeIsometricCatalog({ publishedRoot, mapRoot });
  assert.deepEqual(catalog.worldCellRange, [0, 0, 2, 2]);
  assert.equal(catalog.totalCells, 3);
  assert.equal(catalog.renderedCells, 3);
  assert.equal(catalog.complete, true);
  assert.deepEqual(catalog.floors, [0]);
  assert.equal(catalog.packs[0].basePath, "packs/cells-0-0-2-2");

  const firstFingerprint = createIsometricSourceFingerprint({
    mapRoot,
    textureRoot,
    rendererCommit: "test",
    renderProfile: "test",
  });
  assert.equal(firstFingerprint, createIsometricSourceFingerprint({
    mapRoot,
    textureRoot,
    rendererCommit: "test",
    renderProfile: "test",
  }));
  writeFileSync(join(textureRoot, "tiles.pack"), "changed-size");
  assert.notEqual(firstFingerprint, createIsometricSourceFingerprint({
    mapRoot,
    textureRoot,
    rendererCommit: "test",
    renderProfile: "test",
  }));

  const standaloneRoot = join(root, "standalone");
  mkdirSync(standaloneRoot, { recursive: true });
  const standalone = writeStandaloneIsometricCatalog({
    publishedRoot: standaloneRoot,
    mapRoot,
    manifest: {
      id: "global",
      generatedAt: "2026-01-01T00:00:00.000Z",
      complete: true,
      cellRange: [0, 0, 2, 2],
      mapInfo: { cell_size: 256 },
      floors: [{ floor: 0 }],
    },
  });
  assert.equal(standalone.complete, true);
  assert.equal(standalone.renderedCells, 3);
  assert.equal(standalone.packs[0].basePath, ".");
  console.log("Isometric catalog coverage and pack discovery tests passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
