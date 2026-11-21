import assert from "node:assert/strict";
import {
  createMapSearchDocument,
  groupMapSearchMatches,
  searchMapDocuments,
} from "../src/features/map/map-fuzzy-search.ts";
import { searchStructureTypes } from "../src/features/worlds/world-structure-search.ts";
import { findStructureSearchTarget } from "../src/features/worlds/world-structure-search-target.ts";
import { visibleStructurePoints } from "../src/features/worlds/world-structure-filter-state.ts";

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

const sources = [
  { id: "old-ruins", name: "Old Ruins", items: ["Ancient Relic"] },
  { id: "sunken-ship", name: "Sunken Ship", items: ["Ancient Relic", "Compass"] },
];
assert.deepEqual(searchStructureTypes(sources, "ancient relic"), ["old-ruins", "sunken-ship"]);
assert.deepEqual(searchStructureTypes(sources, "sunken"), ["sunken-ship"]);
assert.deepEqual(searchStructureTypes(sources, "unrelated"), []);

const candidate = { id: "old-ruins-1", type: "old-ruins", x: 10, z: 20 };
const hiddenFilter = { visibleCategories: [], expandedGroup: null, search: "", hideFound: true, favoritesOnly: true };
assert.deepEqual(visibleStructurePoints([candidate], "surface", { found: [], favorites: [] }, hiddenFilter), []);
assert.deepEqual(visibleStructurePoints([candidate], "surface", { found: [], favorites: [] }, hiddenFilter, ["old-ruins"]), [candidate]);

const searchBounds = { minX: 0, minZ: 0, maxX: 31, maxZ: 31 };
const structureSource = (candidateX, candidateZ) => ({
  query: async (_scope, queries) => ({
    capabilities: [{ type: "village", regionSize: 1 }],
    results: queries.map(query => {
      const found = query.regionX === Math.floor(candidateX / 16) && query.regionZ === Math.floor(candidateZ / 16);
      return { query, status: found ? "candidate" : "no-attempt",
        candidate: found ? { x: candidateX, z: candidateZ, biomeViable: true } : null };
    }),
  }),
});
assert.equal(await findStructureSearchTarget(structureSource(24, 24), {}, "village", { x: 8, z: 8 }, searchBounds), null);
assert.deepEqual(await findStructureSearchTarget(structureSource(56, 8), {}, "village", { x: 8, z: 8 }, searchBounds), { x: 56, z: 8 });

console.log("Map search tests passed.");
