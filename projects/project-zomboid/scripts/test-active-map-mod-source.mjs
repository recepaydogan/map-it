import assert from "node:assert/strict";
import { resolveActiveMapModSource } from "../src/features/map/active-map-mod-source.ts";

const defaultSource = { modIds: ["EveryEnabledMod"] };
const lastGameSession = {
  modIds: ["CurrentSaveMod"],
  mapFolders: ["Current Save Map", "Muldraugh, KY"],
};

assert.deepEqual(resolveActiveMapModSource(defaultSource, lastGameSession), {
  modIds: lastGameSession.modIds,
  mapFolders: lastGameSession.mapFolders,
  fromLiveSession: true,
});
assert.deepEqual(resolveActiveMapModSource(defaultSource, null), {
  modIds: defaultSource.modIds,
  mapFolders: [],
  fromLiveSession: false,
});

console.log("Active map mod source tests passed.");
