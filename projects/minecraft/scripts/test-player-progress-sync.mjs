import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  clearSavedMapProgress,
  readSavedMapProgress,
  replaceSavedMapProgress,
} from "../src/features/map/saved-map-storage.ts";
import { createWorldRepository } from "../src/features/worlds/world-repository.ts";
import { createJourneyStorage } from "../src/features/journey/journey-storage.ts";
import { emptyJourneyData, emptyJourneyPreferences } from "../src/features/journey/journey-state.ts";
import { adoptGuestJourneyProgress, mergeJourneyProgress, parseJourneyProgress, sameJourneyProgress }
  from "../src/services/sync/journey-progress.ts";
import {
  canonicalizePlayerProgress,
  fromAccountWorld,
  mergePlayerProgress,
  parsePlayerProgress,
  reconcilePlayerProgress,
  samePlayerProgress,
  toAccountWorld,
} from "../src/services/sync/player-progress.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const marker = id => ({
  id, name: id, category: "custom", label: "Personal", subtype: "custom",
  regionId: "personal", region: "Personal", x: 12, y: 24, group: "general",
});

const personal = (suffix, views = {}) => ({
  pins: [{ id: `pin-${suffix}`, dimension: "surface", name: "Home", icon: "home",
    color: "sage", group: "base", note: "", x: 1, y: null, z: 2 }],
  portals: [{ id: `portal-${suffix}`, transition: { index: 0,
    from: { dimension: "overworld", point: { x: suffix === "local" ? 80 : 800, y: 64, z: 0, at: 100 } },
    to: { dimension: "nether", point: { x: suffix === "local" ? 10 : 100, y: 64, z: 0, at: 101 } },
  } }],
  favorites: [`[\"surface\",\"favorite-${suffix}\"]`],
  found: [`[\"surface\",\"found-${suffix}\"]`],
  notes: { [`note-${suffix}`]: suffix },
  tracked: [{ id: `target-${suffix}`, dimension: "surface", label: "Target",
    pointId: null, x: 3, y: null, z: 4 }],
  views,
});

const world = (suffix, views = {}) => ({
  schemaVersion: 1, id: "world-one", name: `World ${suffix}`, edition: "java",
  generation: { version: "1.21.10", seed: "42", preset: "default", settings: {} },
  association: { kind: "local", identity: `folder-${suffix}`, confirmedAt: 100 },
  favorite: suffix === "local", createdAt: 10, lastOpenedAt: 20, movedToBottomAt: null,
  personal: personal(suffix, views),
});

const local = {
  map: { favoriteIds: ["local"], completedIds: ["done-local"], markers: [marker("local")],
    notes: { shared: "local", local: "note" } },
  worlds: [toAccountWorld(world("local"))],
};
const remote = {
  map: { favoriteIds: ["remote"], completedIds: ["done-remote"], markers: [marker("remote")],
    notes: { shared: "remote", remote: "note" } },
  worlds: [toAccountWorld(world("remote"))],
};

const merged = mergePlayerProgress(local, remote);
assert.deepEqual(new Set(merged.map.favoriteIds), new Set(["local", "remote"]));
assert.deepEqual(new Set(merged.map.completedIds), new Set(["done-local", "done-remote"]));
assert.deepEqual(new Set(merged.map.markers.map(item => item.id)), new Set(["local", "remote"]));
assert.equal(merged.map.notes.shared, "local");
assert.equal(merged.map.notes.remote, "note");
assert.equal(merged.worlds[0].name, "World local");
assert.equal(merged.worlds[0].personal.pins.length, 2);
assert.equal(merged.worlds[0].personal.portals.length, 2);
const removedPortal = local.worlds[0].personal.portals[0];
const removedLocally = { ...local, worlds: [{ ...local.worlds[0], personal: {
  ...local.worlds[0].personal, portals: [], removedPortals: [removedPortal],
} }] };
const stillPresentRemotely = { ...remote, worlds: [{ ...remote.worlds[0], personal: {
  ...remote.worlds[0].personal, portals: [removedPortal],
} }] };
const afterRemovalSync = mergePlayerProgress(removedLocally, stillPresentRemotely);
assert.equal(afterRemovalSync.worlds[0].personal.portals.length, 0);
assert.equal(afterRemovalSync.worlds[0].personal.removedPortals.length, 1);
assert.equal(merged.worlds[0].personal.found.length, 2);
assert.equal(merged.worlds[0].personal.tracked.length, 2);
assert.equal(merged.worlds[0].personal.notes["note-local"], "local");
assert.equal(merged.worlds[0].personal.notes["note-remote"], "remote");
assert.equal(canonicalizePlayerProgress(merged), canonicalizePlayerProgress({
  ...merged,
  map: { ...merged.map, favoriteIds: [...merged.map.favoriteIds].reverse() },
}));
const reorderObjectKeys = value => Array.isArray(value) ? value.map(reorderObjectKeys)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorderObjectKeys(item)]))
    : value;
assert.equal(samePlayerProgress(merged, parsePlayerProgress(reorderObjectKeys(merged))), true,
  "JSONB object key order must not cause a false sync conflict");

const cloud = { rev: 7, progress: remote };
assert.equal(reconcilePlayerProgress("user", local, null, null).desired, local);
assert.equal(reconcilePlayerProgress("user", local, cloud, { userId: "user", rev: 7 }).desired, local);
assert.equal(reconcilePlayerProgress("user", local, cloud, { userId: "other", rev: 7 }).desired, remote);
assert.deepEqual(reconcilePlayerProgress("user", {
  map: { favoriteIds: [], completedIds: [], markers: [], notes: {} }, worlds: [],
}, cloud, null).desired, remote);
assert.deepEqual(reconcilePlayerProgress("user", local, cloud, null).desired, merged);

const route = (id, at, biome) => ({
  id, worldId: "world-one", sessionKey: `session-${id}`, startedAt: at,
  endedAt: at + 2, endReason: "session-ended", pendingBreak: false, truncated: false,
  segments: [{ dimension: "overworld", points: [
    { x: at, y: 64, z: 0, at, biome }, { x: at + 1, y: 65, z: 1, at: at + 1, biome },
  ] }],
});
const localJourney = {
  preferences: emptyJourneyPreferences("world-one", 10),
  data: { ...emptyJourneyData("world-one", 0, 20), journeys: [route("local", 10, "forest")] },
};
const remoteJourney = {
  preferences: emptyJourneyPreferences("world-one", 5),
  data: { ...emptyJourneyData("world-one", 0, 20), journeys: [route("remote", 15, "plains")] },
};
const mergedJourney = mergeJourneyProgress(localJourney, remoteJourney);
assert.deepEqual(mergedJourney.data.journeys.map(item => item.id), ["remote", "local"]);
const deletedJourney = { ...localJourney,
  data: { ...localJourney.data, journeys: [], deletedJourneyIds: ["local"] } };
assert.deepEqual(mergeJourneyProgress(deletedJourney, localJourney).data.journeys, []);
assert.deepEqual(mergeJourneyProgress(localJourney, deletedJourney).data.deletedJourneyIds, ["local"]);
assert.deepEqual(mergedJourney.data.journeys[1].segments[0].points.map(item => item.biome), ["forest", "forest"]);
assert.deepEqual(parseJourneyProgress(mergedJourney, "world-one"), mergedJourney);
assert.equal(sameJourneyProgress(mergedJourney,
  parseJourneyProgress(reorderObjectKeys(mergedJourney), "world-one")), true);
const clearedJourney = {
  preferences: { ...remoteJourney.preferences, clearRevision: 2, updatedAt: 30 },
  data: emptyJourneyData("world-one", 2, 30),
};
assert.deepEqual(mergeJourneyProgress(localJourney, clearedJourney), clearedJourney);
const adopted = adoptGuestJourneyProgress(localJourney, clearedJourney, false);
assert.deepEqual(mergeJourneyProgress(adopted, clearedJourney).data.journeys.map(item => item.id), ["local"]);
assert.equal(adopted.preferences.updatedAt, clearedJourney.preferences.updatedAt);

const journeyStorage = createJourneyStorage({ storage: new MemoryStorage(), prefix: "progress-journey" });
assert.deepEqual(journeyStorage.storedFields("world-one"), { preferences: false, data: false });
journeyStorage.replace("world-one", mergedJourney);
assert.deepEqual(journeyStorage.read("world-one").data.journeys, mergedJourney.data.journeys);
assert.deepEqual(journeyStorage.storedFields("world-one"), { preferences: true, data: true });
class FailingStorage extends MemoryStorage {
  fail = false;
  setItem(key, value) {
    if (this.fail && key.includes(":preferences:")) {
      this.fail = false;
      throw new Error("storage write failed");
    }
    super.setItem(key, value);
  }
}
const failingStorage = new FailingStorage();
const rollbackJourneyStorage = createJourneyStorage({ storage: failingStorage, prefix: "rollback-journey" });
rollbackJourneyStorage.replace("world-one", localJourney);
failingStorage.fail = true;
assert.throws(() => rollbackJourneyStorage.replace("world-one", mergedJourney), /storage write failed/);
assert.deepEqual(rollbackJourneyStorage.read("world-one").data.journeys, localJourney.data.journeys);

const parsed = parsePlayerProgress({ ...merged, worlds: [
  { ...merged.worlds[0], association: { kind: "server", identity: "secret", confirmedAt: 1 },
    personal: { ...merged.worlds[0].personal, views: { leaked: true } } },
  { id: "invalid" },
] });
assert.equal(parsed.worlds.length, 1);
assert.equal("association" in parsed.worlds[0], false);
assert.equal("views" in parsed.worlds[0].personal, false);

const storage = new MemoryStorage();
replaceSavedMapProgress(local.map, storage);
assert.deepEqual(readSavedMapProgress(storage), local.map);
clearSavedMapProgress(storage);
assert.deepEqual(readSavedMapProgress(storage), {
  favoriteIds: [], completedIds: [], markers: [], notes: {},
});

const repository = createWorldRepository({
  name: "player-progress-test",
  factory: new IDBFactory(),
  now: () => 100,
  newId: () => "world-one",
});
const localWorld = world("local", { surface: {
  mode: "2d", camera2d: null, camera3d: null, visibleCategories: null,
  structureFilterRevision: 0, expandedGroup: null, filterSearch: "", hideFound: false,
  favoritesOnly: false, hiddenPinGroups: [],
} });
await repository.create({ name: localWorld.name, edition: localWorld.edition, generation: localWorld.generation });
await repository.setAssociation(localWorld.id, localWorld.association);
await repository.updatePersonal(localWorld.id, () => localWorld.personal);
await repository.replaceAccountWorlds([fromAccountWorld(remote.worlds[0])]);
const replaced = await repository.get("world-one");
assert.equal(replaced.name, "World remote");
assert.equal(replaced.association.identity, "folder-local");
assert.ok(replaced.personal.views.surface);
await repository.clearAccountWorlds();
assert.equal((await repository.snapshot()).worlds.length, 0);
assert.equal((await repository.snapshot()).selection.worldId, null);
repository.close();

console.log("Player progress sync tests passed.");
