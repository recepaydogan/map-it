import assert from "node:assert/strict";
import test from "node:test";
import { emptySavedData, mergeGuestData, mergeSavedData, sameSavedData } from "./saved-data-model.ts";

const marker = (id, name) => ({ id, name, category: "custom", label: "Personal",
  subtype: "custom", regionId: "personal", region: "Home", x: 1, y: 2 });

test("sign-in imports guest progress without dropping existing account data", () => {
  const account = { ...emptySavedData(), favorites: ["account-pin"], completed: ["old-found"],
    markers: [marker("account-marker", "Account")], notes: { shared: "account note" },
    checklists: { "player-checklist-v1:titles": ["account-title"] } };
  const guest = { ...emptySavedData(), favorites: ["guest-pin"], completed: ["new-found"],
    markers: [marker("guest-marker", "Guest")], notes: { shared: "guest note" },
    checklists: { "player-checklist-v1:titles": ["guest-title"] } };
  const result = mergeGuestData(account, guest);
  assert.deepEqual(result.favorites, ["account-pin", "guest-pin"]);
  assert.deepEqual(result.completed, ["old-found", "new-found"]);
  assert.deepEqual(result.markers.map(({ id }) => id), ["account-marker", "guest-marker"]);
  assert.equal(result.notes.shared, "guest note");
  assert.deepEqual(result.checklists["player-checklist-v1:titles"], ["account-title", "guest-title"]);
});

test("a local removal survives a concurrent remote addition", () => {
  const base = { ...emptySavedData(), favorites: ["remove-me"],
    markers: [marker("remove-marker", "Old")], notes: { "remove-marker": "Old note" } };
  const local = emptySavedData();
  const remote = { ...base, favorites: ["remove-me", "remote-pin"],
    markers: [marker("remove-marker", "Old"), marker("remote-marker", "Remote")],
    notes: { "remove-marker": "Old note", "remote-marker": "Remote note" } };
  const result = mergeSavedData(base, local, remote);
  assert.deepEqual(result.favorites, ["remote-pin"]);
  assert.deepEqual(result.markers.map(({ id }) => id), ["remote-marker"]);
  assert.deepEqual({ ...result.notes }, { "remote-marker": "Remote note" });
});

test("latest local edit wins a conflict while other remote edits remain", () => {
  const base = { ...emptySavedData(), notes: { shared: "old" },
    checklists: { "player-checklist-v1:titles": ["old-title"] } };
  const local = { ...base, notes: { shared: "local" },
    checklists: { "player-checklist-v1:titles": ["old-title", "local-title"] } };
  const remote = { ...base, notes: { shared: "remote", other: "remote-only" },
    checklists: { "player-checklist-v1:titles": ["old-title", "remote-title"] } };
  const result = mergeSavedData(base, local, remote);
  assert.deepEqual({ ...result.notes }, { shared: "local", other: "remote-only" });
  assert.deepEqual(result.checklists["player-checklist-v1:titles"],
    ["old-title", "remote-title", "local-title"]);
});

test("database JSON key ordering does not trigger a new write", () => {
  assert.equal(sameSavedData({ notes: { b: "two", a: "one" } },
    { notes: { a: "one", b: "two" } }), true);
});
