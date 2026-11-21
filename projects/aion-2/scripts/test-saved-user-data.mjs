import assert from "node:assert/strict";
import {
  emptySavedUserData,
  mergeSavedUserData,
  normalizeSavedUserData,
  readSavedUserData,
  writeSavedUserData,
} from "../src/services/sync/saved-user-data.ts";

const marker = (id, name) => ({
  id, name, category: "custom", label: "Personal", subtype: "custom",
  regionId: "personal", region: "Region", x: 10, y: 20, group: "general",
});
const character = (name, viewedAt) => ({
  character: { characterId: `character-${name}`, name, level: 45, pcId: 4, race: 1,
    region: "eu", serverId: 1001, serverName: "Nezekan" },
  viewedAt,
});

const empty = emptySavedUserData();
const guest = normalizeSavedUserData({
  favorites: ["shared", "guest"], completed: ["found"],
  notes: { shared: "Guest note", guest: "New note" },
  markers: [marker("custom-guest", "Guest marker")],
  checklists: { titles: ["guest-title"] },
  eventPreferences: { leadMinutes: 5, sound: "chime", soundSeconds: 10, enabled: ["guest-event"] },
  lastCharacter: character("guest", 200),
});
const account = normalizeSavedUserData({
  favorites: ["shared", "account"], completed: ["account-found"],
  notes: { shared: "Account note", account: "Existing note" },
  markers: [marker("custom-account", "Account marker")],
  checklists: { titles: ["account-title"] },
  eventPreferences: { leadMinutes: 10, sound: "bell", soundSeconds: 20, enabled: ["account-event"], serverRegion: "eu" },
  lastCharacter: character("account", 100),
});
const joined = mergeSavedUserData(empty, guest, account);
assert.deepEqual(joined.favorites, ["shared", "account", "guest"]);
assert.deepEqual(joined.completed, ["account-found", "found"]);
assert.deepEqual(joined.markers.map(({ id }) => id), ["custom-account", "custom-guest"]);
assert.deepEqual(joined.notes, { shared: "Account note\n\nGuest note", account: "Existing note", guest: "New note" });
assert.deepEqual(joined.checklists.titles, ["account-title", "guest-title"]);
assert.deepEqual(joined.eventPreferences.enabled, ["account-event", "guest-event"]);
assert.equal(joined.eventPreferences.leadMinutes, 5);
assert.equal(joined.eventPreferences.serverRegion, "eu");
assert.equal(joined.lastCharacter.character.name, "guest");
assert.deepEqual(mergeSavedUserData(empty, guest, joined).notes, joined.notes);
assert.equal(mergeSavedUserData(empty, guest, normalizeSavedUserData({
  lastCharacter: character("newer", 300),
})).lastCharacter.character.name, "newer");

// The account fetched later must retain deliberate local removals and edits.
const edited = normalizeSavedUserData({
  ...account,
  favorites: ["shared"],
  completed: ["account-found"],
  notes: { shared: "Edited note" },
  markers: [marker("custom-account", "Renamed")],
  checklists: { titles: [] },
  lastCharacter: character("local", 400),
});
const elsewhere = normalizeSavedUserData({
  ...account,
  favorites: [...account.favorites, "elsewhere"],
  notes: { ...account.notes, elsewhere: "Other device" },
  markers: [...account.markers, marker("custom-elsewhere", "Other device")],
  lastCharacter: character("remote", 300),
});
const reconciled = mergeSavedUserData(account, edited, elsewhere);
assert.deepEqual(reconciled.favorites, ["shared", "elsewhere"]);
assert.deepEqual(reconciled.notes, { shared: "Edited note", elsewhere: "Other device" });
assert.deepEqual(reconciled.markers.map(({ id, name }) => [id, name]), [
  ["custom-account", "Renamed"], ["custom-elsewhere", "Other device"],
]);
assert.deepEqual(reconciled.checklists.titles, []);
assert.equal(reconciled.lastCharacter.character.name, "local");

class MemoryStorage {
  #items = new Map();
  get length() { return this.#items.size; }
  key(index) { return [...this.#items.keys()][index] ?? null; }
  getItem(key) { return this.#items.get(key) ?? null; }
  setItem(key, value) { this.#items.set(key, String(value)); }
  removeItem(key) { this.#items.delete(key); }
}
const storage = new MemoryStorage();
storage.setItem("unrelated-device-setting", "keep");
writeSavedUserData(storage, joined);
assert.deepEqual(readSavedUserData(storage), joined);
writeSavedUserData(storage, empty);
assert.deepEqual(readSavedUserData(storage), empty);
assert.equal(storage.getItem("player-checklist-v1:titles"), null);
assert.equal(storage.getItem("unrelated-device-setting"), "keep");
storage.setItem("character-profiles:last-character", JSON.stringify({
  characterId: "legacy-character", name: "Legacy", level: 40, pcId: 1, race: 1,
  region: "eu", serverId: 1001, serverName: "Nezekan",
}));
assert.equal(readSavedUserData(storage).lastCharacter.character.name, "Legacy");

console.log("Saved user data merge tests passed.");
