import assert from "node:assert/strict";
import { groupCreatureReferenceLocations, groupQuestReferenceLocations, groupReferenceLocations } from "../src/features/reference/group-reference-locations.ts";

const location = (markerId, mapId = "map-a", name = "Sentry") => ({ mapId, markerId, name });
const point = (x, y = 100, category = "enemy") => ({ x, y, category });
const maps = new Map([
  ["map-a", new Map([
    ["first", point(100)],
    ["near", point(110, 105)],
    ["boundary", point(132)],
    ["far", point(133)],
    ["diagonal", point(130, 130)],
    ["other-name", point(100)],
    ["other-category", point(100, 100, "boss")],
    ["invalid", point(NaN)],
  ])],
  ["map-b", new Map([["first", point(100)]])],
]);

const source = [location("first"), location("near"), location("boundary"), location("far")];
assert.deepEqual(groupReferenceLocations(source, maps), [source[0], source[3]],
  "Nearby points collapse, but chains must not absorb a point beyond the retained destination's radius");
assert.equal(source.length, 4, "Source data remains intact");
assert.equal(groupReferenceLocations(source, maps)[0], source[0], "Navigation retains a real, unchanged marker");

const distinct = [location("first"), location("diagonal"), location("first", "map-b"),
  location("other-name", "map-a", "Guard"), location("other-category"), location("missing"), location("invalid")];
assert.deepEqual(groupReferenceLocations(distinct, maps), distinct,
  "Keep distant, differently named, differently categorized, cross-map and unresolved locations");
assert.deepEqual(groupReferenceLocations([location("first"), location("first"), location("near")], new Map()),
  [location("first"), location("near")], "Without coordinates, only exact marker duplicates collapse");
assert.deepEqual(groupReferenceLocations([], maps), []);

const creatureLocations = [
  location("first", "map-a", "Forest · Jump Laser"),
  location("far", "map-a", "Forest · Jump Laser"),
  location("cave", "map-a", "Cave · Jump Laser"),
  location("other-map", "map-b", "Forest · Jump Laser"),
];
assert.deepEqual(groupCreatureReferenceLocations(creatureLocations, "Jump Laser"), [
  { location: creatureLocations[0], region: "Forest" },
  { location: creatureLocations[2], region: "Cave" },
  { location: creatureLocations[3], region: "Forest" },
], "Creature locations have one real map target per region and map");
const creatureMap = new Map([["map-a", new Map([
  ["first", { region: "Forest", ...point(100) }],
  ["far", { region: "Forest", ...point(300) }],
  ["cave", { region: "Cave", ...point(500) }],
])]]);
assert.deepEqual(groupCreatureReferenceLocations([
  location("first", "map-a", "Map A · Jump Laser"),
  location("far", "map-a", "Map A · Jump Laser"),
  location("cave", "map-a", "Map A · Jump Laser"),
], "Jump Laser", creatureMap).map(({ region }) => region), ["Forest", "Cave"],
"Map regions resolve source labels that only contain the map name");

const questLocations = [
  location("enemy-a", "map-a", "Forest · Sentry"),
  location("enemy-b", "map-a", "Forest · Sentry"),
  location("enemy-c", "map-a", "Cave · Sentry"),
  location("enemy-d", "map-a", "Forest · Sentry"),
  location("totem", "map-a", "Forest · Totem"),
];
const questMaps = new Map([["map-a", new Map([
  ["enemy-a", { ...point(100), name: "Sentry", region: "Forest", reference: { category: "creatures", id: "NpcData:1" } }],
  ["enemy-b", { ...point(300), name: "Sentry", region: "Forest", reference: { category: "creatures", id: "NpcData:1" } }],
  ["enemy-c", { ...point(500), name: "Sentry", region: "Cave", reference: { category: "creatures", id: "NpcData:1" } }],
  ["enemy-d", { ...point(700), name: "Sentry", region: "Forest", reference: { category: "creatures", id: "NpcData:2" } }],
  ["totem", { ...point(900, 100, "quest-object"), name: "Totem", region: "Forest" }],
])]]);
assert.deepEqual(groupQuestReferenceLocations(questLocations, questMaps), [
  { location: questLocations[0], region: "Forest", search: { referenceId: "NpcData:1", name: "Sentry", region: "Forest" } },
  { location: questLocations[2], region: "Cave", search: { referenceId: "NpcData:1", name: "Sentry", region: "Cave" } },
  { location: questLocations[3], region: "Forest", search: { referenceId: "NpcData:2", name: "Sentry", region: "Forest" } },
  { location: questLocations[4], region: "Forest · Totem", search: undefined },
], "Quest enemies have one search link per creature and region, while other targets stay distinct");

console.log("Reference locations collapse nearby duplicates while preserving distinct map destinations.");
