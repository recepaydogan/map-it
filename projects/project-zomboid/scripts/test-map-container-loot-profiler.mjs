import assert from "node:assert/strict";
import { buildContainerLootData } from "./map-container-loot-profiler.mjs";

const result = buildContainerLootData({
  buildings: [{
    id: "building-a",
    containers: [
      {
        roomId: 1,
        room: "kitchen",
        container: "counter",
        tile: "fixtures_counters_01_0",
        floor: 0,
        x: 10,
        y: 10,
      },
      {
        roomId: 1,
        room: "house_kitchen",
        container: "counter",
        tile: "fixtures_counters_01_8",
        floor: 0,
        x: 11,
        y: 10,
      },
    ],
  }],
  distributionsSource: `local distributionTable = {
    all = {
      shelves = {
        items = { "Base.Water", 2, },
      },
    },
    kitchen = {
      counter = {
        procedural = true,
        procList = {
          { name = "ForcedFood", forceForTiles = "fixtures_counters_01_0" },
          { name = "KitchenFood" },
        },
        junk = ClutterTables.CounterJunk,
      },
    },
  }`,
  proceduralSource: `ProceduralDistributions.list = {
    ForcedFood = {
      items = { "Base.Can", 10, },
    },
    KitchenFood = {
      items = { "Base.Spoon", 5, },
    },
  }`,
  suburbsDistributionsSource: "SuburbsDistributions.house_kitchen = SuburbsDistributions.kitchen",
  clutterSources: ["ClutterTables.CounterJunk = { items = { \"Base.Rag\", 1, } }"],
});

const addonResult = buildContainerLootData({
  buildings: [{
    id: "addon-building",
    containers: [{
      room: "customroom",
      roomId: 1,
      container: "crate",
      floor: 0,
      x: 10,
      y: 10,
      tile: "custom_tile_01_0",
    }],
  }],
  distributionsSource: "local distributionTable = { all = {} }",
  proceduralSource: "ProceduralDistributions.list = {}",
  suburbsDistributionsSource: "",
  clutterSources: [],
  roomDistributionSources: [String.raw`
    SuburbsDistributions.customroom = {
      crate = { rolls = 1, items = { "CustomItem", 100 } },
    }
  `],
});

assert.deepEqual(addonResult.lootProfiles["location:addon-building"].items, [
  { id: "Base.CustomItem", weight: 100 },
]);

assert.equal(result.containerPlacementCount, 2);
assert.deepEqual(result.buildingLootProfileIds.get("building-a"), ["location:building-a"]);
const profile = result.lootProfiles["location:building-a"];
assert.deepEqual(new Set(profile.items.map(({ id }) => id)), new Set(["Base.Can", "Base.Spoon", "Base.Rag"]));
assert.equal(result.lootItemIds.has("Base.Water"), true);

console.log("Map container loot profiler tests passed.");
