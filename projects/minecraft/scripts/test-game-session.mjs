import assert from "node:assert/strict";
import { GAME_CONFIG, GAME_EDITIONS, GAME_GUIDE_SOURCES, GAME_TELEMETRY, isTargetGame } from "../src/game-config.ts";
import { readBedrockWorldMetadata } from "../src/features/game-session/bedrock-world-metadata.ts";
import { applyGepEvents, applyGepInfo } from "../src/features/game-session/session-reducer.ts";
import { createGameSession, getSessionStatus } from "../src/features/game-session/session-types.ts";
import { connectGep } from "../src/features/game-session/gep-connection.ts";
import { guideSourceKey, liveGuideSessionKey, resolveGuideSourceSelection, resolveLiveGuideSource, resolveWorldGuideSource } from
  "../src/features/knowledge/guide-source-selection.ts";

let checks = 0;
const check = (name, run) => { run(); checks += 1; console.log(`PASS ${name}`); };
const fresh = () => createGameSession("test-session", GAME_EDITIONS[0].gameClassId, GAME_EDITIONS[0].id);
const packet = (category, key, value) => ({ category, key, value });
const update = (state, category, key, value, now = 1000) => applyGepInfo(state, packet(category, key, value), now, GAME_TELEMETRY);
const location = (x = 10, y = 80, z = -20) => JSON.stringify({ x, y, z });
const world = () => applyGepInfo({ ...fresh(), registered: true }, { info: {
  game_info: { world_id: "World A", mc_version: "1.21.10" },
  match_info: { dimension: Object.keys(GAME_TELEMETRY.dimensions)[0], location: location() },
}}, 1000, GAME_TELEMETRY);

check("both editions are targeted and a wrong class id cannot pass by title", () => {
  assert.equal(GAME_EDITIONS.length, 2);
  for (const edition of GAME_EDITIONS) assert.ok(isTargetGame({ classId: edition.gameClassId }));
  assert.equal(isTargetGame({ classId: -1, title: GAME_CONFIG.gameName }), false);
  assert.equal(isTargetGame({ title: "Minecraft Dungeons" }), false);
  assert.equal(isTargetGame({ title: "Minecraft Legends" }), false);
  assert.equal(isTargetGame({ title: "Minecraft Java Edition" }), true);
});
check("snapshot normalizes identity and preserves three coordinate axes", () => {
  const state = world();
  assert.equal(state.identity.worldName, "World A");
  assert.deepEqual(state.position, { x: 10, y: 80, z: -20, sequence: 1, receivedAt: 1000 });
  assert.equal(getSessionStatus(state, 1000, 3000), "live");
  assert.equal(getSessionStatus(state, 4001, 3000), "stale");
});
check("flat updates accept data or value fields", () => {
  const state = applyGepInfo(fresh(), { feature: "game_info", key: "mc_version", data: "1.21" }, 1000, GAME_TELEMETRY);
  assert.equal(state.gameVersion, "1.21");
  assert.equal(update(state, "game_info", "mc_version", "1.21.1").gameVersion, "1.21.1");
});
check("live game version selects the exact guide source independently of map generation support", () => {
  const session = { ...world(), gameVersion: "1.19.4" };
  const liveSource = resolveLiveGuideSource(GAME_GUIDE_SOURCES, session);
  assert.equal(liveSource?.edition, "java");
  assert.equal(liveSource?.version, "1.19.4");
  assert.equal(resolveLiveGuideSource(GAME_GUIDE_SOURCES, { ...session, connected: false }), null);
});
check("a new live version overrides an old preference while a current-session manual choice remains available", () => {
  const session = { ...world(), gameVersion: "1.21.11" };
  const manual = GAME_GUIDE_SOURCES.find(source => source.edition === "java" && source.version === "1.18");
  assert(manual);
  const stalePreference = { key: guideSourceKey(manual), liveSessionKey: "previous-session" };
  assert.equal(resolveGuideSourceSelection({ sources: GAME_GUIDE_SOURCES, session, preference: stalePreference }).version, "1.21.11");
  assert.equal(resolveGuideSourceSelection({ sources: GAME_GUIDE_SOURCES, session,
    preference: { ...stalePreference, liveSessionKey: liveGuideSessionKey(session) } }).version, "1.18");
});
check("a connected Bedrock session selects Bedrock guide and crafting data before or beyond an exact catalog version", () => {
  const bedrock = GAME_EDITIONS.find(edition => edition.id === "bedrock");
  const session = { ...createGameSession("bedrock-session", bedrock.gameClassId, bedrock.id), connected: true };
  assert.equal(resolveLiveGuideSource(GAME_GUIDE_SOURCES, session)?.edition, "bedrock");
  assert.equal(resolveLiveGuideSource(GAME_GUIDE_SOURCES, { ...session, gameVersion: "26.51" })?.edition, "bedrock");
  assert.equal(resolveGuideSourceSelection({ sources: GAME_GUIDE_SOURCES, session,
    preference: { key: null, liveSessionKey: null } }).edition, "bedrock");
});
check("switching editions never requests Bedrock catalogs under a selected Java world", () => {
  const javaWorld = { edition: "java", version: "26.3" };
  const bedrock = GAME_EDITIONS.find(edition => edition.id === "bedrock");
  const session = { ...createGameSession("bedrock-session", bedrock.gameClassId, bedrock.id),
    gameVersion: "26.52" };
  const liveSource = resolveLiveGuideSource(GAME_GUIDE_SOURCES, session);
  assert.equal(liveSource?.edition, "bedrock");
  const selected = resolveWorldGuideSource(GAME_GUIDE_SOURCES, javaWorld, liveSource);
  assert.equal(selected?.edition, "java");
  assert.equal(selected?.version, "26.3");
  assert.equal(resolveWorldGuideSource(GAME_GUIDE_SOURCES,
    { edition: "bedrock", version: "26.52" }, liveSource), liveSource);
});
check("Bedrock level metadata retains the exact signed seed, display name and modern release version", () => {
  const text = value => { const data = Buffer.from(value); const size = Buffer.alloc(2); size.writeUInt16LE(data.length); return Buffer.concat([size, data]); };
  const named = (type, key, payload) => Buffer.concat([Buffer.from([type]), text(key), payload]);
  const seed = Buffer.alloc(8); seed.writeBigInt64LE(1143653337750952406n);
  const version = Buffer.alloc(1 + 4 + 5 * 4); version[0] = 3; version.writeInt32LE(5, 1);
  [1, 26, 51, 1, 0].forEach((value, index) => version.writeInt32LE(value, 5 + index * 4));
  const payload = Buffer.concat([Buffer.from([10, 0, 0]),
    named(8, "LevelName", text("Dünyam")), named(4, "RandomSeed", seed),
    named(9, "lastOpenedWithVersion", version), Buffer.from([0])]);
  const header = Buffer.alloc(8); header.writeInt32LE(10); header.writeInt32LE(payload.length, 4);
  assert.deepEqual(readBedrockWorldMetadata(Buffer.concat([header, payload])), {
    name: "Dünyam", seed: "1143653337750952406", version: "26.51",
  });
});
check("dimension change invalidates coordinates and heading", () => {
  let state = update(world(), "match_info", "facing", { x: 90, y: 0 });
  state = update(state, "match_info", "dimension", "nether");
  assert.equal(state.position, null);
  assert.equal(state.yaw, null);
  assert.equal(getSessionStatus(state, 1000, 3000), "waiting");
});
check("namespaced GEP dimensions identify Nether and End transitions", () => {
  const nether = update(world(), "match_info", "dimension", "minecraft:the_nether");
  assert.equal(nether.dimension, "nether");
  const end = update(nether, "match_info", "dimension", "minecraft:the_end");
  assert.equal(end.dimension, "end");
});
check("world change clears old identity and position", () => {
  const state = update(world(), "game_info", "world_id", "World B");
  assert.equal(state.position, null);
  assert.equal(state.dimension, null);
  assert.equal(state.generation, 1);
});
check("world exit cannot keep a live player", () => {
  const state = applyGepEvents(world(), { events: [{ name: "match_end", data: null }] });
  assert.equal(state.inWorld, false);
  assert.equal(state.position, null);
  assert.equal(state.identity.worldName, null);
});
check("invalid payloads surface an issue, valid coordinates recover it", () => {
  let state = update(world(), "match_info", "location", "{broken");
  assert.equal(state.issue, "invalid-data");
  assert.equal(state.position, null);
  state = update(state, "match_info", "location", location());
  assert.equal(state.issue, null);
});
check("full world coordinate range is accepted and non-finite samples rejected", () => {
  assert.ok(update(world(), "match_info", "location", { x: 29_999_999, y: -64, z: -29_999_999 }).position);
  assert.equal(update(world(), "match_info", "location", { x: Infinity, y: 2, z: 0 }).position, null);
  assert.equal(update(world(), "match_info", "location", { x: 30_000_001, y: 2, z: 0 }).position, null);
});
check("heading updates do not make an old position fresh", () => {
  const state = update(world(), "match_info", "facing", { x: -90, y: 10 }, 9000);
  assert.equal(state.yaw, 270);
  assert.equal(state.facingReceivedAt, 9000);
  assert.equal(state.position.receivedAt, 1000);
  assert.equal(getSessionStatus(state, 9000, 3000), "stale");
});
check("each edition reads yaw and pitch from its configured facing axes", () => {
  const java = update(world(), "match_info", "facing", { x: 146.851, y: 1.34979 });
  assert.equal(java.yaw, 146.851);
  assert.equal(java.pitch, 1.34979);
  const bedrock = update({ ...world(), edition: "bedrock" }, "match_info", "facing", { x: 1.34979, y: 146.851 });
  assert.equal(bedrock.yaw, 146.851);
  assert.equal(bedrock.pitch, 1.34979);
  const wrapped = update(bedrock, "match_info", "facing", { x: -12.31, y: -179.34 });
  assert.equal(wrapped.yaw, 180.66);
  assert.equal(wrapped.pitch, -12.31);
});
check("facing timestamp is independent of location and resets with invalid orientation or world transitions", () => {
  const state = update(world(), "match_info", "facing", { x: 0, y: 0 }, 1200);
  assert.equal(update(state, "match_info", "location", location(), 2000).facingReceivedAt, 1200);
  assert.equal(update(state, "match_info", "facing", { x: Infinity, y: 0 }).facingReceivedAt, null);
  assert.equal(update(state, "match_info", "dimension", "nether").facingReceivedAt, null);
  assert.equal(update(state, "game_info", "world_id", "Different").facingReceivedAt, null);
  assert.equal(applyGepEvents(state, { events: [{ name: "match_end", data: null }] }).facingReceivedAt, null);
});
check("sensitive and unrelated GEP payloads are not retained", () => {
  const state = applyGepInfo(world(), { info: {
    game_info: { game_dir: "private-path", player_3: "another-player" },
    match_info: { chat: "private-chat", general_stats: "statistics" },
  }}, 2000, GAME_TELEMETRY);
  for (const secret of ["private-path", "another-player", "private-chat", "statistics"])
    assert.equal(JSON.stringify(state).includes(secret), false);
});

const mockConnection = () => {
  const event = () => {
    const listeners = new Set();
    return { addListener: f => listeners.add(f), removeListener: f => listeners.delete(f),
      emit: value => [...listeners].forEach(f => f(value)), listeners };
  };
  const registrations = [];
  const snapshots = [];
  const jobs = [];
  const published = [];
  const api = {
    setRequiredFeatures: (_, callback) => registrations.push(callback),
    getInfo: callback => snapshots.push(callback),
    onInfoUpdates2: event(), onNewEvents: event(), onError: event(),
  };
  const dispose = connectGep({ api, id: "mock", gameClassId: GAME_EDITIONS[0].gameClassId,
    edition: GAME_EDITIONS[0].id, features: GAME_TELEMETRY.features, rules: GAME_TELEMETRY,
    publish: state => published.push(state), now: () => 2000,
    schedule: (run, delay) => { const job = { run, delay, cancelled: false }; jobs.push(job); return () => { job.cancelled = true; }; },
  });
  return { api, registrations, snapshots, jobs, published, dispose, last: () => published.at(-1) };
};
check("registration precedes snapshot and includes required features", () => {
  const mock = mockConnection();
  assert.equal(mock.snapshots.length, 0);
  mock.registrations[0]({ success: true, supportedFeatures: GAME_TELEMETRY.features });
  assert.equal(mock.snapshots.length, 1);
  assert.equal(mock.last().registered, true);
  mock.dispose();
});
check("late snapshot fills metadata without overwriting fresher coordinates", () => {
  const mock = mockConnection();
  mock.registrations[0]({ success: true });
  mock.api.onInfoUpdates2.emit({ info: { match_info: { location: location(20) } } });
  mock.snapshots[0]({ success: true, res: { game_info: { mc_version: "1.21" }, match_info: { location: location(1) } } });
  assert.equal(mock.last().position.x, 20);
  assert.equal(mock.last().gameVersion, "1.21");
  mock.dispose();
});
check("snapshot cannot resurrect an ended world", () => {
  const mock = mockConnection();
  mock.registrations[0]({ success: true });
  mock.api.onNewEvents.emit({ events: [{ name: "match_end" }] });
  mock.snapshots[0]({ success: true, res: { match_info: { location: location() } } });
  assert.equal(mock.last().position, null);
  mock.dispose();
});
check("errors schedule retry and missing feature support is explicit", () => {
  const mock = mockConnection();
  mock.registrations[0]({ success: true, supportedFeatures: [] });
  assert.equal(mock.last().issue, "missing-features");
  const retry = mock.jobs.find(job => !job.cancelled);
  assert.equal(retry.delay, 1000);
  retry.run();
  assert.equal(mock.registrations.length, 2);
  mock.dispose();
});
check("dispose removes listeners and rejects late callbacks", () => {
  const mock = mockConnection();
  mock.dispose();
  const count = mock.published.length;
  mock.registrations[0]({ success: true });
  assert.equal(mock.published.length, count);
  assert.equal(mock.last().connected, false);
  assert.equal(mock.api.onInfoUpdates2.listeners.size, 0);
  assert.ok(mock.jobs.every(job => job.cancelled));
});
check("scene_key updates populate session and world transitions clear it", () => {
  let state = world();
  assert.equal(state.sceneKey, null);
  state = update(state, "game_info", "scene_key", "deathScreen.title");
  assert.equal(state.sceneKey, "deathScreen.title");
  state = applyGepEvents(state, { events: [{ name: "match_end" }] });
  assert.equal(state.sceneKey, null);
});
console.log(`${checks} game-session checks passed.`);
