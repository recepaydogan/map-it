import assert from "node:assert/strict";
import {
  createExternalIsometricMap,
  PROJECT_ZOMBOID_MAP_B42_GENERATED_AT,
  PROJECT_ZOMBOID_MAP_B42_METADATA,
} from "../src/features/map/isometric-map-source.ts";
import {
  getIsometricPyramidMaximumLevel,
  isTileInIsometricRanges,
} from "../src/features/map/map-isometric-tile-ranges.ts";

const { catalog, source } = createExternalIsometricMap({
  basePath: "https://tiles.example.test/base/",
  generatedAt: "2026-08-10T00:00:00.000Z",
  id: "external-test",
  payload: {
    w: 2_314_368,
    h: 1_019_040,
    cell_size: 256,
    minlayer: 0,
    maxlayer: 0,
    cell_rects: [[0, 18, 45, 45], [45, 3, 13, 60], [58, 0, 20, 63]],
    x0: 1_036_288,
    y0: -139_296,
    sqr: 128,
    git_commit: "renderer-test",
    tileRanges: {
      "14": [[2, 8, 8]],
      "15": [[3, 17, 17]],
    },
  },
});

assert.equal(source.basePath, "https://tiles.example.test/base");
assert.equal(source.tileSourceKind, "direct");
assert.equal(source.floors.length, 1);
assert.equal(source.floors.find(({ floor }) => floor === 0)?.format, "jpg");
assert.deepEqual(source.floors[0]?.levels, [14, 15]);
assert.deepEqual(source.floors[0]?.tileRanges?.["14"], [[2, 8, 8]]);
assert.deepEqual(source.cellRange, [0, 0, 78, 63]);
assert.deepEqual(source.layerRange, [0, 1]);
assert.equal(catalog.totalCells, 4065);
assert.equal(catalog.renderedCells, 4065);
assert.equal(catalog.complete, true);

const hosted = createExternalIsometricMap({
  basePath: "https://pz.ingredientassets.com/b42.20.2-r1/global",
  generatedAt: PROJECT_ZOMBOID_MAP_B42_GENERATED_AT,
  id: "project-zomboid-map-b42.20.2-r1",
  payload: PROJECT_ZOMBOID_MAP_B42_METADATA,
});
const hostedGround = hosted.source.floors[0];
assert.equal(hosted.source.floors.length, 1);
assert.equal(hostedGround.floor, 0);
assert.deepEqual(hostedGround.levels, [13, 14, 15, 16, 17, 18, 19, 20]);
assert.equal(getIsometricPyramidMaximumLevel(hostedGround), 22);
assert.deepEqual({
  columns: Math.ceil(hostedGround.width / (hostedGround.tileSize * 2 ** (22 - 14))),
  rows: Math.ceil(hostedGround.height / (hostedGround.tileSize * 2 ** (22 - 14))),
}, { columns: 9, rows: 4 });
assert.equal(Object.values(hostedGround.tileRanges).flat().reduce(
  (total, [, minimumColumn, maximumColumn]) => total + maximumColumn - minimumColumn + 1,
  0,
), 84_807);
assert.equal(isTileInIsometricRanges(hostedGround.tileRanges, 14, 6, 0), false);
assert.equal(isTileInIsometricRanges(hostedGround.tileRanges, 14, 8, 2), true);

console.log("External isometric map source validation passed.");
