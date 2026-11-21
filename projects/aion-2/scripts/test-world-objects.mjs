import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { groupWorldObjectOutcomes, worldObjectRewardOutcomes } from "../src/features/reference/world-object-reward-outcomes.ts";
import { migrateMapMarkerAliases } from "../src/features/map/map-marker-aliases.ts";
import { resolveMapFocusPoint } from "../src/features/map/map-focus-request.ts";
import { rewardDropChance } from "../src/features/database/reward-drop-chance.ts";
import { chestDungeonId } from "../src/features/reference/chest-dungeon-context.ts";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const index = read("public/data/reference/index.json");
const cache = new Map();
const entry = (id) => {
  if (cache.has(id)) return cache.get(id);
  const summary = index.entries.find((row) => row.id === id);
  assert(summary, id);
  const result = read(`public/data/reference/${summary.category}/${summary.chunk}.json`).entries[id];
  cache.set(id, result);
  return result;
};
const locked = entry("EnvObjData:1200039");
const standard = entry("EnvObjData:1200036");
assert.equal(locked.rewardObject.keyOnly, true);
assert.deepEqual(locked.rewardObject.modes.map((mode) => mode.kind), ["key"]);
assert.equal(standard.rewardObject.keyOnly, false);
const rewards = (object, mode, id) => object.rewardObject.modes.find((row) => row.kind === mode).items.find((row) => row.id === id);
const chestCases = [
  ["1400711", 141, [["533460001", 300]]],
  ["1400712", 20, [["533460001", 300]]],
  ["1402028", 11, [["533560001", 1], ["930100023", 500]]],
  ["1402193", 128, [["533560001", 1], ["930100023", 500]]],
  ["1402194", 10, [["533560001", 5], ["930100023", 1000]]],
];
for (const [id, count, items] of chestCases) {
  const chest = entry(`EnvObjData:${id}`);
  assert.equal(chest.locations.length, count);
  assert.equal(chest.rewardObject.access.requirement, "none");
  assert.equal(chest.rewardObject.access.interactionSeconds, 2.5);
  assert.deepEqual(chest.rewardObject.keys, []);
  assert.deepEqual(chest.rewardObject.modes.map((mode) => mode.kind), ["normal"]);
  assert.equal(chest.rewardObject.modes[0].items.length, items.length);
  for (const [itemId, quantity] of items) {
    assert.deepEqual(worldObjectRewardOutcomes(rewards(chest, "normal", itemId).rewardRates)
      .map((row) => [row.percent, row.quantityMin, row.quantityMax]), [[100, quantity, quantity]]);
  }
  for (const location of chest.locations) {
    const map = read(`public/maps/${location.mapId}/metadata.json`);
    const marker = map.locations.find((point) => point.id === location.markerId);
    assert.equal(marker?.reference?.id, chest.id);
    assert(marker?.insetId, "Dungeon chest positions must stay on interior maps");
  }
}
assert.equal(entry("EnvObjData:1402028").rewardObject.terrain, "Water");
assert.deepEqual(entry("EnvObjData:1200134").rewardObject.modes, []);
assert(entry("EnvObjData:1200134").rewardObject.access.eventLinked);
const guideAudit = read("public/data/reference/dungeon-chest-guide-audit.json");
assert.equal(guideAudit.dungeons.length, 30);
assert.equal(guideAudit.markerCount, 310);
const objectiveLabels = read("src/i18n/locales/en.json").reference.labels;
const objectives = (id) => entry(`Dungeon:${id}`).chestGuide.steps.map((step) => objectiveLabels[step.label.replace("reference.labels.", "")]);
assert.deepEqual(objectives(320010), [
  "Obtain the Treasure Room key hidden in the Stone Casket",
  "Open the treasure room door inside the Crypt",
  "Collect the treasure from the Old Graveyard",
]);
assert.deepEqual(objectives(310077), [
  "Find and extinguish the first secret brazier", "Find and extinguish the second secret brazier", "Find the precious treasure",
]);
assert.deepEqual(objectives(310079), [
  "Enter the pillar of light and solve the first puzzle", "Enter the pillar of light and solve the second puzzle",
  "Enter the pillar of light and solve the final puzzle", "Find the rare treasure inside the opened underground storage",
]);
for (const [id] of chestCases) {
  const chest = entry(`EnvObjData:${id}`);
  for (const location of chest.locations) {
    const dungeonId = chestDungeonId(chest, location.mapId, location.markerId);
    assert(dungeonId, "Every published chest needs its own dungeon context");
    const source = guideAudit.dungeons.find((row) => row.dungeonId === dungeonId);
    const map = read(`public/maps/${location.mapId}/metadata.json`);
    const marker = map.locations.find((row) => row.id === location.markerId);
    assert.equal(map.insets.find((row) => row.id === marker.insetId).worldMapId, source.mapId);
    assert(entry(dungeonId).chestGuide.steps.every((step) => objectiveLabels[step.label.replace("reference.labels.", "")]));
    assert.equal(chestDungeonId(chest, "wrong-map", location.markerId), undefined);
  }
}
assert.equal(chestDungeonId(locked, "world-l-a", "unrelated"), undefined);
assert.deepEqual(entry("Dungeon:320028").chestGuide.completionObjectIds, []);
assert.deepEqual(entry("Dungeon:320054").chestGuide.completionObjectIds, []);
assert.equal(worldObjectRewardOutcomes(rewards(locked, "key", "512400017").rewardRates)[0].percent, 1);
assert.equal(worldObjectRewardOutcomes(rewards(standard, "normal", "512400017").rewardRates)[0].percent, 0.5);
const crystals = worldObjectRewardOutcomes(rewards(standard, "normal", "531900009").rewardRates).filter((row) => row.faction === "Light");
assert.deepEqual(crystals.map((row) => [row.percent, row.quantityMin]), [[100, 100], [50, 100]]);
const detection = locked.rewardObject.modes[0].items.find((row) => row.name === "Seed of Detection");
assert(detection);
assert(worldObjectRewardOutcomes(detection.rewardRates).every((row) => row.percent === 100 && row.quantityMin === 1));
const cosmetics = locked.rewardObject.modes[0].items.find((row) => row.name === "Saam Laurel (Skin: Helm)");
assert(Math.abs(worldObjectRewardOutcomes(cosmetics.rewardRates)[0].percent - 0.0524728) < 1e-9);
const silentium = rewards(locked, "key", "630840002");
assert.equal(rewardDropChance(silentium), 100, "Bonus checks cannot make a guaranteed reward look rare");
assert.equal(rewardDropChance(rewards(locked, "key", "512400017")), 1);
const shards = rewards(locked, "key", "533460001");
const shardChance = shards.rewardRates.filter((rate) => rate.faction === "Light").reduce((sum, rate) => sum + rate.percent, 0);
assert(Math.abs(rewardDropChance(shards) - shardChance) < 1e-7, "Amount choices share one source pool; factions are alternatives");
assert.equal(rewardDropChance(rewards(standard, "normal", "531900009")), 100);
assert.equal(rewardDropChance({ probability: 500000 }), 0.5);
assert.equal(rewardDropChance({}), undefined);
const pool = { kind: "pool", percent: 50, poolPercent: 50, poolCount: 2, poolId: "pool", quantityMin: 1, quantityMax: 1 };
assert.equal(rewardDropChance({ rewardRates: [pool] }), 37.5, "Two draws share a single trigger check");
assert.equal(rewardDropChance({ rewardRates: [{ ...pool, poolCount: 1, poolPercent: 100, percent: 20 }, { ...pool, poolCount: 1, poolPercent: 100, percent: 30, quantityMin: 2, quantityMax: 2 }] }), 50);
assert.equal(rewardDropChance({ rewardRates: [{ ...pool, poolCount: 1, poolPercent: 100, poolId: "a" }, { ...pool, poolCount: 1, poolPercent: 100, poolId: "b" }] }), 75, "Separate pools are independent checks");
assert.deepEqual(worldObjectRewardOutcomes(silentium.rewardRates).map((row) => [row.percent, row.quantityMin]), [[100, 10], [50, 1], [50, 1]], "Independent duplicate checks must survive");
assert.equal(groupWorldObjectOutcomes(worldObjectRewardOutcomes(silentium.rewardRates))[0].outcomes.length, 3);
const factionChecks = ["Light", "Dark"].flatMap((faction) => [100, 120].map((quantityMin) =>
  ({ faction, quantityMin, quantityMax: quantityMin, percent: 15, draws: 1 })));
const shared = groupWorldObjectOutcomes(factionChecks);
assert.equal(shared.length, 1);
assert.deepEqual(shared[0].factions, ["Light", "Dark"]);
assert.equal(shared[0].outcomes.length, 2);
assert.equal(groupWorldObjectOutcomes(factionChecks.map((row, index) => index === 3 ? { ...row, percent: 10 } : row)).length, 2);

let aliases = 0;
for (const [mapId, count, mixed] of [["world-l-a", 1440, false], ["world-d-a", 1371, false], ["world-l-b", 456, true], ["world-d-b", 455, true]]) {
  const map = read(`public/maps/${mapId}/metadata.json`);
  const objects = map.locations.filter((point) => point.objectVariants);
  assert.equal(objects.length, count);
  assert.equal(new Set(objects.map((point) => JSON.stringify([point.sourceActor, point.worldPosition]))).size, count);
  const ids = new Set(map.locations.map((point) => point.id));
  for (const point of objects) {
    assert.equal(new Set(point.objectVariants.map((variant) => entry(variant.id).rewardObject.keyOnly)).size, mixed ? 2 : 1);
    for (const alias of point.aliasIds ?? []) {
      aliases++;
      assert(!ids.has(alias), "Aliases cannot remain visible markers");
      assert.equal(resolveMapFocusPoint({ pointId: alias }, { ...map, id: mapId }, [point]), point);
    }
  }
}
assert.equal(aliases, 911);
for (const id of ["EnvObjData:1201502", "EnvObjData:1201503", "EnvObjData:1301242", "EnvObjData:1301244"]) {
  assert.equal(entry(id).rewardObject.modes.length, 0, "Do not invent another object's reward link");
}
const wing = entry("Wing:30400300");
assert(wing.sections.some((section) => section.title === "reference.labels.owned-effects"));
assert(!wing.sections.some((section) => section.title === "reference.labels.upgrade-steps"));
const storage = new Map([["gm:favorites", '["old","new"]'], ["gm:completed-locations", '["old"]'], ["gm:notes", '{"old":"First note","new":"Second note"}']]);
const adapter = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
assert(migrateMapMarkerAliases([{ id: "new", aliasIds: ["old"] }], adapter));
assert.equal(storage.get("gm:favorites"), '["new"]');
assert.equal(storage.get("gm:completed-locations"), '["new"]');
assert.deepEqual(JSON.parse(storage.get("gm:notes")), { new: "Second note\n\nFirst note" });
assert.equal(migrateMapMarkerAliases([{ id: "new", aliasIds: ["old"] }], adapter), false);

const i18n = createInstance();
await i18n.init({ lng: "en", resources: { en: { translation: read("src/i18n/locales/en.json") } }, interpolation: { escapeValue: false } });
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { useRewardOrder } = await server.ssrLoadModule("/src/features/database/use-reward-order.ts");
  function OrderProbe() {
    const order = useRewardOrder();
    return createElement("span", null, order([
      { id: "unknown", grade: "Special" },
      { id: "guaranteed", probability: 100000000, grade: "Special" },
      { id: "rare-low-grade", probability: 1000000, grade: "Common" },
      { id: "rare-high-grade", probability: 1000000, grade: "Unique" },
      { id: "rarest", probability: 100000, grade: "Common" },
    ]).map((item) => item.id).join(","));
  }
  assert.equal(renderToStaticMarkup(createElement(OrderProbe)), "<span>rarest,rare-high-grade,rare-low-grade,guaranteed,unknown</span>");
  const { default: Component } = await server.ssrLoadModule("/src/features/reference/world-object-content.tsx");
  const render = (props) => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(Component, props)));
  const markup = render({ entry: locked });
  assert(markup.includes("A key is required"));
  assert(markup.includes("Guardian Token (Skin: Helm)"), "Rare rewards must appear before the Show more boundary");
  const boundMarkup = render({ entry: { ...locked, rewardObject: { ...locked.rewardObject,
    modes: locked.rewardObject.modes.map((mode) => ({ ...mode, items: mode.items.filter((item) => item.name === "Soul Codex (Bound)") })) } } });
  assert(boundMarkup.includes("Soul Codex (Bound)"));
  assert(!markup.includes("Open without a key"));
  assert(!markup.includes("reference.worldObject."));
  const chestMarkup = render({ entry: entry("EnvObjData:1402194") });
  assert(chestMarkup.includes("Lesser Soulstone (Bound)"));
  assert(!chestMarkup.includes("No key required."));
  assert(!chestMarkup.includes("Interaction time"));
  assert(!chestMarkup.includes("reset schedule is unknown"));
  const ordinaryChestMarkup = render({ entry: entry("EnvObjData:1402193") });
  assert(!ordinaryChestMarkup.includes("No key required."));
  assert(!ordinaryChestMarkup.includes("Interaction time"));
  assert(!ordinaryChestMarkup.includes("reset schedule is unknown"));
  assert(!chestMarkup.includes("Accepted keys"));
  assert(!chestMarkup.includes("Open with a key"));
  assert(!chestMarkup.includes("improved rewards"));
  assert(!chestMarkup.includes("reference.worldObject."));
  const eventMarkup = render({ entry: entry("EnvObjData:1200134") });
  assert(eventMarkup.includes("Linked to a map event"));
  assert(eventMarkup.includes("Rewards handled by the event are not listed here"));
  assert(!eventMarkup.includes("No reward table is linked"));
  const waterMarkup = render({ entry: entry("EnvObjData:1402028") });
  assert(waterMarkup.includes("Water"));
  const { ChestDungeonGuideContent } = await server.ssrLoadModule("/src/features/reference/chest-dungeon-guide.tsx");
  const guideMarkup = (objectId) => renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(ChestDungeonGuideContent, { dungeon: entry("Dungeon:320010"), objectId })));
  const preciousGuide = guideMarkup("EnvObjData:1400712");
  assert(preciousGuide.includes("Opening this chest completes the dungeon."));
  assert(preciousGuide.includes("Obtain the Treasure Room key"));
  assert(preciousGuide.includes("View dungeon completion rewards"));
  assert(preciousGuide.includes("Old Graveyard"));
  const ordinaryGuide = guideMarkup("EnvObjData:1400711");
  assert(!ordinaryGuide.includes("Opening this chest completes"));
  assert(ordinaryGuide.includes("Dungeon objectives"));
  assert(!preciousGuide.includes("reference.labels."));
  const unknown = entry("EnvObjData:1201502");
  const mixed = render({ entry: unknown, variants: [unknown, entry("EnvObjData:1201503")] });
  assert(mixed.includes("Both standard and locked"));
  assert(mixed.includes("No reward table is linked"));
} finally {
  await server.close();
}
console.log("World-object rewards, source variants, saved marker migration and panel rendering verified.");
