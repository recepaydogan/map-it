import assert from "node:assert/strict";
import { buildMapLootIndex } from "./map-loot-index.mjs";

const index = buildMapLootIndex(
  [
    { id: "one", lootProfileIds: ["room:kitchen", "room:pantry"] },
    { id: "two", lootProfileIds: ["room:kitchen"] },
  ],
  {
    "room:kitchen": { items: [{ id: "Base.Can", weight: 80 }] },
    "room:pantry": { items: [{ id: "Base.Can", weight: 100 }, { id: "Base.Water", weight: 40 }] },
    "room:all": { items: [{ id: "Base.GlobalOnly", weight: 20 }] },
  },
  "room:all",
);

assert.deepEqual(index, [
  { id: "Base.Can", bestWeight: 100, locationCount: 2, profileIds: ["room:kitchen", "room:pantry"] },
  { id: "Base.GlobalOnly", bestWeight: 20, locationCount: 0, profileIds: ["room:all"] },
  { id: "Base.Water", bestWeight: 40, locationCount: 1, profileIds: ["room:pantry"] },
]);

console.log("Map loot index tests passed.");
