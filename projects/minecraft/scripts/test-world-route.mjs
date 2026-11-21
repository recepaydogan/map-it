import assert from "node:assert/strict";
import { calculateWorldRoute } from "../src/features/worlds/world-route-pathfinder.ts";
import { findNearestWorldStructure } from "../src/features/worlds/world-nearest-structure.ts";
import { projectWorldDirectionArrows } from "../src/features/worlds/world-polyline-projection.ts";

const scope = { worldId: "route-test", dimension: "0", sourceId: "test", revision: 1 };

const biomeSource = {
  async generate(_scope, ranges) {
    return ranges.map(range => {
      const biomes = new Uint16Array(range.width * range.height).fill(1);
      for (let row = 0; row < range.height; row += 1) for (let column = 0; column < range.width; column += 1) {
        const x = (range.cellX + column) * range.scale;
        const z = (range.cellZ + row) * range.scale;
        if (x >= 64 && x <= 96 && Math.abs(z) <= 32) biomes[row * range.width + column] = 2;
      }
      return { range, biomes };
    });
  },
};

const route = await calculateWorldRoute(biomeSource, scope, { x: 0, z: 0 }, { x: 160, z: 0 }, {
  defaultCost: 1,
  biomeCosts: { 1: 1, 2: 20 },
});
assert.equal(route.terrainAware, true);
assert.ok(route.points.some(point => Math.abs(point.z) > 32), "route should detour around expensive terrain");
assert.deepEqual(route.points[0], { x: 0, z: 0 });
assert.deepEqual(route.points.at(-1), { x: 160, z: 0 });

const queriedRings = new Set();
const structureSource = {
  async query(_scope, queries) {
    const capabilities = [{ type: "target", regionSize: 16 }];
    const results = queries.map(query => {
      queriedRings.add(Math.max(Math.abs(query.regionX), Math.abs(query.regionZ)));
      const candidate = query.regionX === 0 && query.regionZ === 0
        ? { x: 0, y: null, z: 0, biomeViable: true, terrainVerified: false }
        : query.regionX === 2 && query.regionZ === 0
          ? { x: 512, y: null, z: 255, biomeViable: true, terrainVerified: false } : null;
      return { query, status: candidate ? "candidate" : "no-attempt", candidate };
    });
    return { kind: "structures", capabilities, results };
  },
};
const nearest = await findNearestWorldStructure(structureSource, scope, "target", { x: 255, z: 255 });
assert.deepEqual(nearest, { x: 512, z: 255 });
assert.ok(queriedRings.has(2), "nearest search should verify two outer rings");

const arrowPoints = [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 240, z: 240 }];
const arrowView = { x: 120, z: 120, width: 600, height: 600, zoom: 1 };
const directionArrows = projectWorldDirectionArrows(arrowPoints, arrowView, 96);
assert.equal(directionArrows.length, 5, "direction arrows should be spaced by world route length");
assert.ok(directionArrows.some(arrow => Math.abs(arrow.angle) < 0.001), "horizontal route legs should point right");
assert.ok(directionArrows.some(arrow => Math.abs(arrow.angle - 90) < 0.001), "vertical route legs should point down");
const shiftedArrows = projectWorldDirectionArrows(arrowPoints, { ...arrowView, x: 140, zoom: 2 }, 96);
assert.deepEqual(directionArrows.map(arrow => [arrow.x - 300 + arrowView.x, arrow.y - 300 + arrowView.z, arrow.angle]),
  shiftedArrows.map(arrow => [(arrow.x - 300) / 2 + 140, (arrow.y - 300) / 2 + arrowView.z, arrow.angle]),
  "panning and zooming should not move arrows along the world route");
assert.deepEqual(projectWorldDirectionArrows([{ x: 0, z: 0 }, { x: 40, z: 0 }], arrowView, 96), [],
  "short routes should not show a cramped chevron");

console.log("World route tests passed.");
