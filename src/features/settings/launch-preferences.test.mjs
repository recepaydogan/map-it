import assert from "node:assert/strict";
import test from "node:test";

const STORAGE_KEY = "map-it:launch-preferences";
let moduleId = 0;

const loadPreferences = async (t, storedValue) => {
  const storage = new Map();
  const listeners = new Map();
  if (storedValue !== undefined) {
    storage.set(STORAGE_KEY, typeof storedValue === "string"
      ? storedValue : JSON.stringify(storedValue));
  }
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  t.after(() => { delete globalThis.window; });
  const preferences = await import(`./launch-preferences.ts?test=${++moduleId}`);
  return {
    ...preferences,
    storage,
    emitStorage: (key) => listeners.get("storage")?.({ key }),
  };
};

test("a new installation defaults desktop, full overlay and minimap launch settings on", async (t) => {
  const { getLaunchPreferences } = await loadPreferences(t);
  assert.deepEqual(getLaunchPreferences(), {
    autoOpenAppWithGame: true,
    autoOpenInGameOverlay: true,
    autoOpenMinimap: true,
  });
});

test("saved in-game choice survives reload and missing fields use the old default", async (t) => {
  const { getLaunchPreferences } = await loadPreferences(t, {
    autoOpenInGameOverlay: false,
    autoOpenMinimap: true,
  });
  assert.deepEqual(getLaunchPreferences(), {
    autoOpenAppWithGame: true,
    autoOpenInGameOverlay: false,
    autoOpenMinimap: true,
  });
});

test("changing the in-game setting persists it without changing desktop launch", async (t) => {
  const store = await loadPreferences(t, {
    autoOpenAppWithGame: false,
    autoOpenInGameOverlay: false,
    autoOpenMinimap: true,
  });
  let notifications = 0;
  const unsubscribe = store.subscribeLaunchPreferences(() => { notifications++; });
  store.updateLaunchPreferences({ autoOpenInGameOverlay: true });
  assert.deepEqual(JSON.parse(store.storage.get(STORAGE_KEY)), {
    autoOpenAppWithGame: false,
    autoOpenInGameOverlay: true,
    autoOpenMinimap: true,
  });
  assert.deepEqual(store.getLaunchPreferences(), {
    autoOpenAppWithGame: false,
    autoOpenInGameOverlay: true,
    autoOpenMinimap: true,
  });
  assert.equal(notifications, 1);
  unsubscribe();
});

test("a background window reads a changed setting after the storage event", async (t) => {
  const store = await loadPreferences(t, { autoOpenInGameOverlay: true });
  const before = store.getLaunchPreferences();
  store.storage.set(STORAGE_KEY, JSON.stringify({ autoOpenInGameOverlay: false }));
  store.emitStorage("unrelated-key");
  assert.strictEqual(store.getLaunchPreferences(), before);
  store.emitStorage(STORAGE_KEY);
  assert.deepEqual(store.getLaunchPreferences(), {
    autoOpenAppWithGame: true,
    autoOpenInGameOverlay: false,
    autoOpenMinimap: true,
  });
});


test("turning off minimap auto-open persists independently across windows", async (t) => {
  const store = await loadPreferences(t);
  store.updateLaunchPreferences({ autoOpenMinimap: false });
  assert.equal(store.getLaunchPreferences().autoOpenMinimap, false);
  assert.equal(JSON.parse(store.storage.get(STORAGE_KEY)).autoOpenMinimap, false);
  const stored = JSON.parse(store.storage.get(STORAGE_KEY));
  store.storage.set(STORAGE_KEY, JSON.stringify({ ...stored, autoOpenMinimap: true }));
  store.emitStorage(STORAGE_KEY);
  assert.equal(store.getLaunchPreferences().autoOpenMinimap, true);
});
