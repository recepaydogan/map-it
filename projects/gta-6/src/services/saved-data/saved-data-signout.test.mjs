import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("sign-out removes account data and account snapshots from local storage", async () => {
  const values = new Map([
    ["gta6-app:saved-data-owner", "account-1"],
    ["gta6-app:saved-state-version", "2"],
    ["gta6-app:favorites", '["account-favorite"]'],
    ["gta6-app:completed-locations", '["account-found"]'],
    ["gta6-app:user-markers", "[]"],
    ["gta6-app:notes", '{"account-found":"private note"}'],
    ["player-checklist-v1:titles", '["account-title"]'],
    ["gta6-app:event-reminders:v1", '{"leadMinutes":5,"sound":"chime","soundSeconds":10,"enabled":["event"]}'],
    ["gta6-app:saved-data-base:account-1", '{"notes":{"account-found":"private note"}}'],
    ["gta6-app:saved-data-cache:account-1", '{"notes":{"account-found":"private note"}}'],
    ["gta6-app:saved-data-cache:guest", '{"notes":{"guest":"old guest note"}}'],
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

  assert.equal(values.get("gta6-app:saved-data-owner"), "guest");
  assert.deepEqual(JSON.parse(values.get("gta6-app:favorites")), []);
  assert.deepEqual(JSON.parse(values.get("gta6-app:completed-locations")), []);
  assert.deepEqual(JSON.parse(values.get("gta6-app:notes")), {});
  assert.equal(values.has("player-checklist-v1:titles"), false);
  assert.equal(values.has("gta6-app:event-reminders:v1"), false);
  assert.equal(values.has("gta6-app:saved-data-base:account-1"), false);
  assert.equal(values.has("gta6-app:saved-data-cache:account-1"), false);
  assert.equal(JSON.parse(values.get("gta6-app:saved-data-cache:guest")).notes.guest, undefined);
});
