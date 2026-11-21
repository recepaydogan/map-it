import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { buildBossRewardFilters } from "../data/src/er-map-reward-filters.mjs";
import { fineItemCategory, itemGroup } from "../data/src/er-map-item-category.mjs";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const source = readFileSync("src/features/er-map/er-map-reward-filters.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { matchesMarkerCategory, viewMarkerUrls, addBossRewardCounts } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const manifest = read("public/data/er-map/elden-ring/manifest.json");
const items = new Map(read("src/data/generated/er-items.json").items
  .map((item) => [`${itemGroup(item.category)}:${item.id}`, item]));
const pool = (view, active, all = false) => viewMarkerUrls(view, active, all)
  .flatMap((url) => read(`public${url}`));
const visible = (view, active) => pool(view, active)
  .filter((marker) => matchesMarkerCategory(marker, active, view.bossRewardFilters));
const overworld = manifest.views.find((view) => view.key === "overworld");

test("Spirit Ash filter loads and displays the original reward bosses", () => {
  const active = new Set(["spirit-ash"]);
  const markers = visible(overworld, active);
  for (const [id, reward] of [
    ["boss:30000800", "Lhutel the Headless"],
    ["boss:30010800", "Demi-Human Ashes"],
    ["boss:30060800", "Kaiden Sellsword Ashes"],
  ]) {
    const boss = markers.find((marker) => marker.id === id);
    assert.ok(boss?.drops.some((drop) => drop.name === reward));
    assert.equal(boss.category, "boss");
    assert.equal(markers.filter((marker) => marker.id === id).length, 1);
  }
  assert.ok(markers.some((marker) => marker.name === "Stormhawk Deenh"));
  assert.ok(!markers.some((marker) => marker.id === "boss:16000860"));
});

test("Combining filters does not duplicate a boss or its chunk", () => {
  const active = new Set(["boss", "spirit-ash", "weapon"]);
  const urls = viewMarkerUrls(overworld, active, false);
  assert.equal(new Set(urls).size, urls.length);
  const markers = visible(overworld, active);
  assert.equal(new Set(markers.map((marker) => marker.id)).size, markers.length);
  assert.equal(markers.filter((marker) => marker.id === "boss:30000800").length, 1);
});

test("Every view's filter count equals its loaded visible markers", () => {
  for (const view of manifest.views) {
    const all = pool(view, new Set(), true);
    assert.deepEqual(view.bossRewardFilters, buildBossRewardFilters(all, items));
    const counts = addBossRewardCounts(new Map(Object.entries(view.typeCounts)), view.bossRewardFilters);
    for (const category of new Set(Object.values(view.bossRewardFilters).flatMap((entry) => entry.rewards))) {
      assert.equal(visible(view, new Set([category])).length, counts.get(category), `${view.key}: ${category}`);
    }
  }
});

test("Completion survives unloaded chunks and counts each boss once per reward category", () => {
  const found = new Set(["boss:30000800"]);
  const base = new Map([["spirit-ash", 2]]);
  assert.equal(addBossRewardCounts(base, overworld.bossRewardFilters, found).get("spirit-ash"), 3);
  assert.equal(addBossRewardCounts(base, overworld.bossRewardFilters, new Set()).get("spirit-ash"), 2);
  assert.equal(base.get("spirit-ash"), 2);
  const underground = manifest.views.find((view) => view.key === "underground");
  assert.equal(addBossRewardCounts(base, underground.bossRewardFilters, found).get("spirit-ash"), 2);
  const entry = overworld.bossRewardFilters["boss:30000800"];
  const reloaded = JSON.parse(JSON.stringify({ "boss:30000800": entry }));
  assert.equal(addBossRewardCounts(base, reloaded, found).get("spirit-ash"), 3);
});

test("Reward membership deduplicates categories and uses the fine item taxonomy", () => {
  const boss = {
    id: "test-boss", category: "legendary-boss",
    drops: [{ itemKey: "goods:258000" }, { itemKey: "goods:234000" }, { itemKey: "goods:10010" }],
  };
  const rewardFilter = buildBossRewardFilters([boss], items)[boss.id];
  assert.deepEqual(rewardFilter.rewards, ["golden-seed", "spirit-ash"]);
  assert.deepEqual(rewardFilter.rewardItems, {
    "golden-seed": ["goods:10010"],
    "spirit-ash": ["goods:234000", "goods:258000"],
  });
  assert.deepEqual(buildBossRewardFilters([{ ...boss, category: "merchant" }], items), {});
  assert.equal(fineItemCategory({ id: 2010000, name: "Mushroom Crown", category: "armor" }, "armor"), "armor");
  assert.equal(fineItemCategory({ id: 1, name: "Shield", category: "weapon", subtype: "Small Shield" }, "weapon"), "shield");
  assert.throws(() => buildBossRewardFilters([{ ...boss, drops: [{ itemKey: "goods:missing" }] }], items));
});

test("Views without reward metadata and custom markers keep their existing behavior", () => {
  const view = { chunks: { boss: "/boss.json", "spirit-ash": "/ashes.json" } };
  assert.deepEqual(viewMarkerUrls(view, new Set(["spirit-ash"]), false), ["/ashes.json"]);
  assert.equal(matchesMarkerCategory({ id: "boss:30000800", category: "boss", custom: true },
    new Set(["spirit-ash"]), overworld.bossRewardFilters), false);
  assert.equal(matchesMarkerCategory({ id: "plain", category: "boss" }, new Set()), false);
});
