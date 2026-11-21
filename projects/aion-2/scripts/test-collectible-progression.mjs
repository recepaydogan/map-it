import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectibleProgress, collectibleRewards } from "../src/features/reference/collectible-progress.ts";

const read = (path) => JSON.parse(readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8"));
const data = read("data/reference/intelligence/collectible-progression.json");
const expectedCounts = { "631900001": 560, "631900005": 140, "631900007": 560, "631900012": 140, "631900013": 300 };
const allIds = new Set();
const aliases = new Set();
let levels = 0;
for (const [id, count] of Object.entries(expectedCounts)) {
  const collection = data.items[id];
  assert.equal(collectibleProgress(collection.regions, []).total, count);
  const points = collection.regions.flatMap((region) => region.points);
  assert.deepEqual(collectibleProgress(collection.regions, points.map((point) => point.id)), { total: count, found: count });
  for (const region of collection.regions) {
    const metadata = read(`maps/${region.mapId}/metadata.json`);
    const markers = new Map(metadata.locations.map((point) => [point.id, point]));
    for (const point of region.points) {
      assert.ok(!allIds.has(point.id), `Duplicate pickup: ${point.id}`);
      allIds.add(point.id);
      const marker = markers.get(point.id);
      assert.equal(marker.itemId, id);
      assert.equal(marker.hiddenFromMap, undefined);
      assert.deepEqual(point.world, marker.worldPosition);
      assert.deepEqual(point.aliases, marker.aliasIds ?? []);
      assert.ok(point.quantity > 0);
      for (const alias of point.aliases) {
        assert.ok(!aliases.has(alias), `Ambiguous alias: ${alias}`);
        aliases.add(alias);
        assert.equal(collectibleProgress(collection.regions, [alias, point.id]).found, 1, "Legacy and native completion must count once");
      }
    }
  }
  for (const track of collection.tracks) {
    assert.equal(data.references[track.id], id);
    assert.ok(track.locations.length > 0);
    assert.deepEqual(track.levels.map((row) => row.level), Array.from({ length: track.levels.length }, (_, index) => index + 1));
    levels += track.levels.length;
  }
}
assert.equal(allIds.size, 1700);
assert.equal(aliases.size, 1319);
assert.equal(levels, 116);
const reshanta = data.items["631900013"];
assert.equal(reshanta.tracks.length, 2);
assert.deepEqual(reshanta.regions.map((region) => region.points.length).sort((a, b) => a - b), [100, 200]);
const verteron = data.items["631900001"];
const totals = collectibleRewards(verteron.tracks[0].levels, "all");
assert.equal(totals.stats.reduce((sum, stat) => sum + stat.value, 0), 58);
assert.deepEqual(collectibleRewards(verteron.tracks[0].levels, 1), { items: verteron.tracks[0].levels[0].items, stats: verteron.tracks[0].levels[0].stats });
assert.equal(verteron.exchanges[0].result.quantity, 10);
assert.equal(verteron.exchanges[0].characterLimit, 1120);
const eltnen = collectibleRewards(data.items["631900005"].tracks[0].levels, "all");
assert.equal(eltnen.stats.find((stat) => stat.id === "EStat::SPMax")?.value, null, "Unverified stamina scaling must not become a numeric bonus");
const variants = collectibleRewards([{ level: 1, stats: [], items: [
  { id: "bound", name: "Same name", quantity: 1 }, { id: "unbound", name: "Same name", quantity: 2 },
] }], "all");
assert.equal(variants.items.length, 2, "Item identity must not depend on its displayed name");
console.log("Collectible progression: 1,700 unique points, 1,319 completion aliases, 116 reward levels verified.");
