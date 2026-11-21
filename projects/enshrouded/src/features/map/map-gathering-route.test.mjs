import assert from "node:assert/strict";
import test from "node:test";
import { planGatheringRoute } from "./map-gathering-route.ts";

const marker = (id, x, y, group = "resources") => ({
  id, name: id, label: id, category: "custom", subtype: "custom", regionId: "personal",
  region: "Test", group, x, y,
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("plans a short closed loop through only personal resource markers", () => {
  const points = [
    marker("a", 0, 0), marker("b", 10, 10), marker("c", 0, 10), marker("d", 10, 0),
    marker("other", 5, 5, "general"),
  ];
  const route = planGatheringRoute(points, { x: -1, y: 0 });
  assert.equal(route[0]?.id, "a");
  assert.deepEqual(new Set(route.map(({ id }) => id)), new Set(["a", "b", "c", "d"]));
  const loopLength = route.reduce((sum, point, index) => sum + distance(point, route[(index + 1) % route.length]), 0);
  assert.equal(loopLength, 40);
});

test("requires at least two resource markers", () => {
  assert.deepEqual(planGatheringRoute([marker("one", 0, 0), marker("other", 1, 0, "general")]), []);
});
