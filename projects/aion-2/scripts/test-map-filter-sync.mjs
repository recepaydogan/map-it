import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["src/features/map/map-filter-preferences.ts"],
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
  define: { "import.meta.env": JSON.stringify({ DEV: true, BASE_URL: "/" }) },
});
const storage = new Map();
const windows = [];
const events = [];
let writes = 0;

// Each window gets a separate module instance, like desktop and Overwolf minimap.
function createWindow() {
  const listeners = new Set();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem(key, value) {
      const oldValue = storage.get(key) ?? null;
      if (oldValue === value) return;
      writes++;
      storage.set(key, value);
      for (const other of windows) {
        if (other.localStorage !== localStorage) events.push(() => other.dispatch(key));
      }
    },
  };
  const window = {
    localStorage,
    addEventListener(type, listener) {
      assert.equal(type, "storage");
      listeners.add(listener);
    },
    dispatch(key) {
      for (const listener of listeners) listener({ key, storageArea: localStorage });
    },
  };
  windows.push(window);
  const module = { exports: {} };
  runInNewContext(compiled.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url),
    localStorage, window, console,
  });
  return module.exports;
}
const flush = () => {
  while (events.length) events.shift()();
};
const read = (store, map = "map-a") => JSON.parse(JSON.stringify(store.getMapFilterPreferences(map)));

const desktop = createWindow();
const minimap = createWindow();
let desktopUpdates = 0;
let minimapUpdates = 0;
const stopDesktop = desktop.subscribeMapFilterPreferences(() => desktopUpdates++);
const stopMinimap = minimap.subscribeMapFilterPreferences(() => minimapUpdates++);
assert.equal(read(minimap).categories, null);
assert.equal(minimap.getMapFilterPreferences("map-a"), minimap.getMapFilterPreferences("map-a"));

desktop.setMapFilterCategories("map-a", ["boss", "enemy", "region"]);
assert.equal(desktopUpdates, 1, "The writing window must update immediately.");
assert.equal(minimapUpdates, 0, "Other windows receive asynchronous storage events.");
flush();
assert.deepEqual(read(minimap), read(desktop));
assert.equal(minimapUpdates, 1);
assert.equal(writes, 1, "Synchronization must not echo writes back.");

for (const categories of [["region"], [], ["boss", "enemy"], ["enemy"]]) {
  desktop.setMapFilterCategories("map-a", categories);
  flush();
  assert.deepEqual(read(minimap).categories, categories, "Group, Only, and Hide all changes must sync.");
}

// Different maps retain their own selections; revisiting uses the latest value.
desktop.setMapFilterCategories("map-b", ["region"]);
flush();
assert.deepEqual(read(minimap, "map-b").categories, ["region"]);
desktop.setMapFilterCategories("map-a", ["boss"]);
flush();
assert.deepEqual(read(minimap).categories, ["boss"]);
assert.deepEqual(read(minimap, "map-b").categories, ["region"]);

// Global personal-layer filters must not overwrite each other across windows.
desktop.toggleMapFilterHiddenLayer("completed");
minimap.toggleMapFilterHiddenLayer("favorites");
flush();
assert.equal(read(minimap).hideCompleted, true);
assert.equal(read(desktop).hideFavorites, true);
assert.deepEqual(read(minimap), read(desktop));
desktop.toggleMapFilterHiddenLayer("completed");
flush();
assert.equal(read(minimap).hideCompleted, false);
assert.equal(read(minimap).hideFavorites, true);
assert.deepEqual(read(createWindow()), read(desktop), "A reopened minimap restores the current filters.");

const snapshot = minimap.getMapFilterPreferences("map-a");
windows[1].dispatch("unrelated-setting");
assert.equal(minimap.getMapFilterPreferences("map-a"), snapshot);
storage.delete("gm:active-categories:v7:map-a");
windows[1].dispatch("gm:active-categories:v7:map-a");
assert.equal(read(minimap).categories, null, "Removing a selection restores defaults.");

storage.set("gm:active-categories:v6:legacy-map", '["boss"]');
assert.deepEqual(read(desktop, "legacy-map").categories, ["boss", "region"]);
flush();
assert.deepEqual(read(minimap, "legacy-map"), read(desktop, "legacy-map"));

storage.clear();
for (const window of windows) window.dispatch(null);
assert.deepEqual(read(minimap), { categories: null, hideCompleted: false, hideFavorites: false });
stopDesktop();
stopMinimap();
console.log("Map filter sync passed: separate windows, groups, empty selection, map switching, personal layers, reopen, migration and reset.");
