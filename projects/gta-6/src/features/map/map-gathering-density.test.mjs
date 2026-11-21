import assert from "node:assert/strict";
import test from "node:test";
import { thinGatheringPoints } from "./map-gathering-density.ts";

test("gathering density drops on zoom out and restores every pin on zoom in", () => {
  const herbs = Array.from({ length: 40 }, (_, index) => ({
    id: `herb-${index}`, category: "gatherable-herb", x: index * 20, y: 100,
  }));
  const ore = Array.from({ length: 20 }, (_, index) => ({
    id: `ore-${index}`, category: "gatherable-ore", x: index * 40, y: 100,
  }));
  const rare = { id: "rare-1", category: "rare", x: 100, y: 100 };
  const points = [...herbs, ...ore, rare];
  const overview = thinGatheringPoints(points, 0.04, null);
  const regional = thinGatheringPoints(points, 0.2, null);
  const detail = thinGatheringPoints(points, 0.45, null);
  assert.ok(overview.length < regional.length);
  assert.ok(regional.length < detail.length);
  assert.equal(detail.length, points.length);
  assert.ok(overview.some((point) => point.category === "gatherable-herb"));
  assert.ok(overview.some((point) => point.category === "gatherable-ore"));
  assert.ok(overview.includes(rare));
  assert.ok(thinGatheringPoints(points, 0.04, "herb-39")
    .some((point) => point.id === "herb-39"));
});
