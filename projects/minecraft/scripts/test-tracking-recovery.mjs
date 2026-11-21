import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { GAME_EDITIONS, GAME_MAP_DIMENSIONS, GAME_TELEMETRY } from "../src/game-config.ts";
import { connectGep } from "../src/features/game-session/gep-connection.ts";
import { createGameSession, getSessionStatus } from "../src/features/game-session/session-types.ts";
import { applyGepInfo } from "../src/features/game-session/session-reducer.ts";
import { parseGameSession } from "../src/features/game-session/session-validation.ts";
import { createWorldMetadataDiscovery, localWorldSourceId } from "../src/features/game-session/world-metadata-discovery.ts";
import { createWorldRepository, WorldBindingChangedError } from "../src/features/worlds/world-repository.ts";
import { autoConnectLiveWorld, matchLiveWorld } from "../src/features/worlds/auto-connect-live-world.ts";
import { bindSelectedServerWorld } from "../src/features/worlds/bind-selected-server-world.ts";
import { createLiveWorldConnector } from "../src/features/worlds/live-world-connector.ts";
import { confirmSessionWorld, resolveBoundSession } from "../src/features/worlds/world-session-binding.ts";
import { resolveWorldMapPlayer } from "../src/features/worlds/world-map-player.ts";
import { saveCurrentPositionPin } from "../src/features/worlds/world-current-position-pin.ts";
import { readLastWorldPosition, readResumeDimension, saveWorldResumePosition } from "../src/features/worlds/world-resume-state.ts";
import { worldTrackingNotice, worldTrackingStatus } from "../src/features/worlds/world-tracking-status.ts";
import { assertWorldRecord } from "../src/features/worlds/world-validation.ts";
import { defaultDimensionView, generationKey } from "../src/features/worlds/world-types.ts";
import { accountDeviceStateKey, parseWorldDeviceState } from "../src/features/worlds/world-device-state.ts";
import { createSmoothedWorldMapPlayer } from "../src/features/worlds/use-smoothed-world-map-player.ts";
import { fromAccountWorld, toAccountWorld, parsePlayerProgress } from "../src/services/sync/player-progress.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const settle = () => new Promise(resolve => setImmediate(resolve));
const until = async predicate => {
  for (let i = 0; i < 200 && !predicate(); i++) await settle();
  assert.ok(predicate(), "Async work did not settle");
};
const dims = GAME_MAP_DIMENSIONS.map(item => item.id);
const setup = () => {
  const factory = new IDBFactory();
  let id = 0;
  const options = { factory, name: "tracking-recovery", newId: () => `world-${++id}`, now: () => 1000 };
  return { factory, options, repo: createWorldRepository(options) };
};
const sessionFor = (edition = GAME_EDITIONS[0], patch = {}) => ({
  ...createGameSession("session-one", edition.gameClassId, edition.id), registered: true, inWorld: true,
  identity: { worldName: "Save A", server: null, realmId: null, realmName: null },
  dimension: dims[0], worldSeed: "42", sequence: 1,
  position: { x: 120, y: 64, z: -80, receivedAt: 1000, sequence: 1 }, ...patch,
});
const draft = (edition = GAME_EDITIONS[0], seed = "42") => ({ name: "Saved world", edition: edition.id,
  generation: { seed, version: "fixture", preset: "default", settings: {} } });
const event = () => { const listeners = new Set(); return {
  listeners, addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener),
  emit: packet => listeners.forEach(listener => listener(packet)),
}; };
const clock = () => {
  let now = 1000, id = 0;
  const jobs = new Map();
  return { now: () => now, jobs,
    schedule(callback, delay) { const token = ++id; jobs.set(token, { at: now + delay, callback, delay }); return () => jobs.delete(token); },
    advance(ms) {
      const target = now + ms;
      for (let safety = 0; safety < 1000; safety++) {
        const next = [...jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) { now = target; return; }
        jobs.delete(next[0]); now = next[1].at; next[1].callback();
      }
      throw new Error("Unbounded scheduled work");
    },
  };
};
const provider = (edition = GAME_EDITIONS[0]) => {
  const timer = clock(), registrations = [], snapshots = [], published = [];
  const api = { onInfoUpdates2: event(), onNewEvents: event(), onError: event(),
    setRequiredFeatures: (_features, callback) => registrations.push(callback), getInfo: callback => snapshots.push(callback) };
  const stop = connectGep({ api, id: "provider", gameClassId: edition.gameClassId, edition: edition.id,
    features: GAME_TELEMETRY.features, requiredFeatures: GAME_TELEMETRY.requiredFeatures, rules: GAME_TELEMETRY,
    publish: session => published.push(session), now: timer.now, schedule: timer.schedule });
  return { api, timer, registrations, snapshots, stop, last: () => published.at(-1) };
};
const info = (x = 120, name = "Save A") => ({ game_info: { world_id: name },
  match_info: { dimension: Object.keys(GAME_TELEMETRY.dimensions)[0], location: JSON.stringify({ x, y: 64, z: -80 }) } });

for (const edition of GAME_EDITIONS) {
  await check(`${edition.id}: stationary snapshots keep both map and base-saving available`, async () => {
    const p = provider(edition), { repo } = setup();
    try {
      p.registrations[0]({ success: true });
      p.snapshots[0]({ success: true, res: info() });
      if (GAME_TELEMETRY.positionWarmupEditions.includes(edition.id)) {
        p.api.onInfoUpdates2.emit(info(119));
        p.api.onInfoUpdates2.emit(info());
      }
      const world = await repo.create(draft(edition));
      const binding = confirmSessionWorld(world, p.last(), p.timer.now());
      await repo.bindSession(binding, (await repo.snapshot()).selection.revision);
      for (let i = 0; i < 6; i++) {
        p.timer.advance(2000);
        p.snapshots.at(-1)({ success: true, res: info() });
      }
      assert.equal(p.last().position.x, 120);
      assert.equal(getSessionStatus(p.last(), p.timer.now(), 3000), "live");
      assert.ok(resolveWorldMapPlayer(world, { session: p.last(), error: null }, binding, p.timer.now(), 3000, dims, GAME_TELEMETRY.coordinateLimit));
      assert.equal((await saveCurrentPositionPin({ repository: repo, session: p.last(), name: "Base", now: p.timer.now })).status, "saved");
      assert.equal((await repo.get(world.id)).personal.pins.length, 1);
    } finally { p.stop(); repo.close(); }
  });
  await check(`${edition.id}: unique server and realm associations reconnect without re-entering a seed`, async () => {
    for (const kind of ["server", "realm"]) {
      const { repo } = setup();
      const session = sessionFor(edition, { worldSeed: null,
        identity: { worldName: null, server: kind === "server" ? "server-a" : null, realmId: kind === "realm" ? "realm-a" : null, realmName: null } });
      try {
        const world = await repo.create(draft(edition));
        await bindSelectedServerWorld(repo, world, session, 1000);
        const rejoined = { ...session, id: "new-session", generation: 3 };
        assert.equal((await autoConnectLiveWorld(repo, rejoined, 1001)).id, world.id);
        const snapshot = await repo.snapshot();
        assert.equal(snapshot.binding.sessionId, "new-session");
        assert.equal(resolveBoundSession(await repo.get(world.id), rejoined, snapshot.binding, 1001, 3000).status, "live");
        assert.equal((await saveCurrentPositionPin({ repository: repo, session: rejoined, name: "Base", now: () => 1001 })).status, "saved");
      } finally { repo.close(); }
    }
  });
  await check(`${edition.id}: unrelated servers and known seed resets cannot reuse a binding`, async () => {
    const { repo } = setup();
    const session = sessionFor(edition, { worldSeed: null, identity: { worldName: null, server: "server-a", realmId: null, realmName: null } });
    try {
      const world = await repo.create(draft(edition));
      await bindSelectedServerWorld(repo, world, session, 1000);
      const snapshot = await repo.snapshot();
      for (const changed of [{ ...session, id: "new", identity: { ...session.identity, server: "server-b" } },
        { ...session, worldSeed: "99" }, { ...session, edition: "unknown" }]) {
        assert.equal(await autoConnectLiveWorld(repo, changed, 1001), null);
        assert.equal(resolveWorldMapPlayer(world, { session: changed, error: null }, snapshot.binding, 1001, 3000, dims, GAME_TELEMETRY.coordinateLimit), null);
      }
      assert.equal((await repo.snapshot()).worlds.length, 1);
    } finally { repo.close(); }
  });
  await check(`${edition.id}: ambiguity requires selection and honors a remote sub-world identity`, async () => {
    const { repo } = setup();
    const session = sessionFor(edition, { worldSeed: null, identity: { worldName: null, server: "shared-server", realmId: null, realmName: null } });
    try {
      const a = await repo.create(draft(edition)), b = await repo.create(draft(edition, "99"));
      for (const world of [a, b]) await repo.setAssociation(world.id, { kind: "server", identity: "shared-server", confirmedAt: 1000 });
      assert.equal(matchLiveWorld(await repo.snapshot(), session).kind, "ambiguous");
      assert.equal(await autoConnectLiveWorld(repo, session), null);
      assert.equal(worldTrackingStatus(await repo.snapshot(), session, 1000, 3000, false), "chooseWorld");
      await bindSelectedServerWorld(repo, b, session, 1000);
      assert.equal((await autoConnectLiveWorld(repo, session, 1001)).id, b.id);
      await repo.setAssociation(a.id, { kind: "server", identity: "shared-server", worldName: "A", confirmedAt: 1000 });
      await repo.setAssociation(b.id, { kind: "server", identity: "shared-server", worldName: "B", confirmedAt: 1000 });
      assert.equal((await autoConnectLiveWorld(repo, { ...session, id: "new", identity: { ...session.identity, worldName: "A" } }, 1001)).id, a.id);
    } finally { repo.close(); }
  });
  await check(`${edition.id}: different saves and different roots sharing a seed stay isolated`, async () => {
    const { repo } = setup();
    try {
      const session = sessionFor(edition, { localWorldId: "a".repeat(64) });
      const a = await autoConnectLiveWorld(repo, session, 1000);
      const b = await autoConnectLiveWorld(repo, { ...session, id: "second", identity: { ...session.identity, worldName: "Save B" } }, 1001);
      const c = await autoConnectLiveWorld(repo, { ...session, id: "third", localWorldId: "b".repeat(64) }, 1002);
      assert.equal(new Set([a.id, b.id, c.id]).size, 3);
      assert.equal((await autoConnectLiveWorld(repo, { ...session, id: "fourth" }, 1003)).id, a.id);
      assert.equal((await repo.snapshot()).worlds.length, 3);
    } finally { repo.close(); }
  });
  await check(`${edition.id}: verified resume survives reopening but never becomes a live position`, async () => {
    const { repo, options } = setup();
    const session = sessionFor(edition, { dimension: dims[1] });
    const world = await autoConnectLiveWorld(repo, session, 1000);
    await saveWorldResumePosition(repo, session, 1000);
    repo.close();
    const reopened = createWorldRepository(options);
    try {
      const saved = await reopened.get(world.id);
      assert.equal(readLastWorldPosition(saved, 1001).x, 120);
      assert.equal(readResumeDimension(saved, "desktop", dims, 1001), dims[1]);
      assert.equal(resolveWorldMapPlayer(saved, { session: null, error: null }, (await reopened.snapshot()).binding, 1001, 3000, dims, GAME_TELEMETRY.coordinateLimit), null);
      const changed = { ...saved, generation: { ...saved.generation, seed: "123" } };
      assert.equal(readLastWorldPosition(changed, 1001), null);
      assert.equal(readLastWorldPosition(saved, 999), null);
      await saveWorldResumePosition(reopened, { ...session, id: "wrong", position: { ...session.position, x: 999, receivedAt: 1001 } }, 1001);
      assert.equal(readLastWorldPosition(await reopened.get(world.id), 1001).x, 120);
    } finally { reopened.close(); }
  });
}

await check("cached startup coordinates remain waiting until a changed position arrives", async () => {
  const edition = GAME_EDITIONS.find(e => GAME_TELEMETRY.positionWarmupEditions.includes(e.id));
  const p = provider(edition), { repo } = setup();
  try {
    p.registrations[0]({ success: true });
    p.snapshots[0]({ success: true, res: info() });
    const world = await repo.create(draft(edition));
    await bindSelectedServerWorld(repo, world, p.last(), p.timer.now());
    for (let i = 0; i < 25; i++) {
      p.timer.advance(2000);
      p.snapshots.at(-1)({ success: true, res: info() });
      p.api.onInfoUpdates2.emit(info());
      assert.equal(p.last().positionReady, false);
      assert.equal(getSessionStatus(p.last(), p.timer.now(), 3000), "waiting");
    }
    p.api.onInfoUpdates2.emit({ match_info: { facing: JSON.stringify({ x: 20, y: 90 }) } });
    assert.equal(p.last().positionReady, false, "Rotation alone does not confirm a fresh coordinate");
    const snapshot = await repo.snapshot();
    assert.equal(worldTrackingStatus(snapshot, p.last(), p.timer.now(), 3000, false), "waiting");
    assert.equal(worldTrackingNotice("waiting", p.last()), null);
    assert.equal(resolveWorldMapPlayer(world, { session: p.last(), error: null }, snapshot.binding,
      p.timer.now(), 3000, dims, GAME_TELEMETRY.coordinateLimit), null);
    assert.equal((await saveCurrentPositionPin({ repository: repo, session: p.last(), name: "Base", now: p.timer.now })).status, "unavailable");
    await saveWorldResumePosition(repo, p.last(), p.timer.now());
    assert.equal((await repo.get(world.id)).personal.resume?.lastPosition, undefined);
    p.api.onInfoUpdates2.emit(info(121));
    assert.equal(p.last().positionReady, true);
    assert.equal(getSessionStatus(p.last(), p.timer.now(), 3000), "live");
    assert.ok(resolveWorldMapPlayer(world, { session: p.last(), error: null }, snapshot.binding,
      p.timer.now(), 3000, dims, GAME_TELEMETRY.coordinateLimit));
    assert.equal((await saveCurrentPositionPin({ repository: repo, session: p.last(), name: "Base", now: p.timer.now })).status, "saved");
    for (let i = 0; i < 5; i++) {
      p.timer.advance(2000); p.snapshots.at(-1)({ success: true, res: info(121) });
      assert.equal(getSessionStatus(p.last(), p.timer.now(), 3000), "live", "Standing still after verification stays live");
    }
    p.api.onNewEvents.emit({ events: [{ name: "match_end" }] });
    assert.equal(p.last().positionReady, false);
    p.api.onInfoUpdates2.emit(info(122));
    assert.equal(p.last().position, null);
    p.api.onNewEvents.emit({ events: [{ name: "match_start" }] });
    p.timer.advance(0); p.snapshots.at(-1)({ success: true, res: info(122) });
    assert.equal(p.last().positionReady, false);
    p.api.onInfoUpdates2.emit(info(123));
    assert.equal(p.last().positionReady, true);
    p.api.onInfoUpdates2.emit({ match_info: { dimension: dims[1], location: JSON.stringify({ x: 10, y: 64, z: 10 }) } });
    assert.equal(p.last().positionReady, false, "A dimension transition starts a fresh verification");
  } finally { p.stop(); repo.close(); }
});
await check("changed snapshot coordinates can finish startup without waiting for another event", () => {
  const edition = GAME_EDITIONS.find(e => GAME_TELEMETRY.positionWarmupEditions.includes(e.id));
  const p = provider(edition);
  try {
    p.registrations[0]({ success: true }); p.snapshots[0]({ success: true, res: info() });
    p.timer.advance(2000); p.snapshots.at(-1)({ success: true, res: info(121) });
    assert.equal(getSessionStatus(p.last(), p.timer.now(), 3000), "live");
    p.api.onInfoUpdates2.emit(info(122, "Another world"));
    assert.equal(p.last().positionReady, false);
    p.api.onInfoUpdates2.emit({ match_info: { location: '{"x":null,"y":64,"z":0}' } });
    assert.equal(p.last().positionReady, false);
  } finally { p.stop(); }
});
await check("silent snapshot timeout hides live actions and automatically re-registers", () => {
  const p = provider();
  try {
    p.registrations[0]({ success: true }); p.snapshots[0]({ success: true, res: info() });
    p.timer.advance(4000);
    assert.equal(getSessionStatus(p.last(), p.timer.now(), 3000), "stale");
    p.timer.advance(8000);
    assert.equal(p.last().issue, "provider-error");
    p.timer.advance(1000);
    assert.equal(p.registrations.length, 2);
    p.registrations[1]({ success: true }); p.snapshots.at(-1)({ success: true, res: info(140) });
    assert.equal(getSessionStatus(p.last(), p.timer.now(), 3000), "live");
    assert.equal(p.last().position.x, 140);
  } finally { p.stop(); assert.equal(p.timer.jobs.size, 0); }
});
await check("world re-entry requests a new snapshot and rejects an old generation's callback", () => {
  const p = provider();
  try {
    p.registrations[0]({ success: true });
    const old = p.snapshots[0];
    p.api.onNewEvents.emit({ events: [{ name: "match_end" }] });
    old({ success: true, res: info() });
    p.api.onInfoUpdates2.emit({ info: info(999) });
    assert.equal(p.last().position, null);
    assert.equal(p.timer.jobs.size, 0);
    p.api.onNewEvents.emit({ events: [{ name: "match_start" }] });
    p.timer.advance(0);
    assert.equal(p.snapshots.length, 2);
    p.snapshots[1]({ success: true, res: info(250, "Save B") });
    old({ success: true, res: info(999) });
    assert.equal(p.last().position.x, 250);
    assert.equal(p.last().identity.worldName, "Save B");
  } finally { p.stop(); }
});
await check("dimension changes and newer samples win over an in-flight recovery snapshot", () => {
  const p = provider();
  try {
    p.registrations[0]({ success: true }); p.snapshots[0]({ success: true, res: info() });
    p.timer.advance(2000);
    p.api.onInfoUpdates2.emit({ category: "match_info", key: "dimension", value: dims[1] });
    p.snapshots[1]({ success: true, res: info(999) });
    assert.equal(p.last().dimension, dims[1]); assert.equal(p.last().position, null);
    p.api.onInfoUpdates2.emit({ category: "match_info", key: "location", value: JSON.stringify({ x: 7, y: 80, z: 9 }) });
    assert.equal(p.last().position.x, 7);
  } finally { p.stop(); }
});
await check("malformed snapshots and explicit errors retain bounded retry scheduling", () => {
  const p = provider();
  try {
    p.registrations[0]({ success: true }); p.snapshots[0]({ success: true, res: null });
    assert.equal(p.last().issue, "provider-error");
    assert.equal(p.timer.jobs.size, 1);
    p.api.onError.emit({ reason: "temporary" });
    assert.equal(p.timer.jobs.size, 1);
    assert.ok([...p.timer.jobs.values()][0].delay <= 30000);
  } finally { p.stop(); }
});
await check("missing required features retry and disposal rejects every late callback", () => {
  const p = provider();
  p.registrations[0]({ success: true, supportedFeatures: [] });
  assert.equal(p.last().issue, "missing-features");
  p.stop(); p.registrations[0]({ success: true });
  assert.equal(p.last().connected, false); assert.equal(p.timer.jobs.size, 0);
  assert.equal(p.api.onInfoUpdates2.listeners.size, 0);
});

await check("metadata failures and null results retry without new game events", async () => {
  const timer = clock(); let session = sessionFor(), attempts = 0, commits = 0;
  const discovery = createWorldMetadataDiscovery({ getSession: () => session, schedule: timer.schedule, debug: () => {},
    read: async () => { attempts++; if (attempts === 1) throw new Error("locked"); return attempts === 2 ? null : { seed: "42" }; },
    commit: (metadata, localWorldId) => { session = { ...session, worldSeed: metadata.seed, localWorldId }; commits++; } });
  try {
    discovery.consider({ game_dir: "C:\\Fixture" }); await until(() => timer.jobs.size === 1);
    discovery.consider({}); assert.equal(attempts, 1);
    timer.advance(1000); await until(() => attempts === 2 && timer.jobs.size === 1);
    timer.advance(2000); await until(() => commits === 1);
    assert.equal(attempts, 3); assert.match(session.localWorldId, /^[a-f0-9]{64}$/);
    discovery.consider({}); assert.equal(attempts, 3);
  } finally { discovery.dispose(); assert.equal(timer.jobs.size, 0); }
});
await check("metadata from an obsolete save or disposed connection never commits", async () => {
  const timer = clock(); let session = sessionFor(), commits = 0; const reads = [];
  const discovery = createWorldMetadataDiscovery({ getSession: () => session, schedule: timer.schedule, debug: () => {},
    read: () => new Promise(resolve => reads.push(resolve)), commit: () => commits++ });
  discovery.consider({ game_dir: "fixture" });
  await until(() => reads.length === 1);
  session = { ...session, generation: 2, identity: { ...session.identity, worldName: "Save B" } };
  discovery.reset(); discovery.consider({ game_dir: "fixture" });
  await until(() => reads.length === 2);
  reads[0]({ seed: "99" }); await settle(); assert.equal(commits, 0);
  discovery.dispose(); reads[1]({ seed: "42" }); await settle(); assert.equal(commits, 0);
  assert.equal(timer.jobs.size, 0);
});
await check("remote sessions never read unrelated local metadata", () => {
  const timer = clock(); let reads = 0;
  const discovery = createWorldMetadataDiscovery({ getSession: () => sessionFor(undefined,
    { identity: { worldName: "Remote", server: "server", realmId: null, realmName: null } }),
    schedule: timer.schedule, debug: () => {}, read: async () => { reads++; return null; }, commit: () => assert.fail() });
  discovery.consider({ game_dir: "fixture" }); assert.equal(reads, 0); discovery.dispose();
});
await check("synchronous metadata failures retry with a bounded maximum delay", async () => {
  const timer = clock(); let attempts = 0;
  const discovery = createWorldMetadataDiscovery({ getSession: () => sessionFor(), schedule: timer.schedule, debug: () => {},
    read: () => { attempts++; throw new Error("temporary read failure"); }, commit: () => assert.fail() });
  discovery.consider({});
  try {
    for (let i = 0; i < 8; i++) {
      await until(() => attempts === i + 1 && timer.jobs.size === 1);
      const delay = [...timer.jobs.values()][0].delay;
      assert.equal(delay, Math.min(30000, 1000 * 2 ** i));
      timer.advance(delay);
    }
    await until(() => timer.jobs.size === 1);
  } finally { discovery.dispose(); assert.equal(timer.jobs.size, 0); }
});
await check("a local-to-remote identity transition invalidates local seed and coordinates", () => {
  const initial = sessionFor(undefined, { localWorldId: "a".repeat(64) });
  const remote = applyGepInfo(initial, { category: "match_info", key: "server", value: "server-a" }, 1001, GAME_TELEMETRY);
  assert.equal(remote.worldSeed, null); assert.equal(remote.localWorldId, null);
  assert.equal(remote.position, null); assert.equal(remote.generation, initial.generation + 1);
});
await check("save fingerprints normalize roots, separate installations and validate at storage boundaries", async () => {
  const a = await localWorldSourceId('"C:/Fixture/"', "Save A");
  assert.equal(a, await localWorldSourceId("c:\\fixture", "save a"));
  assert.notEqual(a, await localWorldSourceId("D:\\Fixture", "Save A"));
  assert.notEqual(a, await localWorldSourceId("C:\\Fixture", "Save B"));
  const rules = { coordinateLimit: GAME_TELEMETRY.coordinateLimit, editions: GAME_EDITIONS };
  assert.equal(parseGameSession(sessionFor(undefined, { localWorldId: a }), rules).localWorldId, a);
  assert.throws(() => parseGameSession(sessionFor(undefined, { localWorldId: "C:\\Private" }), rules));
});

await check("cancelled auto-connect rolls back selection, world creation and binding atomically", async () => {
  const { repo } = setup(); let checks = 0;
  try {
    await assert.rejects(autoConnectLiveWorld(repo, sessionFor(), 1000, () => ++checks < 3), WorldBindingChangedError);
    const snapshot = await repo.snapshot();
    assert.equal(snapshot.worlds.length, 0); assert.equal(snapshot.selection.worldId, null); assert.equal(snapshot.binding, null);
  } finally { repo.close(); }
});
await check("a concurrent user selection wins over delayed automatic connection", async () => {
  const { repo } = setup();
  try {
    const a = await repo.create(draft()), b = await repo.create(draft(undefined, "99"));
    await repo.setAssociation(a.id, { kind: "local", identity: "Save A", confirmedAt: 1 });
    const wrapped = { ...repo, snapshot: async () => { const snapshot = await repo.snapshot(); await repo.select(b.id); return snapshot; } };
    await assert.rejects(autoConnectLiveWorld(wrapped, sessionFor(), 1000), WorldBindingChangedError);
    assert.equal((await repo.snapshot()).selection.worldId, b.id);
    assert.equal((await repo.snapshot()).binding, null);
  } finally { repo.close(); }
});
await check("manual selection rejects a game transition while its transaction is pending", async () => {
  const { repo } = setup();
  try {
    const world = await repo.create(draft()); const session = sessionFor();
    await assert.rejects(bindSelectedServerWorld(repo, world, session, 1000, () => ({ ...session, id: "new" })), WorldBindingChangedError);
    assert.equal((await repo.snapshot()).binding, null); assert.equal((await repo.get(world.id)).association, null);
  } finally { repo.close(); }
});
await check("obsolete account restoration and position writes roll back their entire transactions", async () => {
  const { repo } = setup();
  try {
    const session = sessionFor(), world = await autoConnectLiveWorld(repo, session, 1000);
    const before = await repo.snapshot();
    await assert.rejects(repo.replaceAccountWorlds([], "account-a", () => false), WorldBindingChangedError);
    assert.deepEqual(await repo.snapshot(), before);
    let validChecks = 0;
    await assert.rejects(saveWorldResumePosition(repo, session, 1000, () => ++validChecks === 1), WorldBindingChangedError);
    assert.equal((await repo.get(world.id)).personal.resume, undefined);
  } finally { repo.close(); }
});
await check("a base pin cannot commit after a dimension change or world exit", async () => {
  const { repo } = setup();
  try {
    const session = sessionFor(), world = await autoConnectLiveWorld(repo, session, 1000);
    for (const change of [{ dimension: dims[1] }, { inWorld: false }, { id: "new-session" }, { issue: "provider-error" }]) {
      const result = await saveCurrentPositionPin({ repository: repo, session, name: "Base", now: () => 1000,
        currentSession: () => ({ ...session, ...change }) });
      assert.equal(result.status, "unavailable");
      assert.equal((await repo.get(world.id)).personal.pins.length, 0);
    }
  } finally { repo.close(); }
});
await check("connector retries transaction failure without another provider update", async () => {
  const { repo } = setup(); const timer = clock(); let calls = 0, errors = 0;
  const wrapped = { ...repo, connectSessionWorld: (...args) => { calls++; if (calls === 1) return Promise.reject(new Error("busy")); return repo.connectSessionWorld(...args); } };
  const connector = createLiveWorldConnector({ repository: wrapped, now: timer.now, schedule: timer.schedule, onError: () => errors++ });
  try {
    connector.observe(sessionFor()); timer.advance(0); await until(() => errors === 1 && timer.jobs.size > 0);
    timer.advance(1000); await until(() => calls === 2 && timer.jobs.size > 0);
    assert.equal((await repo.snapshot()).worlds.length, 1);
    assert.equal((await repo.snapshot()).binding.sessionId, "session-one");
  } finally { connector.dispose(); repo.close(); assert.equal(timer.jobs.size, 0); }
});
await check("connector does not recreate a cleared account world and reattaches restored data", async () => {
  const { repo } = setup(); const timer = clock();
  const connector = createLiveWorldConnector({ repository: repo, now: timer.now, schedule: timer.schedule });
  try {
    const session = sessionFor(); connector.observe(session); timer.advance(0); await until(() => timer.jobs.size > 0);
    const saved = (await repo.snapshot()).worlds[0]; const cloud = toAccountWorld(saved);
    await repo.clearAccountWorlds("account-a"); timer.advance(1000); await until(() => timer.jobs.size > 0);
    assert.equal((await repo.snapshot()).worlds.length, 0);
    await repo.replaceAccountWorlds([fromAccountWorld(cloud)], "account-a");
    timer.advance(1000); await until(() => timer.jobs.size > 0);
    assert.equal((await repo.snapshot()).binding.worldId, saved.id);
    assert.equal((await repo.snapshot()).worlds.length, 1);
  } finally { connector.dispose(); repo.close(); }
});

await check("account sign-out/reopen restores camera, dimension, selection, association and last position", async () => {
  const { repo, options } = setup(); const session = sessionFor();
  const world = await autoConnectLiveWorld(repo, session, 1000);
  await saveWorldResumePosition(repo, session, 1000);
  await repo.updatePersonal(world.id, personal => ({ ...personal,
    pins: [{ id: "home", dimension: dims[0], name: "Base", icon: "home", color: "sage", group: "base", note: "", x: 1, y: 64, z: 2 }],
    views: { [dims[1]]: { ...defaultDimensionView(), camera2d: { x: 300, z: 400, zoom: 0.25 } } },
    resume: { ...personal.resume, dimensionBySurface: { desktop: dims[1], "in-game": dims[0] } },
  }));
  const other = await repo.create(draft(undefined, "99")); await repo.select(world.id);
  const before = await repo.get(world.id);
  const cloud = (await repo.snapshot()).worlds.map(toAccountWorld);
  await repo.clearAccountWorlds("account-a"); await repo.clearAccountWorlds("account-a");
  assert.equal((await repo.snapshot()).worlds.length, 0); repo.close();
  const reopened = createWorldRepository(options);
  try {
    await reopened.replaceAccountWorlds(cloud.map(fromAccountWorld), "account-a");
    const after = await reopened.get(world.id), snapshot = await reopened.snapshot();
    assert.deepEqual(after.personal, before.personal); assert.deepEqual(after.association, before.association);
    assert.equal(snapshot.selection.worldId, world.id); assert.equal(snapshot.binding, null);
    assert.equal(readResumeDimension(after, "desktop", dims, 1001), dims[1]);
    assert.equal(readResumeDimension(after, "in-game", dims, 1001), dims[0]);
    assert.ok(snapshot.worlds.some(item => item.id === other.id));
  } finally { reopened.close(); }
});
await check("account switching and late cleanup do not expose another account's device state", async () => {
  const { repo } = setup();
  try {
    const world = await autoConnectLiveWorld(repo, sessionFor(), 1000);
    await saveWorldResumePosition(repo, sessionFor(), 1000);
    const cloud = toAccountWorld(await repo.get(world.id));
    await repo.replaceAccountWorlds([fromAccountWorld(cloud)], "account-a");
    await repo.replaceAccountWorlds([fromAccountWorld(cloud)], "account-b");
    assert.equal((await repo.get(world.id)).association, null);
    assert.equal((await repo.get(world.id)).personal.resume, undefined);
    assert.equal(await repo.clearAccountWorlds("account-a"), false);
    assert.equal((await repo.snapshot()).worlds.length, 1);
    await repo.clearAccountWorlds("account-b");
    await repo.replaceAccountWorlds([fromAccountWorld(cloud)], "account-a");
    assert.ok((await repo.get(world.id)).association);
    assert.equal(readLastWorldPosition(await repo.get(world.id), 1000).x, 120);
  } finally { repo.close(); }
});
await check("changed generation and deleted cloud worlds do not restore incompatible resume state", async () => {
  const { repo } = setup();
  try {
    const world = await autoConnectLiveWorld(repo, sessionFor(), 1000); await saveWorldResumePosition(repo, sessionFor(), 1000);
    const cloud = toAccountWorld(await repo.get(world.id)); await repo.clearAccountWorlds("account-a");
    await repo.replaceAccountWorlds([], "account-a"); assert.equal((await repo.snapshot()).worlds.length, 0);
    await repo.replaceAccountWorlds([fromAccountWorld({ ...cloud, generation: { ...cloud.generation, seed: "99" } })], "account-a");
    assert.equal((await repo.get(world.id)).personal.resume, undefined);
    assert.equal((await repo.get(world.id)).association, null);
  } finally { repo.close(); }
});
await check("cloud input cannot inject resume data; malformed local state is rejected", async () => {
  const { repo } = setup();
  try {
    const world = await autoConnectLiveWorld(repo, sessionFor(), 1000);
    const point = { x: 1, y: 64, z: 2, dimension: dims[0], receivedAt: 1000, generationKey: generationKey(world) };
    const injected = { ...toAccountWorld(world), personal: { ...world.personal, resume: { lastPosition: point } } };
    assert.equal("resume" in parsePlayerProgress({ worlds: [injected] }).worlds[0].personal, false);
    for (const patch of [{ x: Infinity }, { receivedAt: -1 }, { y: null }, { dimension: "" }, { x: GAME_TELEMETRY.coordinateLimit + 1 }])
      assert.throws(() => assertWorldRecord({ ...world, personal: { ...world.personal, resume: { lastPosition: { ...point, ...patch } } } }));
    assert.throws(() => parseWorldDeviceState({ id: accountDeviceStateKey("a"), schemaVersion: 1, selectionId: null, worlds: [null] }, "a"));
    assert.throws(() => parseWorldDeviceState({ id: accountDeviceStateKey("a"), schemaVersion: 1, selectionId: null, worlds: [] }, "b"));
  } finally { repo.close(); }
});
await check("tracking status distinguishes storage failure, reconnecting, waiting and world selection", async () => {
  const { repo } = setup();
  try {
    const snapshot = await repo.snapshot(), session = sessionFor();
    const status = (s, at = 1000, error = false) => worldTrackingStatus(snapshot, s, at, 3000, error);
    assert.equal(status(null), "offline"); assert.equal(status(null, 1000, true), "storageError");
    assert.equal(status({ ...session, issue: "provider-error" }), "reconnecting");
    assert.equal(status(session, 4001), "reconnecting");
    assert.equal(status({ ...session, inWorld: false }), "waiting");
    assert.equal(status(session), "connectingWorld");
    assert.equal(status({ ...session, worldSeed: null }), "readingWorld");
    assert.equal(status({ ...session, identity: { ...session.identity, realmId: "realm" } }), "chooseWorld");
    await autoConnectLiveWorld(repo, session, 1000);
    assert.equal(worldTrackingStatus(await repo.snapshot(), session, 1000, 3000, false), "live");
    await repo.create(draft(undefined, "99"));
    assert.equal(worldTrackingStatus(await repo.snapshot(), session, 1000, 3000, false), "chooseWorld");
  } finally { repo.close(); }
});
for (const edition of GAME_EDITIONS) {
  await check(`${edition.id}: duplicate legacy maps reconnect deterministically and preserve personal data`, async () => {
    const { repo } = setup();
    const session = sessionFor(edition, { localWorldId: "a".repeat(64) });
    try {
      const input = { ...draft(edition), name: session.identity.worldName };
      const a = await repo.create(input), b = await repo.create(input);
      await repo.updatePersonal(a.id, p => ({ ...p, notes: { base: "First base" } }));
      await repo.updatePersonal(b.id, p => ({ ...p, notes: { base: "Second base" } }));
      let snapshot = await repo.snapshot();
      assert.equal(matchLiveWorld(snapshot, session).world.id, b.id, "Prefer the selected matching record");
      snapshot = { ...snapshot, selection: { ...snapshot.selection, worldId: null },
        worlds: snapshot.worlds.map(w => ({ ...w, lastOpenedAt: w.id === a.id ? 2000 : 1000 })) };
      assert.equal(matchLiveWorld(snapshot, session).world.id, a.id, "Prefer the most recently opened record");
      const tied = { ...snapshot, worlds: snapshot.worlds.map(w => ({ ...w, lastOpenedAt: 1000 })) };
      assert.equal(matchLiveWorld(tied, session).world.id,
        matchLiveWorld({ ...tied, worlds: [...tied.worlds].reverse() }, session).world.id);
      await repo.create(draft(edition, "99"));
      snapshot = await repo.snapshot();
      assert.equal(worldTrackingStatus(snapshot, session, 1000, 3000, false), "connectingWorld");
      const before = snapshot.worlds.map(w => [w.id, w.personal]);
      const connected = await autoConnectLiveWorld(repo, session, 1000);
      assert.equal(connected.id, a.id);
      assert.equal(connected.association.sourceId, session.localWorldId);
      assert.equal((await repo.snapshot()).worlds.length, 3);
      for (const [id, personal] of before) assert.deepEqual((await repo.get(id)).personal, personal);
      assert.equal(worldTrackingStatus(await repo.snapshot(), session, 1000, 3000, false), "live");
      await repo.select(b.id);
      assert.equal((await autoConnectLiveWorld(repo, { ...session, id: "rejoined" }, 1001)).id, a.id);
    } finally { repo.close(); }
  });
  await check(`${edition.id}: conflicting legacy generation settings require selection instead of waiting for seed`, async () => {
    const { repo } = setup();
    const session = sessionFor(edition);
    try {
      const input = { ...draft(edition), name: session.identity.worldName };
      await repo.create(input);
      await repo.create({ ...input, generation: { ...input.generation, settings: { alternate: true } } });
      const snapshot = await repo.snapshot();
      assert.equal(matchLiveWorld(snapshot, session).kind, "ambiguous");
      assert.equal(worldTrackingStatus(snapshot, session, 1000, 3000, false), "chooseWorld");
      assert.equal(await autoConnectLiveWorld(repo, session), null);
      assert.deepEqual(await repo.snapshot(), snapshot);
      assert.equal(matchLiveWorld(snapshot, { ...session, worldSeed: null }).kind, "unknown");
      assert.equal(matchLiveWorld(snapshot, { ...session, identity: { ...session.identity, server: "remote" } }).kind, "unknown");
    } finally { repo.close(); }
  });
}
await check("tracking notices stay quiet before world entry and during automatic loading", () => {
  const session = sessionFor();
  const statuses = ["offline", "waiting", "readingWorld", "connectingWorld", "live", "chooseWorld", "storageError", "reconnecting"];
  for (const status of statuses) {
    assert.equal(worldTrackingNotice(status, null), null);
    assert.equal(worldTrackingNotice(status, { ...session, inWorld: false }), null);
    assert.equal(worldTrackingNotice(status, { ...session, connected: false }), null);
  }
  for (const status of ["offline", "waiting", "readingWorld", "connectingWorld", "live"])
    assert.equal(worldTrackingNotice(status, session), null);
  assert.equal(worldTrackingNotice("reconnecting", { ...session, registered: false, position: null }), null);
  for (const status of ["chooseWorld", "storageError", "reconnecting"])
    assert.equal(worldTrackingNotice(status, session), status);
  assert.equal(worldTrackingNotice("reconnecting", { ...session, registered: false }), "reconnecting");
});
await check("stationary motion refreshes verification timestamps without starting an animation", () => {
  let animations = 0;
  const player = { worldId: "world", sessionKey: "session", dimension: dims[0], x: 0, y: 64, z: 0,
    yaw: 90, receivedAt: 1000, expiresAt: 4000, facingExpiresAt: null };
  const motion = createSmoothedWorldMapPlayer(player, () => 0, () => { animations++; return () => {}; });
  motion.setTarget({ ...player, receivedAt: 3000, expiresAt: 6000 });
  assert.equal(motion.getSnapshot().expiresAt, 6000); assert.equal(animations, 0); motion.dispose();
});

console.log(`${checks} tracking recovery checks passed (synthetic provider and isolated storage).`);
