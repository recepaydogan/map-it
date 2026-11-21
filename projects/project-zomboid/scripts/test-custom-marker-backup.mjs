import assert from "node:assert/strict";
import { mergeSavedMapBackup, serializeSavedMapBackup } from "../src/features/map/saved-map-backup.ts";
import { USER_MARKER_GROUP_IDS } from "../src/features/map/types.ts";
import { migrateSavedMapStorage } from "../src/features/map/saved-map-storage.ts";

const empty = { markers: [], notes: {}, favoriteIds: [], lootedLocationIds: [], routes: [], lootRuns: [] };
const marker = {
  id: "custom-test", name: "Safehouse", category: "custom", subtype: "custom",
  label: "Personal", townId: "personal", town: "Personal", x: 12000, y: 9000,
  floors: [2], color: "blue", icon: "home", imageCategory: "medical",
  group: "safehouses", mapId: "builtin:knox-country",
};
const state = { ...empty, markers: [marker], notes: { [marker.id]: "Supplies upstairs" } };
const backup = serializeSavedMapBackup(state);
const restored = mergeSavedMapBackup(backup, empty);
assert.deepEqual(restored.state, state, "Marker appearance, floor, map and notes survive a backup round trip.");
assert.equal(mergeSavedMapBackup(backup, state).result.markerCount, 0, "Importing twice must not duplicate markers.");
const legacy = { ...marker };
delete legacy.imageCategory;
assert.deepEqual(mergeSavedMapBackup(serializeSavedMapBackup({ ...empty, markers: [legacy] }), empty).state.markers, [legacy]);
assert.throws(() => mergeSavedMapBackup(serializeSavedMapBackup({ ...state, markers: [{ ...marker, imageCategory: {} }] }), empty));
for (const group of USER_MARKER_GROUP_IDS) {
  const groupedMarker = { ...marker, group };
  const groupedState = { ...empty, markers: [groupedMarker] };
  assert.deepEqual(mergeSavedMapBackup(serializeSavedMapBackup(groupedState), empty).state.markers, [groupedMarker]);
  const values = new Map([["pzim:user-markers", JSON.stringify([groupedMarker])]]);
  migrateSavedMapStorage({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  assert.equal(JSON.parse(values.get("pzim:user-markers"))[0].group, group, "Storage migration must preserve every supported marker group.");
}
console.log("Custom marker backup tests passed.");
