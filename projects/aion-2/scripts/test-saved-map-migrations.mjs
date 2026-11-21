import assert from "node:assert/strict";
import {
  COMPLETED_LOCATIONS_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  migrateSavedMapStorage,
  NOTES_STORAGE_KEY,
  SAVED_MAP_STORAGE_VERSION,
} from "../src/features/map/saved-map-storage.ts";

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
storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["location-1", "location-1", 42]));
storage.setItem(COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(["location-2", "location-2", null]));
storage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ "location-1": "Checked", invalid: 99 }));
storage.setItem(MARKERS_STORAGE_KEY, JSON.stringify([
  {
    id: "custom-1",
    name: "Home",
    category: "custom",
    label: "Personal",
    subtype: "custom",
    regionId: "personal",
    region: "Personal",
    x: 1_650,
    y: 985,
    color: "not-a-color",
    icon: "flag",
    group: "loot",
    mapId: "sample",
  },
  {
    id: "custom-2",
    name: "Portal",
    category: "custom",
    label: "Personal",
    subtype: "custom",
    regionId: "personal",
    region: "Personal",
    x: 1_700,
    y: 1_000,
    icon: "category:portal",
  },
  { id: "invalid-marker" },
]));

assert.equal(migrateSavedMapStorage(storage), SAVED_MAP_STORAGE_VERSION);
assert.deepEqual(JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY)), ["location-1"]);
assert.deepEqual(JSON.parse(storage.getItem(COMPLETED_LOCATIONS_STORAGE_KEY)), ["location-2"]);
assert.deepEqual(JSON.parse(storage.getItem(NOTES_STORAGE_KEY)), { "location-1": "Checked" });
// Unknown colour dropped, unknown group reset, everything valid kept.
assert.deepEqual(JSON.parse(storage.getItem(MARKERS_STORAGE_KEY)), [{
  id: "custom-1",
  name: "Home",
  category: "custom",
  label: "Personal",
  subtype: "custom",
  regionId: "personal",
  region: "Personal",
  x: 1_650,
  y: 985,
  icon: "flag",
  group: "general",
  mapId: "sample",
}, {
  id: "custom-2",
  name: "Portal",
  category: "custom",
  label: "Personal",
  subtype: "custom",
  regionId: "personal",
  region: "Personal",
  x: 1_700,
  y: 1_000,
  icon: "category:portal",
  group: "general",
}]);

// A second run at the current version is a no-op.
storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["untouched", "untouched"]));
assert.equal(migrateSavedMapStorage(storage), SAVED_MAP_STORAGE_VERSION);
assert.deepEqual(JSON.parse(storage.getItem(FAVORITES_STORAGE_KEY)), ["untouched", "untouched"]);

console.log("Saved map migration tests passed.");
