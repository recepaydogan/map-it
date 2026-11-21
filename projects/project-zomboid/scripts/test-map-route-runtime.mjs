import assert from "node:assert/strict";
import { formatRouteDistance, getRouteDistance, getRouteLegDistances } from "../src/features/map/map-route-utils.ts";
import {
  mergeSavedMapBackup,
  SAVED_MAP_BACKUP_VERSION,
  serializeSavedMapBackup,
} from "../src/features/map/saved-map-backup.ts";

const route = {
  id: "route-1",
  mapId: "builtin:knox-country",
  name: "Safehouse run",
  points: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 3, y: 4, label: "Stop" },
    { id: "c", x: 9, y: 12 },
  ],
  updatedAt: "2026-08-10T10:00:00.000Z",
};

assert.deepEqual(getRouteLegDistances(route.points), [5, 10]);
assert.equal(getRouteDistance(route.points), 15);
assert.equal(formatRouteDistance(450, "metric", "en-US"), "~450 m");
assert.equal(formatRouteDistance(2450, "metric", "en-US"), "~2.5 km");
assert.equal(formatRouteDistance(1609.344, "imperial", "en-US"), "~1 mi");
assert.equal(formatRouteDistance(2450.4, "tiles", "en-US"), "2,450 tiles");

const emptyState = {
  favoriteIds: [],
  markers: [],
  notes: {},
  routes: [],
  lootRuns: [],
  lootedLocationIds: [],
};
const serialized = serializeSavedMapBackup({ ...emptyState, routes: [route] });
assert.equal(JSON.parse(serialized).schemaVersion, SAVED_MAP_BACKUP_VERSION);
const imported = mergeSavedMapBackup(serialized, emptyState);
assert.deepEqual(imported.state.routes, [route]);
assert.equal(imported.result.routeCount, 1);

const sameMap = mergeSavedMapBackup(serialized, { ...emptyState, routes: [{ ...route, id: "existing" }] });
assert.deepEqual(sameMap.state.routes.map(({ id }) => id), ["existing", "route-1"]);
assert.equal(sameMap.result.routeCount, 1);

const preserved = mergeSavedMapBackup(serialized, { ...emptyState, routes: [route] });
assert.deepEqual(preserved.state.routes, [route]);
assert.equal(preserved.result.routeCount, 0);

const legacyBackup = JSON.stringify({
  schemaVersion: 1,
  app: "project-zomboid-interactive-map",
  exportedAt: "2026-01-01T00:00:00.000Z",
  favoriteIds: [],
  markers: [],
  notes: {},
});
assert.deepEqual(mergeSavedMapBackup(legacyBackup, emptyState).state.routes, []);
assert.deepEqual(mergeSavedMapBackup(legacyBackup, emptyState).state.lootRuns, []);

console.log("Persistent route distance, backup and legacy-import tests passed.");
