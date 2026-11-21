import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("sign-out removes account data and account snapshots from local storage", async () => {
  const values = new Map([
    ["phantom-blade-app:saved-data-owner", "account-1"],
    ["phantom-blade-app:saved-state-version", "2"],
    ["phantom-blade-app:favorites", '["account-favorite"]'],
    ["phantom-blade-app:completed-locations", '["account-found"]'],
    ["phantom-blade-app:user-markers", "[]"],
    ["phantom-blade-app:notes", '{"account-found":"private note"}'],
    ["player-checklist-v1:titles", '["account-title"]'],
    ["phantom-blade-app:event-reminders:v1", '{"leadMinutes":5,"sound":"chime","soundSeconds":10,"enabled":["event"]}'],
    ["phantom-blade-app:saved-data-base:account-1", '{"notes":{"account-found":"private note"}}'],
    ["phantom-blade-app:saved-data-cache:account-1", '{"notes":{"account-found":"private note"}}'],
    ["phantom-blade-app:saved-data-cache:guest", '{"notes":{"guest":"old guest note"}}'],
  ]);
  globalThis.localStorage = {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
  globalThis.window = { dispatchEvent: () => true };

  const bundle = await build({
    entryPoints: ["src/services/saved-data/saved-data-sync.ts"], bundle: true,
    platform: "browser", format: "esm", write: false,
    define: {
      "import.meta.env.VITE_SUPABASE_URL": "undefined",
      "import.meta.env.VITE_SUPABASE_ANON_KEY": "undefined",
    },
  });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`;
  const { setSavedDataUser } = await import(url);
  setSavedDataUser(null);

  assert.equal(values.get("phantom-blade-app:saved-data-owner"), "guest");
  assert.deepEqual(JSON.parse(values.get("phantom-blade-app:favorites")), []);
  assert.deepEqual(JSON.parse(values.get("phantom-blade-app:completed-locations")), []);
  assert.deepEqual(JSON.parse(values.get("phantom-blade-app:notes")), {});
  assert.equal(values.has("player-checklist-v1:titles"), false);
  assert.equal(values.has("phantom-blade-app:event-reminders:v1"), false);
  assert.equal(values.has("phantom-blade-app:saved-data-base:account-1"), false);
  assert.equal(values.has("phantom-blade-app:saved-data-cache:account-1"), false);
  assert.equal(JSON.parse(values.get("phantom-blade-app:saved-data-cache:guest")).notes.guest, undefined);
});
