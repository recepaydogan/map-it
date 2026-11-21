import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundled = await build({
  stdin: { contents: `
    export { MAP_CATEGORIES, MAP_MARKER_PRIORITY_ORDER, getMapMarkerPriority } from "./src/features/map/map-config.ts";
    export { createMapMarkerHitIndex } from "./src/features/map/map-marker-hit-index.ts";
    export { getMapPointMarkerScale } from "./src/features/map/marker-size-settings.ts";
    export { createMapPointClusters } from "./src/features/map/map-clustering.ts";
  `, resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", write: false,
  define: { "import.meta.env": JSON.stringify({ DEV: true, BASE_URL: "/" }) },
});
const { MAP_CATEGORIES, MAP_MARKER_PRIORITY_ORDER, getMapMarkerPriority, createMapMarkerHitIndex,
  getMapPointMarkerScale, createMapPointClusters } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
const sizes = { version: 5, groups: Object.fromEntries(MAP_CATEGORIES.map(category => [category.groupId, 100])), categories: {} };
const projection = (category, left = 100, top = 100) => ({ point: { id: category, name: category, category, x: left, y: top }, left, top });
// The renderer paints low priorities first; canvas picking walks that order backwards.
const paintOrder = points => [...points].sort((a, b) => getMapMarkerPriority(a.point.category) - getMapMarkerPriority(b.point.category)
  || a.point.id.localeCompare(b.point.id));

test("every configured category has one priority, below hover and selection", () => {
  const categories = MAP_MARKER_PRIORITY_ORDER.flat();
  assert.equal(categories.length, new Set(categories).size);
  assert.deepEqual([...categories].sort(), MAP_CATEGORIES.map(category => category.id).sort());
  assert(getMapMarkerPriority("custom") < 40);
  assert.equal(getMapMarkerPriority("unknown-future-category"), 1);
});

test("overlapping pins follow travel, boss, quest, NPC, loot and creature priorities", () => {
  const categories = ["native-creatures", "native-loot-pickups", "native-loot-containers", "native-keys", "native-npcs",
    "native-quests", "native-bosses", "native-bells", "custom"];
  for (const order of [categories, [...categories].reverse()]) {
    const points = order.map(category => projection(category));
    for (const expected of [...categories].reverse()) {
      const sorted = paintOrder(points);
      assert.equal(sorted.at(-1).point.category, expected);
      assert.equal(createMapMarkerHitIndex(sorted, sizes)(100, 100)?.point.category, expected);
      points.splice(points.findIndex(row => row.point.category === expected), 1);
    }
    assert.equal(createMapMarkerHitIndex(points, sizes)(100, 100), null);
  }
});

test("a nearby high priority pin does not capture clicks outside its icon", () => {
  const points = paintOrder([projection("native-creatures", 100, 100), projection("native-bosses", 123, 100)]);
  const pick = createMapMarkerHitIndex(points, sizes);
  assert.equal(pick(100, 100)?.point.category, "native-creatures");
  assert.equal(pick(112, 100)?.point.category, "native-bosses");
});

test("enlarged Bells keep their priority across hit-index cell boundaries", () => {
  const large = { ...sizes, categories: { "native-bells": 200 } };
  const points = paintOrder([projection("native-loot-pickups", 35, 100), projection("native-bells", 79, 100)]);
  assert.equal(createMapMarkerHitIndex(points, large)(35, 100)?.point.category, "native-bells");
  assert.equal(getMapPointMarkerScale(projection("native-creatures").point, sizes), 0.75);
});

test("overview clustering keeps category priorities separate and retains all pins", () => {
  const points = [projection("native-bosses"), projection("native-quests"), projection("native-creatures"),
    { ...projection("native-creatures"), point: { ...projection("native-creatures").point, id: "second-creature" } }];
  const clusters = createMapPointClusters(points, null, 0.02);
  assert.equal(clusters.flatMap(cluster => cluster.items).length, points.length);
  for (const cluster of clusters) assert.equal(new Set(cluster.items.map(item => getMapMarkerPriority(item.point.category))).size, 1);
  const top = [...clusters].sort((a, b) => getMapMarkerPriority(a.items[0].point.category) - getMapMarkerPriority(b.items[0].point.category)).at(-1);
  assert.equal(top.items[0].point.category, "native-bosses");
});
