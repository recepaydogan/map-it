import assert from "node:assert/strict";
import { createMapPointIndex } from "../src/features/map/map-point-index.ts";
import { getVisibleWorldBounds, worldToScreen } from "../src/features/map/map-projection.ts";

const points = Array.from({ length: 20_000 }, (_, id) => ({
  id,
  x: (id * 7919 % 32768) - 16384,
  y: (id * 3571 % 32768) - 16384,
}));
points.push({ id: points.length, x: -256, y: 256 });
points.push({ id: points.length, x: 0, y: 0 });
const query = createMapPointIndex(points);
for (const bounds of [
  { minX: -256, minY: 0, maxX: 0, maxY: 256 },
  { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  { minX: -20_000, minY: -20_000, maxX: 20_000, maxY: 20_000 },
  { minX: 50_000, minY: 50_000, maxX: 51_000, maxY: 51_000 },
]) {
  assert.deepEqual(query(bounds), points.filter(({ x, y }) =>
    x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY));
}

// The index must preserve both visible membership and original stacking order,
// including the guard band used while the camera moves without a React render.
for (const mode of ["top", "isometric"]) {
  for (const zoom of [0.02, 0.12, 0.48, 1.6, 24]) {
    for (const centerX of [-8192, 0, 1000, 8192]) {
      const view = { centerX, centerY: -centerX / 2, zoom };
      const width = 1000;
      const height = 700;
      const margin = 160;
      const visible = (point) => {
        const { left, top } = worldToScreen(point, view, width, height, mode);
        return left >= -margin && left <= width + margin && top >= -margin && top <= height + margin;
      };
      const indexed = query(getVisibleWorldBounds(view, width + margin * 2, height + margin * 2, mode));
      assert.deepEqual(indexed.filter(visible), points.filter(visible), `${mode} at ${zoom}, ${centerX}`);
    }
  }
}

assert.deepEqual(createMapPointIndex([])({ minX: 0, minY: 0, maxX: 100, maxY: 100 }), []);
assert.equal(query({ minX: -20_000, minY: -20_000, maxX: 20_000, maxY: 20_000 }), points);
console.log("Map point index tests passed (20,002 points, both projections and viewport guard bands).");
