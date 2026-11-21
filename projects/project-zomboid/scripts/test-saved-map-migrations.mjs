import assert from "node:assert/strict";
import { migrateSavedMapStorage, SAVED_MAP_STORAGE_VERSION } from "../src/features/map/saved-map-storage.ts";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }
}

const storage = new MemoryStorage();
storage.setItem("pzim:favorites", JSON.stringify(["location-1", "location-1", 42]));
storage.setItem("pzim:looted-locations", JSON.stringify(["location-2", "location-2", null]));
storage.setItem("pzim:notes", JSON.stringify({ "location-1": "Checked", invalid: 99 }));
storage.setItem("pzim:user-markers", JSON.stringify([
  {
    id: "custom-1",
    name: "Home",
    category: "custom",
    label: "Personal",
    subtype: "custom",
    townId: "personal",
    town: "Personal",
    x: 10_650,
    y: 9_850,
  },
  { id: "invalid-marker" },
]));
storage.setItem("pzim:routes", JSON.stringify([
  {
    id: "route-1",
    mapId: "builtin:knox-country",
    points: [
      { id: "waypoint-1", x: 10_650, y: 9_850, label: "Home" },
      { id: "waypoint-2", x: 10_800, y: 9_900 },
    ],
    updatedAt: "2026-08-10T10:00:00.000Z",
  },
  {
    id: "route-2",
    mapId: "builtin:knox-country",
    name: "Supply run",
    points: [
      { id: "waypoint-3", x: 10_900, y: 9_950 },
      { id: "waypoint-4", x: 11_000, y: 10_050 },
    ],
    updatedAt: "2026-08-10T11:00:00.000Z",
  },
  { id: "invalid-route", mapId: "invalid", points: [{ id: "bad", x: "x", y: 2 }] },
]));
storage.setItem("pzim:loot-runs", JSON.stringify([
  {
    id: "loot-run-1",
    mapId: "builtin:knox-country",
    itemId: "Base.Bandage",
    itemName: "Bandage",
    locationIds: ["location-1", "location-2"],
    completedLocationIds: ["location-1"],
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T11:00:00.000Z",
  },
  {
    id: "loot-run-2",
    mapId: "builtin:knox-country",
    itemId: "Base.Hammer",
    itemName: "Hammer",
    items: [
      { id: "Base.Hammer", name: "Hammer" },
      { id: "Base.Nails", name: "Nails" },
      { id: "Base.Saw", name: "Saw" },
      { id: "Base.Screwdriver", name: "Screwdriver" },
      { id: "Base.Axe", name: "Axe" },
      { id: "Base.Woodglue", name: "Wood Glue" },
    ],
    locationIds: ["location-2"],
    completedLocationIds: [],
    createdAt: "2026-08-11T10:00:00.000Z",
    updatedAt: "2026-08-11T11:00:00.000Z",
  },
]));

assert.equal(migrateSavedMapStorage(storage), SAVED_MAP_STORAGE_VERSION);
assert.deepEqual(JSON.parse(storage.getItem("pzim:favorites")), ["location-1"]);
assert.deepEqual(JSON.parse(storage.getItem("pzim:looted-locations")), ["location-2"]);
assert.deepEqual(JSON.parse(storage.getItem("pzim:notes")), { "location-1": "Checked" });
assert.deepEqual(JSON.parse(storage.getItem("pzim:user-markers")), [{
  id: "custom-1",
  name: "Home",
  category: "custom",
  label: "Personal",
  subtype: "custom",
  townId: "personal",
  town: "Personal",
  x: 10_650,
  y: 9_850,
  group: "general",
  mapId: "builtin:knox-country",
}]);
assert.deepEqual(JSON.parse(storage.getItem("pzim:routes")), [{
  id: "route-1",
  mapId: "builtin:knox-country",
  points: [
    { id: "waypoint-1", x: 10_650, y: 9_850, label: "Home" },
    { id: "waypoint-2", x: 10_800, y: 9_900 },
  ],
  updatedAt: "2026-08-10T10:00:00.000Z",
}, {
  id: "route-2",
  mapId: "builtin:knox-country",
  name: "Supply run",
  points: [
    { id: "waypoint-3", x: 10_900, y: 9_950 },
    { id: "waypoint-4", x: 11_000, y: 10_050 },
  ],
  updatedAt: "2026-08-10T11:00:00.000Z",
}]);
assert.deepEqual(JSON.parse(storage.getItem("pzim:loot-runs")), [{
  id: "loot-run-1",
  mapId: "builtin:knox-country",
  itemId: "Base.Bandage",
  itemName: "Bandage",
  items: [{ id: "Base.Bandage", name: "Bandage" }],
  locationIds: ["location-1", "location-2"],
  completedLocationIds: ["location-1"],
  createdAt: "2026-08-10T10:00:00.000Z",
  updatedAt: "2026-08-10T11:00:00.000Z",
}, {
  id: "loot-run-2",
  mapId: "builtin:knox-country",
  itemId: "Base.Hammer",
  itemName: "Hammer",
  items: [
    { id: "Base.Hammer", name: "Hammer" },
    { id: "Base.Nails", name: "Nails" },
    { id: "Base.Saw", name: "Saw" },
    { id: "Base.Screwdriver", name: "Screwdriver" },
    { id: "Base.Axe", name: "Axe" },
    { id: "Base.Woodglue", name: "Wood Glue" },
  ],
  locationIds: ["location-2"],
  completedLocationIds: [],
  createdAt: "2026-08-11T10:00:00.000Z",
  updatedAt: "2026-08-11T11:00:00.000Z",
}]);

console.log("Saved map migration tests passed.");
