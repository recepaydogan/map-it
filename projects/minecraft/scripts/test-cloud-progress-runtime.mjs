import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as progress from "../src/services/sync/player-progress.ts";
import * as journey from "../src/services/sync/journey-progress.ts";

// Exercise the real coordinator with isolated account/network/storage boundaries.
// Compile only the module syntax; no implementation statements are replaced.
const source = await readFile(new URL("../src/services/sync/cloud-progress-sync.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022 } }).outputText;
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
const harness = async () => {
  let now = 0, nextId = 0, accountListener;
  const jobs = new Map(), window = new EventTarget(), storage = new Map(), warnings = [];
  const state = { local: structuredClone(progress.EMPTY_PLAYER_PROGRESS), cloud: null, pushes: 0, pulls: 0,
    fail: false, cleared: [], deferPush: null };
  const schedule = (callback, delay = 0) => { const id = ++nextId; jobs.set(id, { at: now + delay, callback }); return id; };
  const mocks = {
    "../../game-config": { GAME_JOURNEY: { storagePrefix: "journey" }, WORLD_LIBRARY_CONFIG: { changePulseKey: "world-pulse" } },
    "../../data/supabase-client": { getSupabaseClient: () => ({ auth: {
      onAuthStateChange: listener => { accountListener = listener; },
      getSession: async () => ({ data: { session: { user: { id: "account-a" } } } }),
    } }) },
    "../../features/map/saved-map-storage": { COMPLETED_LOCATIONS_STORAGE_KEY: "completed", FAVORITES_STORAGE_KEY: "favorites",
      MARKERS_STORAGE_KEY: "markers", NOTES_STORAGE_KEY: "notes", SAVED_MAP_CHANGE_EVENT: "map-change" },
    "../../features/worlds/use-world-library": { WORLD_LIBRARY_CHANGE_EVENT: "world-change" },
    "../../features/journey/journey-storage": { JOURNEY_CHANGE_EVENT: "journey-change",
      getBrowserJourneyStorage: () => ({ storedFields: () => ({ preferences: false, data: false }) }) },
    "./player-progress": progress,
    "./player-progress-storage": {
      readLocalPlayerProgress: async () => structuredClone(state.local),
      replaceLocalPlayerProgress: async value => { state.local = structuredClone(value); },
      clearLocalPlayerProgress: async userId => { state.cleared.push({ userId, progress: structuredClone(state.local) }); state.local = structuredClone(progress.EMPTY_PLAYER_PROGRESS); },
    },
    "./player-progress-service": {
      isProgressSyncAvailable: () => true,
      pullPlayerProgress: async () => { state.pulls++; return state.fail ? { ok: false, error: "offline" } : { ok: true, value: structuredClone(state.cloud) }; },
      pushPlayerProgress: async (_revision, value) => {
        state.pushes++;
        if (state.deferPush) await state.deferPush;
        if (state.fail) return { ok: false, error: "offline" };
        state.cloud = { rev: (state.cloud?.rev ?? 0) + 1, progress: structuredClone(value) };
        return { ok: true, value: structuredClone(state.cloud) };
      },
    },
    "./journey-progress": journey,
    "./journey-progress-service": { pullJourneyProgress: async () => ({ ok: true, value: [] }), pushJourneyProgress: () => assert.fail("Unexpected journey upload") },
  };
  const module = { exports: {} };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  new Function("require", "module", "exports", "window", "localStorage", "setTimeout", "clearTimeout", "console", compiled)(
    key => { assert.ok(key in mocks, `Unmocked boundary: ${key}`); return mocks[key]; }, module, module.exports,
    window, localStorage, schedule, id => jobs.delete(id), { warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args) });
  const api = module.exports;
  const advance = async ms => {
    const target = now + ms;
    for (let limit = 0; limit < 1000; limit++) {
      const next = [...jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) { now = target; await settle(); return; }
      jobs.delete(next[0]); now = next[1].at; next[1].callback(); await settle();
    }
    throw new Error("Unbounded coordinator work");
  };
  api.startCloudProgressSync(); await settle();
  return { state, api, advance, storage, warnings, window,
    account: userId => accountListener("CHANGE", userId ? { user: { id: userId } } : null),
    change: () => window.dispatchEvent(new Event("world-change")),
  };
};
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };

await check("continuous device-only writes cannot starve a pending pin/note upload", async () => {
  const h = await harness(); const before = h.state.pushes;
  h.state.local.map.notes.base = "Saved base";
  for (let i = 0; i < 6; i++) { h.change(); await h.advance(500); }
  assert.equal(h.state.cloud.progress.map.notes.base, "Saved base");
  assert.equal(h.state.pushes, before + 1);
  for (let i = 0; i < 12; i++) { h.change(); await h.advance(500); }
  assert.equal(h.state.pushes, before + 1, "Unchanged cloud data must not be uploaded for camera/resume writes");
});
await check("offline saves remain local and retry automatically on recovery", async () => {
  const h = await harness(); h.state.fail = true; h.state.local.map.notes.base = "Offline base";
  h.change(); await h.advance(2500);
  assert.equal(h.state.local.map.notes.base, "Offline base");
  assert.equal(h.state.cloud.progress.map.notes.base, undefined);
  assert.ok(h.warnings.length > 0);
  h.state.fail = false; await h.advance(30000);
  assert.equal(h.state.cloud.progress.map.notes.base, "Offline base");
});
await check("sign-out flush includes pending edits and failed flush leaves local data intact", async () => {
  const h = await harness(); h.state.local.map.notes.base = "Latest base"; h.change();
  assert.equal(await h.api.flushCloudProgressSync("account-a"), true);
  assert.equal(h.state.cloud.progress.map.notes.base, "Latest base");
  h.state.fail = true; h.state.local.map.notes.base = "Unsynced edit"; h.change();
  assert.equal(await h.api.flushCloudProgressSync("account-a"), false);
  assert.equal(h.state.local.map.notes.base, "Unsynced edit"); assert.equal(h.state.cleared.length, 0);
});
await check("sign-out passes the owning account to cleanup and a late upload cannot restore signed-out data", async () => {
  const h = await harness(); let release;
  h.state.deferPush = new Promise(resolve => { release = resolve; });
  h.state.local.map.notes.base = "In-flight base"; h.change(); await h.advance(2500);
  h.account(null); await h.advance(0);
  assert.equal(h.state.cleared[0].userId, "account-a");
  assert.deepEqual(h.state.local, progress.EMPTY_PLAYER_PROGRESS);
  release(); await settle();
  assert.deepEqual(h.state.local, progress.EMPTY_PLAYER_PROGRESS);
  assert.equal(h.storage.has("gm:player-progress-sync"), false);
});

console.log(`${checks} cloud coordinator runtime checks passed (mock network, no account access).`);
