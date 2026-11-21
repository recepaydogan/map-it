import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { GAME_EDITIONS, GAME_TELEMETRY } from "../src/game-config.ts";
import { parseSeedInput, randomSeed } from "../src/features/worlds/seed-value.ts";
import { createWorldRepository } from "../src/features/worlds/world-repository.ts";
import { defaultDimensionView, emptyPersonalState, generationKey, pointReference } from "../src/features/worlds/world-types.ts";
import { saveDimensionView, savePointNote, togglePointState, putWorldPin,
  removeWorldPin, setTrackedDestination, TRACKED_DESTINATION_LIMIT } from "../src/features/worlds/world-personal-actions.ts";
import { candidateWorlds, confirmSessionWorld, resolveBoundSession, sessionAssociation } from "../src/features/worlds/world-session-binding.ts";
import { parseWorldBinding } from "../src/features/worlds/world-binding-validation.ts";
import { createGameSession } from "../src/features/game-session/session-types.ts";
import { createWorldLibraryController } from "../src/features/worlds/world-library-controller.ts";
import { createPortalPlanRecords, projectPortalDestination,
  samePortalPlan } from "../src/features/worlds/world-portal-projection.ts";
import { saveCurrentPositionPin } from "../src/features/worlds/world-current-position-pin.ts";
import { autoConnectLiveWorld } from "../src/features/worlds/auto-connect-live-world.ts";
import { bindSelectedServerWorld } from "../src/features/worlds/bind-selected-server-world.ts";
import { resolveWorldMapPlayer } from "../src/features/worlds/world-map-player.ts";
import { latestWorldVersion } from "../src/features/worlds/supported-world-version.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const draft = (name = "World", edition = GAME_EDITIONS[0].id) => ({
  name, edition, generation: { version: "fixture-version", seed: "9223372036854775807", preset: "default", settings: {} },
});
const setup = () => {
  const factory = new IDBFactory();
  let tick = 1000;
  let sequence = 0;
  let commits = 0;
  const options = { factory, name: "world-test", now: () => tick,
    newId: () => `world-${++sequence}`, onCommit: () => commits++ };
  return { factory, options, repo: createWorldRepository(options), advance: () => tick++, commits: () => commits };
};
const pin = (id = "pin-one", dimension = "surface") => ({
  id, dimension, name: "Home", x: -20, y: null, z: 40, icon: "home", color: "sage", group: "base", note: "",
});
const liveSession = () => ({
  ...createGameSession("session-one", GAME_EDITIONS[0].gameClassId, GAME_EDITIONS[0].id),
  registered: true, inWorld: true, dimension: "surface", sequence: 1,
  identity: { worldName: "Repeated name", server: null, realmId: null, realmName: null },
  position: { x: 5, y: 70, z: 10, receivedAt: 1000, sequence: 1 },
});

await check("signed seeds round-trip exactly at both bounds and above Number precision", () => {
  for (const seed of ["-9223372036854775808", "9223372036854775807", "9007199254740993", "0"])
    assert.equal(parseSeedInput(seed).value, seed);
  assert.equal(parseSeedInput(" +000123 ").value, "123");
  assert.equal(parseSeedInput("-0000").value, "0");
  for (const seed of ["9223372036854775808", "-9223372036854775809", "9".repeat(10000)])
    assert.equal(parseSeedInput(seed).kind, "out-of-range");
  assert.equal(parseSeedInput("0".repeat(10000) + "1").value, "1");
});
await check("text and empty seeds are not silently reinterpreted or randomized", () => {
  for (const seed of ["snowy world", "1e6", "1.5", "--5"]) {
    assert.equal(parseSeedInput(seed).kind, "text");
    assert.equal(parseSeedInput(seed).input, seed);
  }
  assert.equal(parseSeedInput("  ").kind, "empty");
});
await check("random seed generation covers all signed 64 bits", () => {
  const fill = words => values => { values.set(words); return values; };
  assert.equal(randomSeed(fill([0, 0])), "0");
  assert.equal(randomSeed(fill([0x7fffffff, 0xffffffff])), "9223372036854775807");
  assert.equal(randomSeed(fill([0x80000000, 0])), "-9223372036854775808");
  assert.equal(randomSeed(fill([0xffffffff, 0xffffffff])), "-1");
});
await check("map profile selection uses the newest available release independent of game version", () => {
  assert.equal(latestWorldVersion(["26.45", "1.21.121", "26.51"]), "26.51");
  assert.equal(latestWorldVersion(["26.45", "26.51", "26.52"]), "26.52");
  assert.equal(latestWorldVersion([]), null);
});
await check("the example world is created only for a fresh library and is never recreated", async () => {
  const { repo } = setup();
  const example = await repo.initializeExampleWorld(draft("Example"), "example-world", "example-initialized");
  assert.equal(example.id, "example-world");
  assert.equal((await repo.snapshot()).selection.worldId, example.id);
  await repo.forget(example.id);
  assert.equal(await repo.initializeExampleWorld(draft("Replacement"), "example-world", "example-initialized"), null);
  assert.equal((await repo.snapshot()).worlds.length, 0);
  repo.close();
});
await check("creation persists exact seed, selects atomically, and never deduplicates by name/seed", async () => {
  const { repo, commits } = setup();
  const a = await repo.create(draft());
  const b = await repo.create(draft());
  assert.notEqual(a.id, b.id);
  const snapshot = await repo.snapshot();
  assert.equal(snapshot.worlds.length, 2);
  assert.equal(snapshot.selection.worldId, b.id);
  assert.equal(snapshot.selection.revision, 2);
  assert.equal((await repo.get(a.id)).generation.seed, "9223372036854775807");
  assert.equal(commits(), 2);
  repo.close();
});
await check("a Java world without version telemetry uses the newest map and binds once", async () => {
  const { repo } = setup();
  const session = { ...liveSession(), gameVersion: null, worldSeed: "997539589316821490",
    dimension: "overworld" };
  const world = await autoConnectLiveWorld(repo, session, 2000);
  assert.equal(world.name, "Repeated name");
  assert.deepEqual(world.generation, { version: "26.3", seed: "997539589316821490", preset: "default", settings: {} });
  const snapshot = await repo.snapshot();
  assert.equal(snapshot.worlds.length, 1);
  assert.equal(snapshot.selection.worldId, world.id);
  assert.equal(snapshot.binding.worldId, world.id);
  assert.deepEqual((await repo.get(world.id)).association, { kind: "local", identity: "Repeated name", confirmedAt: 2000 });
  assert.equal((await autoConnectLiveWorld(repo, session, 2001)).id, world.id);
  assert.equal((await repo.snapshot()).worlds.length, 1);
  repo.close();
});
await check("a manually selected server world shows the live player without a provider seed", async () => {
  const { repo } = setup();
  const session = { ...liveSession(), worldSeed: null, dimension: "overworld",
    identity: { worldName: null, server: "example.server.test", realmId: null, realmName: null } };
  const world = await repo.create(draft("Manual server world"));
  assert.equal(await bindSelectedServerWorld(repo, world, session, 2000), true);
  const snapshot = await repo.snapshot();
  assert.equal(snapshot.binding.worldId, world.id);
  assert.deepEqual((await repo.get(world.id)).association,
    { kind: "server", identity: "example.server.test", confirmedAt: 2000 });
  assert.equal(resolveWorldMapPlayer(world, { session, error: null }, snapshot.binding,
    2000, GAME_TELEMETRY.staleAfterMs, ["overworld"], GAME_TELEMETRY.coordinateLimit)?.x, 5);
  assert.equal(await bindSelectedServerWorld(repo, world, { ...session, worldSeed: "42" }, 2001), false);
  repo.close();
});
await check("an older Java game release still connects to the newest map profile", async () => {
  const { repo } = setup();
  const session = { ...liveSession(), gameVersion: "1.18.2", worldSeed: "997539589316821490" };
  const world = await autoConnectLiveWorld(repo, session, 2000);
  assert.equal(world.generation.version, "26.3");
  assert.equal(session.gameVersion, "1.18.2");
  assert.equal((await repo.snapshot()).binding.worldId, world.id);
  repo.close();
});
await check("a newer Bedrock save uses the newest available map profile and retains its real version", async () => {
  const { repo } = setup();
  const edition = GAME_EDITIONS.find(item => item.id === "bedrock");
  const session = {
    ...createGameSession("bedrock-session", edition.gameClassId, edition.id),
    registered: true, inWorld: true, gameVersion: "26.52", worldSeed: "1143653337750952406", worldDisplayName: "Dünyam",
    dimension: "overworld", sequence: 1,
    identity: { worldName: "YLKAXVZeQIM=", server: null, realmId: null, realmName: null },
    position: { x: 24, y: 73, z: -31, receivedAt: 1000, sequence: 1 },
  };
  const world = await autoConnectLiveWorld(repo, session, 2000);
  assert.equal(session.gameVersion, "26.52");
  assert.equal(world.name, "Dünyam");
  assert.equal(world.edition, "bedrock");
  assert.deepEqual(world.generation, { version: "26.52", seed: "1143653337750952406", preset: "default", settings: {} });
  const snapshot = await repo.snapshot();
  assert.equal(snapshot.selection.worldId, world.id);
  assert.equal(snapshot.binding.worldId, world.id);
  assert.deepEqual((await repo.get(world.id)).association, { kind: "local", identity: "YLKAXVZeQIM=", confirmedAt: 2000 });
  repo.close();
});
await check("a newer map profile updates the same local world and keeps personal data", async () => {
  const { repo } = setup();
  const edition = GAME_EDITIONS.find(item => item.id === "bedrock");
  const session = {
    ...createGameSession("bedrock-session", edition.gameClassId, edition.id),
    registered: true, inWorld: true, gameVersion: "26.45", worldSeed: "1143653337750952406",
    identity: { worldName: "YLKAXVZeQIM=", server: null, realmId: null, realmName: null },
  };
  const old = await repo.create({ name: "Existing world", edition: "bedrock",
    generation: { version: "26.45", seed: session.worldSeed, preset: "default", settings: {} } });
  await repo.setAssociation(old.id, { kind: "local", identity: session.identity.worldName, confirmedAt: 2000 });
  await repo.updatePersonal(old.id, personal => putWorldPin(personal, pin("pin-one", "overworld")));
  const updated = await autoConnectLiveWorld(repo, session, 2001);
  assert.equal(updated.id, old.id);
  assert.equal(updated.generation.version, "26.52");
  assert.equal(updated.personal.pins.length, 1);
  const snapshot = await repo.snapshot();
  assert.equal(snapshot.worlds.length, 1);
  assert.equal(snapshot.binding.generationKey, generationKey(updated));
  repo.close();
});
await check("detached creation adds a world without stealing or revising the shared selection", async () => {
  const { repo, advance } = setup();
  const linked = await repo.create(draft("Linked"));
  const before = await repo.snapshot(); advance();
  const preview = await repo.create(draft("Preview"), { select: false });
  const after = await repo.snapshot();
  assert.equal(after.selection.worldId, linked.id);
  assert.equal(after.selection.revision, before.selection.revision);
  assert.equal((await repo.get(linked.id)).lastOpenedAt, linked.lastOpenedAt);
  assert.equal(after.worlds.some(world => world.id === preview.id), true);
  repo.close();
});
await check("library survives repository close/reopen without losing private data", async () => {
  const { repo, options } = setup();
  const world = await repo.create(draft());
  await repo.updatePersonal(world.id, p => putWorldPin(p, pin()));
  repo.close();
  const reopened = createWorldRepository(options);
  assert.equal((await reopened.get(world.id)).personal.pins[0].y, null);
  assert.equal((await reopened.snapshot()).selection.worldId, world.id);
  reopened.close();
});
await check("recency, move-to-bottom, reopening, and favorites have explicit independent behavior", async () => {
  const { repo, advance } = setup();
  const a = await repo.create(draft("A")); advance();
  const b = await repo.create(draft("B")); advance();
  const c = await repo.create(draft("C"));
  const order = async () => (await repo.snapshot()).worlds.map(w => w.name);
  assert.deepEqual(await order(), ["C", "B", "A"]);
  await repo.moveToBottom(c.id);
  await repo.moveToBottom(b.id);
  assert.deepEqual(await order(), ["A", "C", "B"]);
  await repo.setFavorite(b.id, true);
  assert.deepEqual(await order(), ["A", "C", "B"]);
  advance(); await repo.select(c.id);
  assert.deepEqual(await order(), ["C", "A", "B"]);
  assert.equal((await repo.get(b.id)).favorite, true);
  const before = (await repo.snapshot()).selection.revision;
  await repo.select(c.id);
  assert.equal((await repo.snapshot()).selection.revision, before + 1);
  assert.ok(a.id);
  repo.close();
});
await check("concurrent windows preserve every read-modify-write update", async () => {
  const { repo, options } = setup();
  const otherWindow = createWorldRepository(options);
  const world = await repo.create(draft());
  await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? repo : otherWindow)
    .updatePersonal(world.id, p => savePointNote(p, "surface", `point-${i}`, `Note ${i}`))));
  assert.equal(Object.keys((await repo.get(world.id)).personal.notes).length, 30);
  repo.close(); otherWindow.close();
});
await check("worlds and dimensions isolate identical point IDs, camera modes, and filters", async () => {
  const { repo } = setup();
  const a = await repo.create(draft());
  const b = await repo.create(draft());
  await repo.updatePersonal(a.id, p => togglePointState(p, "favorites", "surface", "same-id"));
  await repo.updatePersonal(a.id, p => saveDimensionView(p, "surface", {
    ...defaultDimensionView(), visibleCategories: [], mode: "3d",
    camera3d: { x: 1, y: 70, z: -5, yaw: 30, pitch: 40, distance: 60, cutawayY: 20 },
  }));
  const state = (await repo.get(a.id)).personal;
  assert.deepEqual(state.favorites, [pointReference("surface", "same-id")]);
  assert.equal(state.favorites.includes(pointReference("underground", "same-id")), false);
  assert.equal((await repo.get(b.id)).personal.favorites.length, 0);
  assert.deepEqual(state.views.surface.visibleCategories, []);
  assert.equal(state.views.surface.camera3d.cutawayY, 20);
  assert.equal(state.views.underground, undefined);
  repo.close();
});
await check("removing a pin cleans only its references and tracked target", async () => {
  const { repo } = setup();
  const world = await repo.create(draft());
  await repo.updatePersonal(world.id, p => {
    let next = putWorldPin(p, pin());
    next = savePointNote(next, "surface", "pin-one", "Private note");
    next = togglePointState(next, "favorites", "surface", "pin-one");
    next = togglePointState(next, "found", "underground", "pin-one");
    return setTrackedDestination(next, { ...pin(), label: "Home", pointId: "pin-one" }, true);
  });
  await repo.updatePersonal(world.id, p => removeWorldPin(p, "pin-one"));
  const p = (await repo.get(world.id)).personal;
  assert.equal(p.pins.length, 0); assert.equal(p.tracked.length, 0);
  assert.equal(p.favorites.length, 0); assert.deepEqual(p.notes, {});
  assert.deepEqual(p.found, [pointReference("underground", "pin-one")]);
  repo.close();
});
await check("tracked destination actions preserve multiple targets and enforce the UI resource limit", () => {
  let state = emptyPersonalState();
  for (let index = 0; index < TRACKED_DESTINATION_LIMIT; index++) state = setTrackedDestination(state,
    { id: `target-${index}`, dimension: "surface", label: `Target ${index}`, x: index, y: null, z: -index, pointId: `point-${index}` }, true);
  assert.equal(state.tracked.length, TRACKED_DESTINATION_LIMIT);
  assert.throws(() => setTrackedDestination(state,
    { id: "overflow", dimension: "surface", label: "Overflow", x: 0, y: null, z: 0, pointId: null }, true), /limit/);
  const replaced = setTrackedDestination(state, { ...state.tracked[0], label: "Updated" }, true);
  assert.equal(replaced.tracked.length, TRACKED_DESTINATION_LIMIT); assert.equal(replaced.tracked.at(-1).label, "Updated");
  const removed = setTrackedDestination(replaced, replaced.tracked[0], false);
  assert.equal(removed.tracked.length, TRACKED_DESTINATION_LIMIT - 1);
});
await check("portal projections are edition/version scoped, negative-safe, and never infer Y or End transforms", () => {
  const java = { edition: "java", generation: { version: "1.21.3", seed: "1", preset: "default", settings: {} } };
  const source = { id: "village", dimension: "overworld", label: "Village", x: -1, y: 72, z: 81, pointId: "village" };
  const projection = projectPortalDestination(java, source, "nether");
  assert.ok(projection);
  assert.equal(projection.exactX, -0.125); assert.equal(projection.exactZ, 10.125);
  assert.equal(projection.blockX, -1); assert.equal(projection.blockZ, 10);
  const records = createPortalPlanRecords(projection, "portal-one", "Portal plan: Village");
  assert.equal(records.pin.y, null); assert.equal(records.destination.y, null);
  assert.equal(records.destination.kind, "portal-plan"); assert.equal(records.destination.pointId, records.pin.id);
  assert.equal(samePortalPlan(records.destination, projection), true);
  const reverse = projectPortalDestination(java, { ...source, dimension: "nether", x: -3, z: 5 }, "overworld");
  assert.deepEqual(reverse && [reverse.exactX, reverse.exactZ], [-24, 40]);
  const bedrock = { ...java, edition: "bedrock", generation: { ...java.generation, version: "1.21.120" } };
  assert.equal(projectPortalDestination(bedrock, source, "nether")?.horizontalScale, 1 / 8);
  assert.equal(projectPortalDestination(java, source, "end"), null);
  assert.equal(projectPortalDestination({ ...java, generation: { ...java.generation, version: "unknown" } }, source, "nether"), null);
  assert.equal(projectPortalDestination(java, { ...source, dimension: "nether", x: 4_000_000 }, "overworld"), null);
});
await check("a saved portal plan is one removable pin-backed tracked destination", () => {
  const world = { edition: "java", generation: { version: "1.21.3", seed: "1", preset: "default", settings: {} } };
  const source = { id: "home", dimension: "overworld", label: "Home", x: 80, y: null, z: -9, pointId: null };
  const projection = projectPortalDestination(world, source, "nether");
  assert.ok(projection);
  const records = createPortalPlanRecords(projection, "portal-two", "Portal plan: Home");
  const saved = setTrackedDestination(putWorldPin(emptyPersonalState(), records.pin), records.destination, true);
  assert.equal(saved.pins.length, 1); assert.equal(saved.tracked.length, 1);
  const removed = removeWorldPin(saved, records.pin.id);
  assert.equal(removed.pins.length, 0); assert.equal(removed.tracked.length, 0);
});
await check("forget removes only its app record, selects a survivor, and rejects delayed writes", async () => {
  const { repo } = setup();
  const a = await repo.create(draft("A"));
  const b = await repo.create(draft("B"));
  await repo.updatePersonal(a.id, p => putWorldPin(p, pin()));
  await repo.forget(b.id);
  assert.equal((await repo.snapshot()).selection.worldId, a.id);
  assert.equal((await repo.get(a.id)).personal.pins.length, 1);
  await assert.rejects(repo.updatePersonal(b.id, p => putWorldPin(p, pin())), /no longer exists/);
  await repo.forget(a.id);
  assert.equal((await repo.snapshot()).selection.worldId, null);
  const recreated = await repo.create(draft("A"));
  assert.notEqual(recreated.id, a.id);
  assert.equal(recreated.personal.pins.length, 0);
  repo.close();
});
await check("failed mutation rolls back and does not broadcast a successful commit", async () => {
  const { repo, commits } = setup();
  const world = await repo.create(draft());
  const before = commits();
  await assert.rejects(repo.rename(world.id, "  "), /Invalid world record/);
  await assert.rejects(repo.updatePersonal(world.id, p => ({ ...p, pins: [{ ...pin(), x: Infinity }] })), /Invalid world pins/);
  assert.equal(commits(), before);
  assert.equal((await repo.get(world.id)).name, "World");
  assert.equal((await repo.get(world.id)).personal.pins.length, 0);
  repo.close();
});
await check("incompatible persisted data is reported and never silently reset", async () => {
  const { repo, factory, options } = setup();
  const world = await repo.create(draft());
  const db = await new Promise((resolve, reject) => {
    const req = factory.open(options.name); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("worlds", "readwrite");
    tx.objectStore("worlds").put({ ...world, schemaVersion: 999 });
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
  await assert.rejects(repo.snapshot(), /Invalid world record/);
  await assert.rejects(repo.rename(world.id, "Replacement"), /Invalid world record/);
  db.close(); repo.close();
});
await check("generation cache identity includes edition, exact version, preset, and settings", () => {
  const a = draft();
  const key = generationKey(a);
  assert.notEqual(key, generationKey({ ...a, edition: GAME_EDITIONS[1].id }));
  for (const patch of [{ version: "other" }, { seed: "4" }, { preset: "flat" }, { settings: { caves: true } }])
    assert.notEqual(key, generationKey({ ...a, generation: { ...a.generation, ...patch } }));
  assert.equal(generationKey({ ...a, generation: { ...a.generation, settings: { a: 1, b: 2 } } }),
    generationKey({ ...a, generation: { ...a.generation, settings: { b: 2, a: 1 } } }));
});
await check("live coordinates require explicit world confirmation even for matching names", async () => {
  const { repo } = setup();
  const world = await repo.create(draft());
  const session = liveSession();
  await repo.setAssociation(world.id, { kind: "local", identity: session.identity.worldName, confirmedAt: 1000 });
  const candidates = candidateWorlds((await repo.snapshot()).worlds, session);
  assert.equal(candidates.length, 1);
  assert.equal(resolveBoundSession(world, session, null, 1000, 3000).status, "unassociated");
  const binding = confirmSessionWorld(world, session, 1000);
  assert.equal(resolveBoundSession(world, session, binding, 1000, 3000).status, "live");
  assert.equal(resolveBoundSession(world, session, binding, 4001, 3000).status, "stale");
  repo.close();
});
await check("world changes, resets, new sessions, editions, and generation edits cannot reuse a binding", async () => {
  const { repo } = setup();
  const world = await repo.create(draft());
  const other = await repo.create(draft());
  const session = liveSession();
  const binding = confirmSessionWorld(world, session, 1000);
  assert.equal(resolveBoundSession(other, session, binding, 1000, 3000).status, "different-world");
  for (const patch of [{ id: "new-session" }, { generation: 1 }, { identity: { ...session.identity, server: "new-server" } }])
    assert.equal(resolveBoundSession(world, { ...session, ...patch }, binding, 1000, 3000).status, "unassociated");
  assert.equal(resolveBoundSession({ ...world, generation: { ...world.generation, seed: "10" } }, session, binding, 1000, 3000).status, "unassociated");
  assert.throws(() => confirmSessionWorld({ ...world, edition: GAME_EDITIONS[1].id }, session, 1000), /editions differ/);
  assert.throws(() => confirmSessionWorld(world, { ...session, inWorld: false }, 1000), /unavailable/);
  repo.close();
});

await check("library controller caches snapshots and notifies committed readers", async () => {
  const { repo } = setup();
  const controller = createWorldLibraryController(() => repo.snapshot());
  assert.equal(controller.getSnapshot(), controller.getSnapshot());
  assert.equal(controller.getSnapshot().ready, false);
  let calls = 0;
  const unsubscribe = controller.subscribe(() => calls++);
  await controller.refresh();
  assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().ready, true);
  const world = await repo.create(draft());
  await controller.refresh();
  assert.equal(controller.getSnapshot().data.selection.worldId, world.id);
  unsubscribe();
  await controller.refresh();
  assert.equal(calls, 2);
  repo.close();
});
await check("late library reads cannot restore an obsolete selected world", async () => {
  const reads = [];
  const controller = createWorldLibraryController(() => new Promise(resolve => reads.push(resolve)));
  const old = controller.refresh();
  const current = controller.refresh();
  reads[1]({ worlds: [], selection: { id: "selection", worldId: null, revision: 2 } });
  await current;
  const latest = controller.getSnapshot();
  reads[0]({ worlds: [], selection: { id: "selection", worldId: null, revision: 1 } });
  await old;
  assert.equal(controller.getSnapshot(), latest);
});

await check("binding and optional suggestion commit together across database connections", async () => {
  const { repo, options } = setup();
  const other = createWorldRepository(options);
  const world = await repo.create(draft());
  const initial = await repo.snapshot();
  assert.equal(initial.binding, null);
  const session = liveSession(), binding = confirmSessionWorld(world, session, 1000);
  const hint = sessionAssociation(session, 1000);
  const pending = repo.bindSession(binding, initial.selection.revision, hint);
  binding.sessionId = "caller-mutation"; hint.identity = "caller-mutation";
  const saved = await pending;
  const snapshot = await other.snapshot();
  assert.equal(snapshot.binding.sessionId, session.id);
  assert.equal(snapshot.worlds[0].association.identity, session.identity.worldName);
  assert.equal(resolveBoundSession(world, session, snapshot.binding, 1000, 3000).status, "live");
  saved.sessionId = "returned-object-mutation";
  assert.equal((await repo.snapshot()).binding.sessionId, session.id);
  repo.close(); other.close();
});
await check("delayed confirmation cannot bind after selection changes away and back", async () => {
  const { repo, options, commits } = setup();
  const other = createWorldRepository(options);
  const a = await repo.create(draft("A")), b = await repo.create(draft("B"));
  await repo.select(a.id);
  const initial = await repo.snapshot();
  const binding = confirmSessionWorld(a, liveSession(), 1000);
  await other.select(b.id); await other.select(a.id);
  const before = commits();
  await assert.rejects(repo.bindSession(binding, initial.selection.revision, sessionAssociation(liveSession(), 1000)), /Selected world changed/);
  assert.equal(commits(), before);
  assert.equal((await repo.snapshot()).binding, null);
  assert.equal((await repo.get(a.id)).association, null);
  repo.close(); other.close();
});
await check("wrong generator identity and invalid suggestions cannot partially replace a binding", async () => {
  const { repo, commits } = setup();
  const world = await repo.create(draft());
  const revision = (await repo.snapshot()).selection.revision;
  const binding = confirmSessionWorld(world, liveSession(), 1000);
  await repo.bindSession(binding, revision);
  const before = commits();
  await assert.rejects(repo.bindSession({ ...binding, generationKey: "different-generator" }, revision), /generator changed/);
  await assert.rejects(repo.bindSession({ ...binding, confirmedAt: 1001 }, revision,
    { kind: "local", identity: "", confirmedAt: 1001 }), /Invalid world association/);
  assert.deepEqual((await repo.snapshot()).binding, binding);
  assert.equal((await repo.get(world.id)).association, null);
  assert.equal(commits(), before);
  repo.close();
});
await check("a stale unlink cannot delete another window's newer confirmation", async () => {
  const { repo, options } = setup();
  const other = createWorldRepository(options);
  const world = await repo.create(draft());
  const revision = (await repo.snapshot()).selection.revision;
  const old = confirmSessionWorld(world, liveSession(), 1000);
  const current = confirmSessionWorld(world, { ...liveSession(), id: "session-two" }, 1001);
  await repo.bindSession(old, revision);
  await other.bindSession(current, revision);
  await assert.rejects(repo.clearSessionBinding(old), /changed before unlinking/);
  assert.deepEqual((await repo.snapshot()).binding, current);
  await repo.clearSessionBinding(current);
  assert.equal((await other.snapshot()).binding, null);
  repo.close(); other.close();
});
await check("the current-position hotkey atomically creates one removable exact-Y 2D and 3D marker", async () => {
  const { repo, commits } = setup();
  const world = await repo.create(draft()), session = liveSession();
  const binding = confirmSessionWorld(world, session, 1000);
  await repo.bindSession(binding, (await repo.snapshot()).selection.revision);
  const result = await saveCurrentPositionPin({ repository: repo, session, name: "Current position",
    now: () => 1000, newId: () => "fixed" });
  assert.deepEqual(result, { status: "saved", x: 5, y: 70, z: 10, dimension: "surface" });
  const personal = (await repo.get(world.id)).personal;
  assert.equal(personal.pins.length, 1); assert.equal(personal.tracked.length, 1);
  assert.equal(personal.pins[0].id, "player-pin-fixed"); assert.equal(personal.pins[0].y, 70);
  assert.equal(personal.tracked[0].kind, "player-pin"); assert.equal(personal.tracked[0].y, 70);
  assert.equal(personal.tracked[0].pointId, personal.pins[0].id);
  const staleCommitCount = commits();
  assert.deepEqual(await saveCurrentPositionPin({ repository: repo, session, name: "Current position",
    now: () => 1000 + GAME_TELEMETRY.staleAfterMs + 1 }), { status: "unavailable" });
  assert.equal(commits(), staleCommitCount);
  await repo.updatePersonal(world.id, state => {
    let next = state;
    for (let index = next.tracked.length; index < TRACKED_DESTINATION_LIMIT; index++) next = setTrackedDestination(next,
      { id: `fill-${index}`, dimension: "surface", label: `Fill ${index}`, x: index, y: null, z: index, pointId: null }, true);
    return next;
  });
  const limitCommitCount = commits();
  assert.deepEqual(await saveCurrentPositionPin({ repository: repo, session, name: "Current position",
    now: () => 1000, newId: () => "overflow" }), { status: "limit" });
  assert.equal(commits(), limitCommitCount);
  assert.equal((await repo.get(world.id)).personal.pins.length, 1);
  repo.close();
});
await check("a concurrent world rebind rejects a delayed session-originated personal write", async () => {
  const { repo, options, commits } = setup();
  const other = createWorldRepository(options);
  const world = await repo.create(draft()), session = liveSession();
  const revision = (await repo.snapshot()).selection.revision;
  const original = confirmSessionWorld(world, session, 1000);
  const replacement = confirmSessionWorld(world, { ...session, id: "replacement-session" }, 1001);
  await repo.bindSession(original, revision);
  await other.bindSession(replacement, revision);
  const before = commits();
  await assert.rejects(repo.updateBoundPersonal(original, state => putWorldPin(state, pin("late-pin"))), /binding changed/i);
  assert.equal(commits(), before);
  assert.equal((await repo.get(world.id)).personal.pins.length, 0);
  assert.deepEqual((await repo.snapshot()).binding, replacement);
  repo.close(); other.close();
});
await check("forgetting only removes the forgotten world's session binding", async () => {
  const { repo } = setup();
  const unrelated = await repo.create(draft("Other")), world = await repo.create(draft());
  const binding = confirmSessionWorld(world, liveSession(), 1000);
  await repo.bindSession(binding, (await repo.snapshot()).selection.revision);
  await repo.forget(unrelated.id);
  assert.deepEqual((await repo.snapshot()).binding, binding);
  await repo.forget(world.id);
  assert.equal((await repo.snapshot()).binding, null);
  repo.close();
});
await check("normal movement and dimension changes reuse confirmation but never stale coordinates", async () => {
  const { repo } = setup();
  const world = await repo.create(draft()), session = liveSession();
  const binding = confirmSessionWorld(world, session, 1000);
  const moved = { ...session, sequence: 2, position: { ...session.position, x: 99, sequence: 2, receivedAt: 2000 } };
  assert.equal(resolveBoundSession(world, moved, binding, 2000, 3000).session.position.x, 99);
  assert.equal(resolveBoundSession(world, { ...moved, dimension: "underground", position: null }, binding, 2000, 3000).status, "waiting");
  assert.equal(resolveBoundSession(world, { ...moved, dimension: "underground" }, binding, 2000, 3000).status, "live");
  assert.equal(resolveBoundSession(world, moved, binding, 1999, 3000).session, null);
  repo.close();
});
await check("binding boundary rejects malformed records and strips unrelated fields", async () => {
  const { repo } = setup();
  const world = await repo.create(draft());
  const binding = confirmSessionWorld(world, liveSession(), 1000);
  assert.deepEqual(parseWorldBinding({ ...binding, secret: "discard" }), binding);
  for (const patch of [{ worldId: "" }, { sessionId: 5 }, { sessionGeneration: -1 }, { confirmedAt: Infinity },
    { generationKey: " " }, { sessionIdentity: "x".repeat(4097) }])
    assert.throws(() => parseWorldBinding({ ...binding, ...patch }), /Invalid world session binding/);
  repo.close();
});

console.log(`${checks} world checks passed.`);
