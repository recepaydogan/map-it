import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

async function load(entry, mocks = {}) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true,
    write: false, format: "esm", platform: "node", plugins: [{ name: "gep-mocks", setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const { mergeSavedCharacterBatch } = await load("../character-sync/saved-character-merge.ts");
const { mergeGepCharacter } = await load("../character-sync/gep-character.ts");
const { projectGepPosition } = await load("./gep-position.ts");
const { projectPlayerPosition } = await load("./position-projection.ts");
const { createOcrPositionTracker } = await load("./ocr-position-tracker.ts", {
  "./ocr-game-capture": "export const createOcrGameCapture = () => ({ next: async () => globalThis.__ocr.frame, close() {} });",
  "./ocr-engine": `
    export const createOcrFrameReader = () => ({ prepare: frame => frame,
      recognize: async (_worker, frame) => frame.sample });
    export const loadPositionOcr = async () => ({ terminate() {} });`,
  "./live-position-store": `
    export const LIVE_POSITION_FRESH_MS = 2500;
    export const readLivePosition = () => globalThis.__ocr.point;
    export const clearLivePosition = () => { globalThis.__ocr.point = null; };
    export const publishLivePosition = point => { globalThis.__ocr.point = point; };`,
  "./tracking-status": "export const setTrackingStatus = status => { globalThis.__ocr.status = status; };",
});
const { createGepDataSource } = await load("./gep-data-source.ts", {
  "../character-sync/character-sync-store": "export const getCharacterSyncState = () => globalThis.__gep.state ?? { characters: {}, currentId: null }; export const writeCharacterSyncState = s => globalThis.__gep.state = s;",
  "../map/map-character-profiles": "export const importAddonCharacters = p => globalThis.__gep.profiles = p;",
  "../../overwolf-utils/window-manager": `export const OVERLAY_MAP_WINDOW = 'overlay_map';
    export const hideWindow = async () => { globalThis.__gep.hides++; };`,
  "./live-position-store": `export const clearLivePosition = () => { globalThis.__gep.position = null; };
    export const publishLivePosition = p => { globalThis.__gep.position = p; };`,
  "./tracking-status": "export const setTrackingStatus = s => { globalThis.__gep.status = s; };",
  "../../services/analytics/analytics": "export const track = (name, props) => { (globalThis.__gep.analytics ??= []).push({ name, props }); };",
});

test("OCR waits for a readable panel and publishes only a projectable coordinate", async t => {
  const timers = new Map();
  const state = globalThis.__ocr = { frame: null, point: null };
  globalThis.window = {
    setTimeout(fn, delay) { timers.set(fn, delay); return fn; },
    clearTimeout(fn) { timers.delete(fn); },
  };
  globalThis.overwolf = { games: { getRunningGameInfo: done => done({ isRunning: true, classId: 28268 }) } };
  const tracker = createOcrPositionTracker();
  t.after(() => {
    tracker.game(false);
    delete globalThis.window;
    delete globalThis.overwolf;
    delete globalThis.__ocr;
  });
  const nextFrame = async sample => {
    state.frame = { sample };
    assert.equal(timers.size, 1);
    const [scan] = timers.keys();
    timers.delete(scan);
    scan();
    await new Promise(resolve => setImmediate(resolve));
  };
  tracker.game(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.point, null);
  assert.equal(tracker.isLive(), false);
  const sample = { x: 50, y: 50, map: 1429, facing: null, heartbeat: 1 };
  await nextFrame(null);
  assert.equal(state.point, null);
  await nextFrame({ ...sample, map: 99999 });
  assert.equal(state.point, null);
  await nextFrame(sample);
  assert.equal(state.point.source, "ocr");
  assert.equal(state.point.x, projectGepPosition(sample).x);
  assert.equal(state.status, "live");
  assert.equal(tracker.isLive(), true);
});

test("observed basic player data works without inventing identity, race, faction or inventory", () => {
  const c = mergeGepCharacter(null, { player_level: "2", player_exp: "629", player_exp_max: "900", player_money_copper: "35" }, "gep:session", 10);
  assert.equal(c.level, 2); assert.equal(c.experience, 629); assert.equal(c.maxExperience, 900); assert.equal(c.copper, 35);
  assert.equal(c.name, ""); assert.equal(c.classId, ""); assert.equal(c.faction, null); assert.equal(c.bags, null);
  assert.equal(c.professionsKnown, undefined);
});
test("merges documented profession JSON and resets missing fields on character switches", () => {
  const first = mergeGepCharacter(null, { character_name: "First", player_level: "10", player_class: "8",
    player_professions: JSON.stringify([{ name: "Cooking", skill_line: 185, type: "secondary" }]) }, "gep:s", 10);
  assert.equal(first.classId, "mage"); assert.equal(first.professions[0].type, "secondary");
  assert.equal(first.professions[0].skill, null); assert.equal(first.professions[0].complete, false);
  const delta = mergeGepCharacter(first, { player_exp: "12" }, "gep:s", 11);
  assert.equal(delta.name, "First"); assert.equal(delta.professions.length, 1);
  const second = mergeGepCharacter(delta, { character_name: "Second" }, "gep:s", 12);
  assert.notEqual(second.id, first.id); assert.equal(second.level, null); assert.equal(second.classId, "");
  assert.equal(second.professions.length, 0); assert.equal(second.experience, undefined);
  assert.equal(mergeGepCharacter(second, { player_level: "bad" }, "gep:s", 13), second);
});
test("GEP UI-map percentages use the correct world-to-atlas projection", () => {
  const actual = projectGepPosition('{"x":50,"y":50,"map":1429}');
  const expected = projectPlayerPosition(0, (-10254.166015625 - 7939.5830078125) / 2,
    (-1935.4166259765625 + 1535.4166259765625) / 2);
  assert.deepEqual(actual, expected);
  for (const value of [{ main_zone: 12, sub_zone: 9 }, { x: 50, y: 50, map: 999999 },
    { x: -20, y: 5, map: 1429 }, { x: 50, y: NaN, map: 1429 }, { x: "50", y: 50, map: 1429 }, "bad"])
    assert.equal(projectGepPosition(value), null);
});
test("only usable coordinates publish a GEP sample and exit rejects late data", () => {
  globalThis.__gep = { hides: 0 };
  const source = createGepDataSource();
  source.game(true); source.registration(true);
  source.info({ player_info: { player_level: "2" }, location: { zone: '{"main_zone":12,"sub_zone":9}' } });
  assert.equal(__gep.state.characters[__gep.state.currentId].level, 2);
  assert.equal(__gep.position, null);
  assert.equal(__gep.analytics, undefined);
  const event = [{ name: "location", data: '{"x":50,"y":50,"map":1429}' }];
  source.events(event); assert.equal(__gep.position.source, "gep"); assert.equal(__gep.status, "live");
  source.events(event);
  assert.deepEqual(__gep.analytics, [{ name: "location received by gep", props: { source: "gep" } }]);
  source.events([{ name: "location", data: '{"x":50,"y":50,"map":99999}' }]);
  assert.equal(__gep.position, null); assert.equal(__gep.status, "unavailable-map");
  source.events(event);
  assert.equal(__gep.analytics.length, 1, "recovery must not report the same game session twice");
  source.game(false); source.events(event); source.info({ player_info: { player_level: "3" } });
  assert.equal(__gep.hides, 1); assert.ok(__gep.state.currentId); assert.equal(__gep.state.liveConnected, false);
  assert.equal(__gep.state.characters[__gep.state.currentId].level, 2);
  assert.equal(__gep.analytics.length, 1, "late events after game exit must not be reported");
  source.game(true); source.events(event);
  assert.equal(__gep.analytics.length, 2, "a new game session reports its first valid position");
});


test("GEP deltas preserve reload-saved inventory and still update live XP", () => {
  globalThis.__gep = { opens: 0, hides: 0 };
  const source = createGepDataSource();
  source.game(true);
  source.info({player_info:{character_name:"Hunter",player_level:"2",player_exp:"10"}});
  const id=__gep.state.currentId;
  const saved={...__gep.state.characters[id],savedAt:Date.now()-1000,bags:{capturedAt:1,counts:{765:7}},quests:{capturedAt:1,active:[]}};
  __gep.state.characters[id]=saved;
  source.info({player_info:{player_exp:"25"}});
  assert.equal(__gep.state.characters[id].experience,25);
  assert.equal(__gep.state.characters[id].bags.counts[765],7);
  assert.equal(__gep.state.characters[id].savedAt,saved.savedAt);
  source.info({player_info:{player_exp:"30"}});
  assert.equal(__gep.state.characters[id].experience,30);
  assert.equal(__gep.state.characters[id].bags.counts[765],7);
  delete globalThis.__gep;
});


test("nameless GEP deltas never recreate the placeholder after a reload identifies the character",()=>{
  globalThis.__gep={opens:0,hides:0};const source=createGepDataSource();
  source.game(true);source.info({player_info:{player_level:"1",player_exp:"0"}});
  const anonymous=__gep.state.currentId;
  const stamp=Math.floor(Date.now()/1000);
  const character={id:"addon:3:Player-2-B",guid:"Player-2-B",name:"Kekiko",realm:"Realm",source:"addon",classId:"warlock",raceId:"orc",faction:"horde",level:1,
    updatedAt:stamp,savedAt:stamp,professions:[],bags:null,bank:null,quests:{capturedAt:stamp,active:[]}};
  __gep.state=mergeSavedCharacterBatch(__gep.state,[character],character.id,Date.now());
  source.info({player_info:{player_exp:"10"}});
  assert.equal(__gep.state.currentId,character.id);assert.equal(__gep.state.characters[anonymous],undefined);
  assert.equal(__gep.state.characters[character.id].name,"Kekiko");assert.equal(__gep.state.characters[character.id].experience,10);
  assert.ok(__gep.state.characters[character.id].updatedAt<1e12,"character clocks use Unix seconds");
  source.info({player_info:{player_exp:"20"}});
  assert.equal(__gep.state.currentId,character.id);assert.equal(__gep.state.savedCurrentId,character.id);
  assert.deepEqual(Object.keys(__gep.state.characters),[character.id]);delete globalThis.__gep;
});

test("a nameless GEP update after a same-process character switch uses the new saved character", () => {
  globalThis.__gep = { opens: 0, hides: 0 };
  try {
    const source = createGepDataSource();
    const now = Date.now();
    const stamp = Math.floor(now / 1000);
    const first = { id: "addon:first", guid: "Player-1-A", name: "Kekiko", realm: "Realm", source: "addon",
      updatedAt: stamp - 20, savedAt: stamp - 20, level: 2, professions: [], bags: null, bank: null };
    const second = { ...first, id: "addon:second", guid: "Player-1-B", name: "New", updatedAt: stamp, savedAt: stamp, level: 1 };
    __gep.state = { characters: { [first.id]: first }, currentId: first.id, savedCurrentId: first.id, savedCurrentAt: now - 10_000 };
    source.game(true);
    source.info({ player_info: { player_exp: "30" } });

    __gep.state = mergeSavedCharacterBatch(__gep.state, [second], second.id, now);
    source.registration(true);
    source.info({ player_info: { player_exp: "52" } });
    assert.equal(__gep.state.currentId, second.id);
    assert.equal(__gep.state.characters[first.id].experience, 30);
    assert.equal(__gep.state.characters[second.id].experience, 52);

    __gep.state.currentId = first.id; // Cache from a version that let a stale GEP update take over.
    createGepDataSource().game(true);
    assert.equal(__gep.state.currentId, second.id);
  } finally { delete globalThis.__gep; }
});


test("missing, rejected or failed tracking never hides the manually opened minimap; game exit does", () => {
  globalThis.__gep = { opens: 0, hides: 0 };
  try {
    const source = createGepDataSource();
    source.game(true);
    source.registration(false);
    assert.equal(__gep.hides, 0);
    source.registration(true);
    source.info({ player_info: { character_name: "First", player_level: "2" } });
    source.info({ player_info: { character_name: "Second", player_level: "3" } });
    source.events([{ name: "location", data: '{"x":50,"y":50,"map":99999}' }]);
    assert.equal(__gep.position, null);
    assert.equal(__gep.status, "unavailable-map");
    source.error();
    assert.equal(__gep.status, "error");
    assert.equal(__gep.hides, 0);
    source.game(false);
    assert.equal(__gep.hides, 1);
  } finally { delete globalThis.__gep; }
});


test("valid GEP coordinates take over an OCR position and zone-only data leaves it intact", () => {
  globalThis.__gep = { hides: 0 };
  try {
    const source = createGepDataSource(undefined, () => __gep.position?.source === "ocr");
    source.game(true);
    const ocr = { source: "ocr", x: 1, y: 1 };
    __gep.position = ocr;
    source.events([{ name: "location", data: '{"main_zone":12,"sub_zone":9}' }]);
    assert.equal(__gep.position, ocr);
    source.error();
    assert.equal(__gep.position, ocr);
    source.events([{ name: "location", data: '{"x":50,"y":50,"map":1429}' }]);
    assert.equal(__gep.position.source, "gep");
    assert.equal(__gep.status, "live");
    source.error();
    assert.equal(__gep.position, null);
  } finally { delete globalThis.__gep; }
});
