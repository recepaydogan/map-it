import assert from "node:assert/strict";
import { parseEventPreferences, defaultEventPreferences } from "../src/features/events/event-preferences.ts";
import { createEventPreferencesStore, EVENT_PREFERENCES_KEY } from "../src/features/events/event-preferences-store.ts";

const legacy = { ...defaultEventPreferences(), server: "NAW", serverSelection: "manual",
  displayTimeZone: "Europe/Istanbul", enabled: ["boss-a"], sound: "off", leadMinutes: 15 };
assert.deepEqual(parseEventPreferences(JSON.stringify(legacy)), {
  leadMinutes: 15, sound: "off", soundSeconds: 10, enabled: ["boss-a"], serverRegion: "eu",
});
assert.deepEqual(parseEventPreferences(null), defaultEventPreferences());
assert.equal(parseEventPreferences(JSON.stringify({ ...legacy, serverRegion: null })).serverRegion, "eu");
assert.throws(() => parseEventPreferences("{"));
assert.throws(() => parseEventPreferences(JSON.stringify({ ...legacy, leadMinutes: 2 })));
assert.throws(() => parseEventPreferences(JSON.stringify({ ...legacy, serverRegion: "invalid" })));

function fixture(raw = null, shared) {
  const saved = shared ?? { raw };
  let sync;
  const store = createEventPreferencesStore({
    storage: { getItem: () => saved.raw, setItem: (key, value) => {
      assert.equal(key, EVENT_PREFERENCES_KEY);
      saved.raw = value;
    } },
    listen: (listener) => { sync = listener; return () => { sync = undefined; }; },
  });
  const unsubscribe = store.subscribe(() => {});
  return { store, saved, sync: () => sync?.(), unsubscribe };
}

const first = fixture(JSON.stringify(legacy));
first.store.update({ leadMinutes: 10 });
assert.deepEqual(first.store.getSnapshot().preferences, {
  leadMinutes: 10, sound: "off", soundSeconds: 10, enabled: ["boss-a"], serverRegion: "eu",
});
assert.equal(JSON.parse(first.saved.raw).server, undefined);
first.store.update({ serverRegion: "eu" });
assert.equal(JSON.parse(first.saved.raw).serverRegion, "eu");
assert.equal(first.store.getSnapshot().preferences.serverRegion, "eu");

const shared = { raw: null };
const desktop = fixture(null, shared);
const overlay = fixture(null, shared);
desktop.store.update({ enabled: ["boss-a"] });
overlay.store.update({ leadMinutes: 10 });
desktop.sync();
assert.equal(desktop.store.getSnapshot().preferences.leadMinutes, 10);
assert.deepEqual(desktop.store.getSnapshot().preferences.enabled, ["boss-a"]);

for (const entry of [first, desktop, overlay]) entry.unsubscribe();
console.log("Event preferences passed: legacy migration, persistence and cross-window synchronization.");
