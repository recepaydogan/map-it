import assert from "node:assert/strict";
import { createMapPointIndex } from "../src/features/map/map-point-index.ts";
import { createMapMarkerHitIndex } from "../src/features/map/map-marker-hit-index.ts";
import { getVisibleWorldBounds, worldToScreen } from "../src/features/map/map-projection.ts";

// Include negative coordinates, coincident pins, sparse cells and shared IDs
// from separate maps. Culling must preserve the original DOM paint order.
const points = Array.from({ length: 20_000 }, (_, index) => ({
  id: `point-${index % 1000}`, mapId: `map-${Math.floor(index / 1000)}`,
  x: (index % 200) * 40 - 4000, y: Math.floor(index / 200) * 40 - 2000,
}));
points.push({ ...points[42] });
const query = createMapPointIndex(points);
const scan = (bounds) => points.filter(({ x, y }) => x >= bounds.minX && x <= bounds.maxX
  && y >= bounds.minY && y <= bounds.maxY);
for (const mode of ["top", "isometric"]) {
  for (const zoom of [0.02, 0.15, 1, 4]) {
    for (const center of [-3000, 0, 3000]) {
      const view = { centerX: center, centerY: center / 3, zoom };
      const bounds = getVisibleWorldBounds(view, 1200 + 320, 780 + 320, mode);
      const visible = query(bounds);
      assert.deepEqual(visible, scan(bounds));
      // Overscan must include every point which can actually be painted.
      const indexed = new Set(visible);
      for (const point of points) {
        const { left, top } = worldToScreen(point, view, 1200, 780, mode);
        if (left >= -160 && left <= 1360 && top >= -160 && top <= 940) {
          assert.ok(indexed.has(point), `Visible marker lost in ${mode} projection`);
        }
      }
    }
  }
}
assert.deepEqual(createMapPointIndex([])({ minX: -10, minY: -10, maxX: 10, maxY: 10 }), []);
assert.deepEqual(query({ minX: 100_000, minY: 100_000, maxX: 100_010, maxY: 100_010 }), []);

const projections = points.slice(0, 1000).map((point, index) => ({
  point, left: (index % 50) * 21 - 500, top: Math.floor(index / 50) * 19 - 200,
}));
projections.push({ point: points.at(-1), left: -500, top: -200 });
for (const radius of [13.5, 16]) {
  const pick = createMapMarkerHitIndex(projections, radius);
  for (let left = -550; left < 600; left += 13) {
    for (let top = -250; top < 250; top += 11) {
      const expected = projections.findLast((entry) => Math.abs(entry.left - left) <= radius
        && Math.abs(entry.top - top) <= radius) ?? null;
      assert.equal(pick(left, top), expected, "Picking must select the topmost painted marker");
    }
  }
}
assert.equal(createMapMarkerHitIndex([])(0, 0), null);

// A close view must visit nearby occupied cells rather than rescan every pin.
let coordinateReads = 0;
const counted = points.map((point) => ({
  get x() { coordinateReads++; return point.x; },
  get y() { coordinateReads++; return point.y; },
}));
const countQuery = createMapPointIndex(counted);
coordinateReads = 0;
const nearby = countQuery({ minX: 0, minY: 0, maxX: 80, maxY: 80 });
assert.equal(nearby.length, 9);
assert.ok(coordinateReads < 500, `Culling scanned too many coordinates: ${coordinateReads}`);
console.log("Marker culling and picking match brute-force results; close views only visit nearby cells.");
