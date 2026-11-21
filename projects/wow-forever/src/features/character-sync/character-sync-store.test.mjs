import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("character-sync-store.ts", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent" });
const { getCharacterSyncState, CHARACTER_SYNC_KEY } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("GEP state reaches other windows without being reset to offline", t => {
  const priorStorage = globalThis.localStorage;
  const source = JSON.stringify({ version: 1, phase: "synced", liveConnected: true, characters: { saved: { id: "saved", source: "gep", name: "Character", professions: [
    { id: "alchemy", type: "primary", skill: null }, { id: "cooking", type: "secondary" }, { id: "unknown", type: null },
  ] } } });
  let writes = 0;
  globalThis.localStorage = { getItem: key => { assert.equal(key, CHARACTER_SYNC_KEY); return source; }, setItem: () => writes++ };
  t.after(() => { globalThis.localStorage = priorStorage; });
  const state = getCharacterSyncState();
  assert.deepEqual(state.characters.saved.professions.map(p => p.type), ["primary", "secondary", null]);
  assert.equal(state.characters.saved.professions[0].skill, null);
  assert.equal(getCharacterSyncState(), state);
  for (const field of ["addonVersion", "persistence", "scanning", "gameFound"]) assert.equal(field in state, false);
  assert.equal(state.phase, "synced");
  assert.equal(state.liveConnected, true);
  assert.equal(CHARACTER_SYNC_KEY, "wfm:character-sync:v1", "existing saved characters remain available");
  assert.equal(writes, 0);
});
