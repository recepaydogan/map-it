import assert from "node:assert/strict";
import {
  createMapSearchDocument,
  groupMapSearchMatches,
  searchMapDocuments,
} from "../src/features/map/map-fuzzy-search.ts";
import {
  createMapItemSearchIndex,
  searchMapItems,
} from "../src/features/map/map-item-search.ts";

const location = (id, name, town, category, overrides = {}) => ({
  id,
  name,
  category,
  label: category,
  subtype: category,
  townId: town.toLowerCase(),
  town,
  x: 100,
  y: 200,
  ...overrides,
});

const locations = [
  location("fire-1", "West Point Fire Station", "West Point", "fire", {
    lootProfileIds: ["p-fire"],
    roomTypes: ["firestorage"],
  }),
  location("hardware-1", "McCoy Hardware", "West Point", "hardware", {
    lootProfileIds: ["p-hardware"],
  }),
  location("hardware-2", "McCoy Hardware", "West Point", "hardware", {
    lootProfileIds: ["p-hardware-weak"],
  }),
  location("house-1", "House", "Muldraugh", "residential", { lootProfileIds: ["p-house"] }),
  location("house-2", "House", "Muldraugh", "residential", { lootProfileIds: ["p-house"] }),
  location("house-3", "House", "West Point", "residential", { lootProfileIds: [] }),
];

const documents = locations.map((point) => createMapSearchDocument(
  point,
  [point.name, point.label],
  [point.town, point.label, point.subtype, point.roomTypes?.join(" ") ?? "", point.x, point.y].join(" "),
));

// Names outrank everything a place merely happens to be near or made of.
const nameMatches = searchMapDocuments(documents, "mccoy");
assert.deepEqual(nameMatches.map(({ point }) => point.id), ["hardware-1", "hardware-2"]);

// Squashed spelling: nobody types the space in "West Point".
assert.equal(searchMapDocuments(documents, "westpoint fire")[0]?.point.id, "fire-1");

// A town is weaker evidence than a name, so it sorts behind one.
const townMatches = searchMapDocuments(documents, "west point");
assert.equal(townMatches[0]?.point.id, "fire-1");
assert.ok(townMatches.some(({ point }) => point.id === "house-3"));

// Typos rescue a dead end, and only a dead end.
assert.equal(searchMapDocuments(documents, "mcoy")[0]?.point.id, "hardware-1");
assert.equal(searchMapDocuments(documents, "zzzz").length, 0);

// Identical buildings in one town are one answer, not one row each.
const grouped = groupMapSearchMatches(searchMapDocuments(documents, "house"), 8);
assert.deepEqual(
  grouped.map(({ point, count }) => [point.town, count]),
  [["Muldraugh", 2], ["West Point", 1]],
);
assert.equal(groupMapSearchMatches(searchMapDocuments(documents, "house"), 1).length, 1);

// An identically named basement destination remains a separate, labelled row.
const floorDocuments = [
  location("storage-ground", "Storage", "Rosewood", "storage", { floors: [0] }),
  location("storage-b1", "Storage", "Rosewood", "storage", { floors: [-1] }),
].map((point) => createMapSearchDocument(point, [point.name], point.town));
assert.deepEqual(
  groupMapSearchMatches(searchMapDocuments(floorDocuments, "storage"), 8)
    .map(({ point }) => point.id),
  ["storage-ground", "storage-b1"],
);

const data = {
  id: "test",
  locations,
  items: [
    { id: "Base.Hammer", name: "Hammer", lootable: true },
    { id: "Base.Bandage", name: "Bandage", lootable: true },
  ],
  lootProfiles: {
    "p-fire": { id: "p-fire", matchedDistributions: 1, items: [{ id: "Base.Bandage", weight: 90 }] },
    "p-hardware": { id: "p-hardware", matchedDistributions: 1, items: [{ id: "Base.Hammer", weight: 80 }] },
    "p-hardware-weak": {
      id: "p-hardware-weak",
      matchedDistributions: 1,
      items: [{ id: "Base.Hammer", weight: 20 }],
    },
    "p-house": { id: "p-house", matchedDistributions: 1, items: [{ id: "Base.Hammer", weight: 30 }] },
  },
};

const index = createMapItemSearchIndex(data);

const hammer = searchMapItems(index, "hammer")[0];
assert.equal(hammer.id, "Base.Hammer");
// Every building that spawns it, however the dropdown later trims the list.
assert.equal(hammer.locationCount, 4);
assert.deepEqual([...hammer.locationIds].sort(), ["hardware-1", "hardware-2", "house-1", "house-2"]);
// Same name, same town: one source row, the likeliest building shown.
assert.deepEqual(
  hammer.sources.map(({ location: place, weight, count }) => [place.id, weight, count]),
  [["hardware-1", 80, 2], ["house-1", 30, 2]],
);

// The English id keeps working when the catalog name is localized away.
const localized = createMapItemSearchIndex({
  ...data,
  items: [{ id: "Base.Hammer", name: "Çekiç", lootable: true }],
});
assert.equal(searchMapItems(localized, "hammer")[0]?.name, "Çekiç");
assert.equal(searchMapItems(localized, "çekiç")[0]?.id, "Base.Hammer");

// Typo rescue reaches items too, and an item nothing spawns is not an answer.
assert.equal(searchMapItems(index, "bandge")[0]?.id, "Base.Bandage");
assert.equal(searchMapItems(index, "sledgehammer").length, 0);

console.log("Map search tests passed.");
