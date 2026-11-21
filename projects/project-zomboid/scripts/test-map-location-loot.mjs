import assert from "node:assert/strict";
import { groupMapLootItems } from "../src/features/map/map-loot-display-utils.ts";
import { mergeLocationLootProfile } from "../src/features/map/map-loot-utils.ts";

const createItems = (prefix, count) => Array.from({ length: count }, (_, index) => ({
  id: `Base.${prefix}${index}`,
  weight: 100 - index,
}));

const profile = mergeLocationLootProfile(
  {
    id: "house",
    name: "House",
    category: "houses",
    label: "House",
    subtype: "House",
    townId: "test",
    town: "Test",
    x: 0,
    y: 0,
    lootProfileIds: ["room:kitchen", "room:livingroom"],
  },
  {
    items: [
      ...createItems("Kitchen", 9).map(({ id }) => ({ id, name: id, lootable: true })),
      ...createItems("Living", 8).map(({ id }) => ({ id, name: id, lootable: true })),
      { id: "Base.RareFind", name: "Rare find", lootable: true },
      { id: "Base.BathTowel", name: "Bath Towel", lootable: true, tags: ["base:cleanstains"] },
      { id: "Base.Photo_Secret", name: "Secret photograph", lootable: true, tags: ["base:picture"] },
    ],
    lootProfiles: {
      "room:kitchen": {
        id: "room:kitchen",
        matchedDistributions: 1,
        items: [
          { id: "Base.BathTowel", weight: 100 },
          ...createItems("Kitchen", 9),
          { id: "Base.RareFind", weight: 0.01 },
          { id: "Base.Photo_Secret", weight: 0.001 },
        ],
      },
      "room:livingroom": { id: "room:livingroom", matchedDistributions: 1, items: createItems("Living", 8) },
      "room:all": { id: "room:all", matchedDistributions: 1, items: [{ id: "Base.GlobalOnly", weight: 100 }] },
    },
  },
);

assert.ok(profile);
assert.equal(profile.items.length, 19);
assert.equal(profile.items.some(({ id }) => id === "Base.GlobalOnly"), false);
assert.equal(profile.items.some(({ id }) => id === "Base.BathTowel"), false);
assert.equal(profile.items.some(({ id }) => id === "Base.RareFind"), true);
assert.equal(profile.items.some(({ id }) => id === "Base.Photo_Secret"), true);
assert.equal(profile.items.some(({ id }) => id === "Base.Kitchen0"), true);
assert.equal(profile.items.some(({ id }) => id === "Base.Living0"), true);

assert.deepEqual(groupMapLootItems([
  { id: "Base.Book1", name: "Book", weight: 90 },
  { id: "Base.Book2", name: "Book", weight: 80 },
  { id: "Base.Aiming1", name: "Aiming I: Better Aiming", weight: 30 },
  { id: "Base.Aiming2", name: "Aiming II: Drawing and Shooting", weight: 20 },
  { id: "Base.Magazine", name: "Magazine", weight: 18 },
  { id: "Base.TVMagazine", name: "Magazine: TV Monthly", weight: 17 },
  { id: "Base.FishingMag1", name: "Magazine: Angler USA", weight: 16 },
  { id: "Base.BlackPen", name: "Pen - Black", weight: 15 },
  { id: "Base.RedPen", name: "Pen - Red", weight: 14 },
  { id: "Base.Bandage", name: "Bandage - Adhesive", weight: 13 },
  { id: "Base.Rare", name: "Rare Manual", weight: 0.01 },
]), [
  { key: "book", name: "Book", count: 2, weight: 90, variants: ["Book"] },
  {
    key: "aiming",
    name: "Aiming",
    count: 2,
    weight: 30,
    variants: ["Aiming I: Better Aiming", "Aiming II: Drawing and Shooting"],
  },
  {
    key: "magazine",
    name: "Magazine",
    count: 3,
    weight: 18,
    variants: ["Magazine", "Magazine: TV Monthly", "Magazine: Angler USA"],
  },
  {
    key: "pen",
    name: "Pen",
    count: 2,
    weight: 15,
    variants: ["Pen - Black", "Pen - Red"],
  },
  {
    key: "bandage - adhesive",
    name: "Bandage - Adhesive",
    count: 1,
    weight: 13,
    variants: ["Bandage - Adhesive"],
  },
  { key: "rare manual", name: "Rare Manual", count: 1, weight: 0.01, variants: ["Rare Manual"] },
]);

console.log("Map marker loot keeps rare useful items and removes only explicit household clutter.");
