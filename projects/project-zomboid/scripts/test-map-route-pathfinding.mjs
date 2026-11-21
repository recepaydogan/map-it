import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  NAVIGATION_EDGE_BLOCKED,
  NAVIGATION_WEST_SHIFT,
  NAVIGATION_SQUARE_BLOCKED,
} from "../src/features/map/map-navigation-format.ts";
import { calculateMapRoute } from "../src/features/map/map-route-pathfinder.ts";
import { HostedMapNavigationGrid } from "../src/features/map/map-navigation-grid.ts";

const width = 12;
const height = 12;
const squares = new Uint8Array(width * height);
const setSquare = (x, y, value) => { squares[y * width + x] = value; };
for (let y = 3; y <= 8; y += 1) {
  for (let x = 4; x <= 7; x += 1) setSquare(x, y, NAVIGATION_SQUARE_BLOCKED);
}

const grid = {
  manifest: {
    schemaVersion: 1,
    cellSize: width,
    regionSize: 1,
    encoding: "gzip-cell-region-grid-v1",
    coarse: { path: "", scale: 2, minX: 0, minY: 0, width: 6, height: 6 },
    regions: [{ x: 0, y: 0, path: "", cells: [[0, 0, 0, squares.byteLength]] }],
    costs: { cardinal: 10, diagonal: 14, door: 6, climb: 30, slowTerrain: 8 },
  },
  coarseNavigation: new Uint8Array(6 * 6),
  ensureNeighborhood: () => null,
  getSquare: (x, y) => x >= 0 && x < width && y >= 0 && y < height
    ? squares[y * width + x]
    : null,
};

const aroundBuilding = await calculateMapRoute(
  grid,
  [{ x: 1, y: 5 }, { x: 10, y: 5 }],
  { minX: 0, minY: 0, maxX: width, maxY: height },
);
assert.ok(aroundBuilding.points.every(({ x, y }) => {
  const squareX = Math.floor(x);
  const squareY = Math.floor(y);
  return !(squareX >= 4 && squareX <= 7 && squareY >= 3 && squareY <= 8);
}));
assert.ok(aroundBuilding.distance > 9);

squares.fill(0);
for (let y = 0; y < height; y += 1) {
  if (y !== 2) setSquare(6, y, NAVIGATION_EDGE_BLOCKED << NAVIGATION_WEST_SHIFT);
}
const throughWallOpening = await calculateMapRoute(
  grid,
  [{ x: 3, y: 6 }, { x: 9, y: 6 }],
  { minX: 0, minY: 0, maxX: width, maxY: height },
);
assert.ok(throughWallOpening.points.some(({ y }) => Math.floor(y) === 2));

const hostedSquares = new Uint8Array(width * height);
for (let y = 0; y < height; y += 1) {
  if (y !== 7) hostedSquares[y * width + 6] = NAVIGATION_SQUARE_BLOCKED;
}
const hostedPayload = gzipSync(hostedSquares);
const hostedManifest = {
  ...grid.manifest,
  coarse: { path: "coarse.bin.gz", scale: 2, minX: 0, minY: 0, width: 6, height: 6 },
  regions: [{ x: 0, y: 0, path: "regions/0_0.bin", cells: [[0, 0, 0, hostedPayload.length]] }],
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input)).pathname;
  if (url.endsWith("/manifest.json")) return Response.json(hostedManifest);
  if (url.endsWith("/coarse.bin.gz")) return new Response(new Uint8Array(36));
  if (url.endsWith("/regions/0_0.bin")) return new Response(hostedPayload);
  return new Response(null, { status: 404 });
};
try {
  const hostedGrid = await HostedMapNavigationGrid.load("https://navigation.test");
  const hostedRoute = await calculateMapRoute(
    hostedGrid,
    [{ x: 3, y: 3 }, { x: 9, y: 3 }],
    { minX: 0, minY: 0, maxX: width, maxY: height },
  );
  assert.ok(hostedRoute.points.some(({ y }) => Math.floor(y) === 7));
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Walkable map route pathfinding tests passed.");
