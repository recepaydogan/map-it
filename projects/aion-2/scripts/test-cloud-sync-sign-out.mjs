import assert from "node:assert/strict";
import { build } from "esbuild";

class MemoryStorage {
  #items = new Map();
  get length() { return this.#items.size; }
  key(index) { return [...this.#items.keys()][index] ?? null; }
  getItem(key) { return this.#items.get(key) ?? null; }
  setItem(key, value) { this.#items.set(key, String(value)); }
  removeItem(key) { this.#items.delete(key); }
}

const storage = new MemoryStorage();
globalThis.localStorage = storage;
globalThis.window = new EventTarget();
window.localStorage = storage;
const compiled = await build({
  entryPoints: ["src/services/sync/cloud-sync.ts"], bundle: true, write: false,
  platform: "node", format: "esm",
  define: {
    "import.meta.env.VITE_SUPABASE_URL": "undefined",
    "import.meta.env.VITE_SUPABASE_ANON_KEY": "undefined",
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`;
const { clearCloudSyncAfterSignOut, flushCloudSync, setCloudSyncUser } = await import(moduleUrl);
{
  const userId = "user-1";
  storage.setItem("gm:saved-data-owner", userId);
  storage.setItem("gm:favorites", JSON.stringify(["found-place"]));
  storage.setItem("gm:completed-locations", JSON.stringify(["found-place"]));
  storage.setItem("gm:notes", JSON.stringify({ "found-place": "Private note" }));
  storage.setItem("gm:user-markers", "[]");
  storage.setItem("player-checklist-v1:titles", JSON.stringify(["owned-title"]));
  storage.setItem("gm:event-reminders:v1", JSON.stringify({
    leadMinutes: 5, sound: "chime", soundSeconds: 10, enabled: ["event-1"],
  }));
  storage.setItem("character-profiles:last-character", JSON.stringify({
    character: { characterId: "private-character", name: "Private", level: 45,
      pcId: 1, race: 1, region: "eu", serverId: 1001, serverName: "Nezekan" },
    viewedAt: 100,
  }));
  storage.setItem(`gm:saved-data-cache:${userId}`, "cached progress");
  storage.setItem(`gm:saved-data-base:${userId}`, "synced progress");
  storage.setItem("gm:pending-guest-data", "{}");
  storage.setItem("unrelated-device-setting", "keep");

  clearCloudSyncAfterSignOut(userId);

  assert.equal(storage.getItem("gm:saved-data-owner"), null);
  assert.equal(storage.getItem(`gm:saved-data-cache:${userId}`), null);
  assert.equal(storage.getItem(`gm:saved-data-base:${userId}`), null);
  assert.equal(storage.getItem("gm:pending-guest-data"), null);
  assert.deepEqual(JSON.parse(storage.getItem("gm:favorites")), []);
  assert.deepEqual(JSON.parse(storage.getItem("gm:completed-locations")), []);
  assert.deepEqual(JSON.parse(storage.getItem("gm:notes")), {});
  assert.equal(storage.getItem("player-checklist-v1:titles"), null);
  assert.equal(storage.getItem("gm:event-reminders:v1"), null);
  assert.equal(storage.getItem("character-profiles:last-character"), null);
  assert.equal(storage.getItem("unrelated-device-setting"), "keep");
}

const pendingUserId = "user-2";
storage.setItem("gm:saved-data-owner", pendingUserId);
storage.setItem("gm:favorites", JSON.stringify(["unsynced-place"]));
setCloudSyncUser(pendingUserId);
assert.equal(await flushCloudSync(pendingUserId), false, "Sign-out must stop when local progress cannot reach the server.");
assert.deepEqual(JSON.parse(storage.getItem("gm:favorites")), ["unsynced-place"]);

console.log("Cloud sync sign-out cleanup test passed.");
