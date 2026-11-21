import assert from "node:assert/strict";
import {
  createMapSearchDocument,
  groupMapSearchMatches,
  searchMapDocuments,
} from "../src/features/map/map-fuzzy-search.ts";

const location = (id, name, region, category, overrides = {}) => ({
  id,
  name,
  category,
  label: category,
  subtype: category,
  regionId: region.toLowerCase().replace(/\s+/g, "-"),
  region,
  x: 100,
  y: 200,
  ...overrides,
});

const locations = [
  location("fire-1", "West Point Fire Station", "West Point", "fire"),
  location("hardware-1", "McCoy Hardware", "West Point", "supplies"),
  location("hardware-2", "McCoy Hardware", "West Point", "supplies", { x: 900, y: 900 }),
  location("house-1", "House", "Muldraugh", "lodging"),
  location("house-2", "House", "Muldraugh", "lodging"),
  location("house-3", "House", "West Point", "lodging"),
];

const documents = locations.map((point) => createMapSearchDocument(
  point,
  [point.name, point.label],
  [point.region, point.label, point.subtype, point.x, point.y].join(" "),
));

// Names outrank everything a place merely happens to be near or made of.
const nameMatches = searchMapDocuments(documents, "mccoy");
assert.deepEqual(nameMatches.map(({ point }) => point.id), ["hardware-1", "hardware-2"]);

// Squashed spelling: nobody types the space in "West Point".
assert.equal(searchMapDocuments(documents, "westpoint fire")[0]?.point.id, "fire-1");

// A region is weaker evidence than a name, so it sorts behind one.
const regionMatches = searchMapDocuments(documents, "west point");
assert.equal(regionMatches[0]?.point.id, "fire-1");
assert.ok(regionMatches.some(({ point }) => point.id === "house-3"));

// Ties go to the place nearest the search origin.
const nearest = searchMapDocuments(documents, "mccoy", { x: 880, y: 880 });
assert.equal(nearest[0]?.point.id, "hardware-2");

// Typos rescue a dead end, and only a dead end.
assert.equal(searchMapDocuments(documents, "mcoy")[0]?.point.id, "hardware-1");
assert.equal(searchMapDocuments(documents, "zzzz").length, 0);

// Identical places in one region are one answer, not one row each.
const grouped = groupMapSearchMatches(searchMapDocuments(documents, "house"), 8);
assert.deepEqual(
  grouped.map(({ point, count }) => [point.region, count]),
  [["Muldraugh", 2], ["West Point", 1]],
);
assert.equal(groupMapSearchMatches(searchMapDocuments(documents, "house"), 1).length, 1);

console.log("Map search tests passed.");
