import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Keep the parser, file scan, merge, persistent stores and dropdown import real.
// Only the Overwolf environment and unrelated window/telemetry effects are simulated.
const mocks = {
  "../live-position/position-addon-installer": `
    export const findPositionClientDirectory = async () => "D:\\\\WoW\\\\_forever_";
    export const readInstalledPositionAddonVersion = async () => "0.1.5";
    export const ensurePositionAddonInstalled = async () => { throw Error("Unexpected installation"); };
  `,
  "../../overwolf-utils/window-manager": `
    export const OVERLAY_MAP_WINDOW = "overlay_map";
    export const hideWindow = async () => {};
    export const expandMinimap = async () => {};
  `,
  "./live-position-store": "export const clearLivePosition = () => {}; export const publishLivePosition = () => {};",
  "./tracking-status": "export const setTrackingStatus = () => {};",
  "../../services/analytics/analytics": "export const track = () => {};",
  "../settings/launch-preferences": "export const getLaunchPreferences = () => ({autoOpenMinimap:false});",
};
const bundle = await build({
  stdin: {
    contents: `
      export { startCharacterSync } from "./character-sync-service";
      export { getCharacterSyncState } from "./character-sync-store";
      export { createGepDataSource } from "../live-position/gep-data-source";
    `,
    resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    loader: "ts",
  },
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{
    name: "overwolf-environment",
    setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    },
  }],
});
const { startCharacterSync, getCharacterSyncState, createGepDataSource } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const selectedKey = "gm:map-selected-character:v1";
const profilesKey = "gm:map-characters:v1";
const lua = value => value === null ? "nil" : typeof value !== "object" ? JSON.stringify(value)
  : `{${Object.entries(value).map(([key, entry]) => `[${JSON.stringify(key)}]=${lua(entry)}`).join(",")}}`;
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

function character(guid, name, stamp, variant = 0) {
  return {
    guid, name, realm: variant ? "Second Realm" : "First Realm", region: 3,
    classId: variant ? 9 : 3, raceId: variant ? 2 : 4, faction: variant ? "Horde" : "Alliance",
    level: variant ? 1 : 12, updatedAt: stamp, xp: variant ? 0 : 30, xpMax: variant ? 400 : 1000,
    money: variant ? 0 : 12345,
    professions: { entries: { 1: { skillLineId: variant ? 164 : 171, skill: variant ? 5 : 25, maxSkill: 75 } } },
    recipes: { 1: { skillLineId: variant ? 164 : 171, capturedAt: stamp, learned: { [variant ? 222 : 123]: true } } },
    bags: { capturedAt: stamp, counts: { [variant ? 2589 : 765]: variant ? 9 : 3 } },
    bank: { capturedAt: stamp, counts: { [variant ? 2770 : 2447]: variant ? 7 : 2 } },
    completedQuests: { capturedAt: stamp, ids: { [variant ? 7 : 6]: true } },
    quests: { capturedAt: stamp, active: { [variant ? 457 : 456]: {
      id: variant ? 457 : 456, title: variant ? "Second quest" : "First quest",
      objectives: { 1: { text: "Collect items", have: variant ? 4 : 1, need: 10 } },
    } } },
  };
}

function harness(t) {
  const storage = new Map();
  const timers = new Map();
  const files = new Map();
  let clock = Date.now();
  let serial = 0;
  t.mock.method(Date, "now", () => clock);
  const previous = Object.fromEntries(["localStorage", "window", "overwolf", "StorageEvent"].map(key => [key, globalThis[key]]));
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  globalThis.StorageEvent = class extends Event {};
  globalThis.window = Object.assign(new EventTarget(), {
    setInterval: (fn, ms) => { timers.set(++serial, { fn, ms }); return serial; },
    clearInterval: id => timers.delete(id),
  });
  globalThis.overwolf = { io: {
    dir: (_path, done) => done({ success: true, data: [...files.keys()].map(name => ({ name, type: "dir" })) }),
    readTextFile: (path, _options, done) => {
      const account = /Account\\([^\\]+)\\SavedVariables/.exec(path)?.[1];
      done({ success: true, content: files.get(account) });
    },
  } };
  let stop;
  t.after(() => {
    stop?.();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return {
    storage, files,
    stamp: () => Math.floor(clock / 1000),
    advance: () => { clock += 10_000; },
    save(current, characters, account = "ACCOUNT", savedAt = Math.floor(clock / 1000)) {
      files.set(account, `WFM_CharacterDB = ${lua({ schemaVersion: 1, current: current.guid, savedAt,
        characters: Object.fromEntries(characters.map(entry => [entry.guid, entry])) })}`);
    },
    async start() { stop = startCharacterSync(); await flush(); },
    async poll() { [...timers.values()].find(timer => timer.ms === 5000).fn(); await flush(); },
  };
}

function assertSelected(h, expected, variant) {
  const state = getCharacterSyncState();
  const id = `addon:3:${expected.guid}`;
  assert.equal(h.storage.get(selectedKey), id, "dropdown follows the reloaded character");
  assert.equal(state.currentId, id);
  assert.equal(state.savedCurrentId, id);
  const actual = state.characters[id];
  const profile = JSON.parse(h.storage.get(profilesKey)).find(entry => entry.id === id);
  assert.equal(profile.name, expected.name);
  assert.equal(profile.level, expected.level);
  assert.equal(profile.classId, variant ? "warlock" : "hunter");
  assert.equal(profile.faction, variant ? "horde" : "alliance");
  assert.equal(actual.realm, expected.realm);
  assert.deepEqual(actual.bags.counts, expected.bags.counts);
  assert.deepEqual(actual.bank.counts, expected.bank.counts);
  assert.deepEqual(actual.completedQuests.ids, variant ? ["7"] : ["6"]);
  assert.equal(actual.quests.active[0].id, variant ? "457" : "456");
  assert.equal(actual.quests.active[0].objectives[0].have, variant ? 4 : 1);
  assert.equal(actual.professions[0].id, variant ? "blacksmithing" : "alchemy");
  assert.equal(actual.professions[0].skill, variant ? 5 : 25);
  assert.deepEqual(actual.professions[0].learned, [variant ? "222" : "123"]);
  return actual;
}

test("reload switches A to B and back, keeping all saved domains and subsequent nameless GEP updates isolated", async t => {
  const h = harness(t);
  const first = character("Player-1-A", "First", h.stamp());
  h.save(first, [first]);
  await h.start();
  const source = createGepDataSource();
  source.game(true);
  source.info({ player_info: { player_exp: "30" } });
  assertSelected(h, first, 0);

  h.advance();
  const second = character("Player-1-B", "Second", h.stamp(), 1);
  source.info({ player_info: { player_level: "1", player_exp: "0" } });
  h.save(second, [first, second]);
  await h.poll();
  assertSelected(h, second, 1);
  assert.equal(getCharacterSyncState().characters["addon:3:Player-1-A"].level, first.level,
    "the saved old character must recover from an unidentified update before reload");
  assert.equal(getCharacterSyncState().characters["addon:3:Player-1-A"].experience, first.xp);
  assert.equal(getCharacterSyncState().characters["addon:3:Player-1-A"].gold, 1);
  assert.equal(getCharacterSyncState().characters["addon:3:Player-1-A"].silver, 23);
  assert.equal(getCharacterSyncState().characters["addon:3:Player-1-A"].copper, 45);
  const firstBefore = structuredClone(getCharacterSyncState().characters["addon:3:Player-1-A"]);
  source.registration(true);
  source.info({ player_info: { player_exp: "52", player_level: "1" } });
  source.error();
  assertSelected(h, second, 1);
  assert.equal(getCharacterSyncState().characters["addon:3:Player-1-B"].experience, 52);
  assert.deepEqual(getCharacterSyncState().characters[firstBefore.id], firstBefore);

  h.advance();
  const returned = { ...first, updatedAt: h.stamp() };
  h.save(returned, [returned, second]);
  await h.poll();
  assertSelected(h, returned, 0);
  const secondBefore = structuredClone(getCharacterSyncState().characters["addon:3:Player-1-B"]);
  source.info({ player_info: { player_exp: "75" } });
  await h.poll();
  assertSelected(h, returned, 0);
  assert.deepEqual(getCharacterSyncState().characters[secondBefore.id], secondBefore);
});

test("equal character names on different realms remain separate across reloads", async t => {
  const h = harness(t);
  const first = character("Player-1-A", "Same", h.stamp());
  h.save(first, [first]);
  await h.start();
  const source = createGepDataSource();
  source.game(true);
  h.advance();
  const second = character("Player-2-B", "Same", h.stamp(), 1);
  h.save(second, [first, second]);
  await h.poll();
  source.info({ player_info: { player_exp: "18" } });
  assertSelected(h, second, 1);
  assert.equal(Object.keys(getCharacterSyncState().characters).length, 2);
});

test("reloading the same played character restores its dropdown selection once per saved snapshot", async t => {
  const h = harness(t);
  const played = character("Player-1-A", "New", h.stamp());
  const other = character("Player-1-B", "Kimyon", h.stamp(), 1);
  h.save(played, [played, other]);
  await h.start();
  assertSelected(h, played, 0);

  h.storage.set(selectedKey, "addon:3:Player-1-B");
  await h.poll();
  assert.equal(h.storage.get(selectedKey), "addon:3:Player-1-B");

  h.advance();
  h.save(played, [played, other]);
  await h.poll();
  assertSelected(h, played, 0);

  h.storage.set(selectedKey, "addon:3:Player-1-B");
  await h.poll();
  h.save(other, [other], "OLD_ACCOUNT", other.updatedAt);
  await h.poll();
  assert.equal(h.storage.get(selectedKey), "addon:3:Player-1-B");
  assert.equal(getCharacterSyncState().currentId, "addon:3:Player-1-A");
});

test("a partially written reload is retried and an older account file cannot undo the later switch", async t => {
  const h = harness(t);
  const first = character("Player-1-A", "First", h.stamp());
  h.save(first, [first]);
  await h.start();
  const source = createGepDataSource();
  source.game(true);
  h.files.set("ACCOUNT", "WFM_CharacterDB = {");
  await h.poll();
  assertSelected(h, first, 0);

  h.advance();
  const second = character("Player-1-B", "Second", h.stamp(), 1);
  h.save(second, [first, second]);
  await h.poll();
  assertSelected(h, second, 1);
  h.save(first, [first], "OLD_ACCOUNT", first.updatedAt);
  await h.poll();
  assertSelected(h, second, 1);
});
