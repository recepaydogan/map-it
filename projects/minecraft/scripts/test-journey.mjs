import assert from "node:assert/strict";
import { createGameSession } from "../src/features/game-session/session-types.ts";
import { createBackgroundJourneyRecorder } from "../src/features/journey/background-journey-recorder.ts";
import { journeyDimensionTransitions, otherSideOfJourneyTransition,
  visibleJourneyTransitions } from "../src/features/journey/journey-dimension-transitions.ts";
import { isJourneyLongEnough, journeyDistance } from "../src/features/journey/journey-distance.ts";
import { mergeObservedPortals, observedJourneyPortals } from "../src/features/journey/journey-observed-portals.ts";
import { projectJourney } from "../src/features/journey/journey-projection.ts";
import { correctedJourneyRoute } from "../src/features/journey/journey-route-cleanup.ts";
import { journeyTerrainPaths } from "../src/features/journey/journey-terrain-paths.ts";
import { createJourneyStorage, JOURNEY_CAPTURE_RULES } from "../src/features/journey/journey-storage.ts";
import { captureJourneySample, emptyJourneyData, emptyJourneyPreferences, finalizeJourney,
  interruptJourney, parseJourneyData, parseJourneyPreferences } from "../src/features/journey/journey-state.ts";
import { confirmSessionWorld } from "../src/features/worlds/world-session-binding.ts";
import { removeObservedPortal } from "../src/features/worlds/world-personal-actions.ts";
import { emptyPersonalState } from "../src/features/worlds/world-types.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const worldId = "world-one";
const enabled = { ...emptyJourneyPreferences(worldId, 1), enabled: true };
const sample = (at, x, dimension = "overworld", sessionKey = "session") =>
  ({ worldId, sessionKey, dimension, x, y: 64, z: 0, at });

await check("legacy journey visibility migrates to the visible default", () => {
  const migrated = parseJourneyPreferences({ schemaVersion: 1, worldId, enabled: true,
    visible: false, clearRevision: 0, updatedAt: 1 }, worldId);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.visible, true);
});

await check("journey list requires 200 recorded blocks and ignores gaps between segments", () => {
  const journey = { segments: [
    { points: [{ x: 0, y: 64, z: 0 }, { x: 199, y: 64, z: 0 }] },
    { points: [{ x: 10_000, y: 64, z: 0 }] },
  ] };
  assert.equal(journeyDistance(journey), 199);
  assert.equal(isJourneyLongEnough(journey), false);
  journey.segments[0].points[1].x = 200;
  assert.equal(isJourneyLongEnough(journey), true);
});

await check("journey sampling skips noise and separates gaps, dimensions and teleports", () => {
  let nextId = 0, data = emptyJourneyData(worldId, 0, 1);
  data = captureJourneySample(data, enabled, sample(1_000, 0), JOURNEY_CAPTURE_RULES, () => `journey-${++nextId}`);
  const first = data;
  data = captureJourneySample(data, enabled, sample(2_000, 0.1), JOURNEY_CAPTURE_RULES, () => "unused");
  assert.equal(data, first);
  data = captureJourneySample(data, enabled, sample(2_000, 2), JOURNEY_CAPTURE_RULES, () => "unused");
  assert.equal(data.active.segments[0].points.length, 2);
  data = interruptJourney(data, 2_500, false);
  data = captureJourneySample(data, enabled, sample(3_000, 3), JOURNEY_CAPTURE_RULES, () => "unused");
  data = captureJourneySample(data, enabled, sample(9_000, 4), JOURNEY_CAPTURE_RULES, () => "unused");
  data = captureJourneySample(data, enabled, sample(10_000, 5, "nether"), JOURNEY_CAPTURE_RULES, () => "unused");
  data = captureJourneySample(data, enabled, sample(11_000, 500, "nether"), JOURNEY_CAPTURE_RULES, () => "unused");
  assert.deepEqual(data.active.segments.map(segment => [segment.dimension, segment.points.length]),
    [["overworld", 2], ["overworld", 1], ["overworld", 1], ["nether", 1], ["nether", 1]]);
  const done = finalizeJourney(data, 12_000);
  assert.equal(done.active, null); assert.equal(done.journeys[0].endedAt, 12_000); assert.equal(done.journeys[0].pendingBreak, false);
});

await check("journey sampling retains biome transitions even without meaningful movement", () => {
  let data = emptyJourneyData(worldId);
  data = captureJourneySample(data, enabled, { ...sample(1_000, 0), biome: "plains" }, JOURNEY_CAPTURE_RULES, () => "biomes");
  data = captureJourneySample(data, enabled, { ...sample(2_000, 0.1), biome: "forest" }, JOURNEY_CAPTURE_RULES, () => "unused");
  assert.deepEqual(data.active.segments[0].points.map(point => point.biome), ["plains", "forest"]);
  assert.deepEqual(parseJourneyData(data, worldId, JOURNEY_CAPTURE_RULES).active.segments[0].points.map(point => point.biome), ["plains", "forest"]);
});

await check("repeated dimension crossings retain distinct departure and arrival coordinates", () => {
  let data = captureJourneySample(emptyJourneyData(worldId), enabled, sample(1_000, 0), JOURNEY_CAPTURE_RULES, () => "crossings");
  data = captureJourneySample(data, enabled, { ...sample(1_050, 80), force: true }, JOURNEY_CAPTURE_RULES, () => "unused");
  data = captureJourneySample(data, enabled, sample(1_100, 10, "nether"), JOURNEY_CAPTURE_RULES, () => "unused");
  const view = { x: 10, z: 0, width: 400, height: 300, zoom: 1 };
  assert.deepEqual(visibleJourneyTransitions(data.active, "nether", view).map(marker =>
    [marker.side, marker.position.x, marker.position.y]), [["arrival", 200, 150]]);
  assert.deepEqual(visibleJourneyTransitions(data.active, "overworld", { ...view, x: 80 }).map(marker =>
    [marker.side, marker.position.x, marker.position.y]), [["departure", 200, 150]]);
  data = captureJourneySample(data, enabled, { ...sample(1_150, 30, "nether"), force: true }, JOURNEY_CAPTURE_RULES, () => "unused");
  data = captureJourneySample(data, enabled, sample(1_200, 250), JOURNEY_CAPTURE_RULES, () => "unused");
  data = captureJourneySample(data, enabled, { ...sample(1_250, 260), force: true }, JOURNEY_CAPTURE_RULES, () => "unused");
  data = captureJourneySample(data, enabled, sample(1_300, 40, "nether"), JOURNEY_CAPTURE_RULES, () => "unused");
  const crossings = journeyDimensionTransitions(data.active);
  assert.equal(otherSideOfJourneyTransition(crossings[0], "departure").point.x, 10);
  assert.equal(otherSideOfJourneyTransition(crossings[0], "arrival").point.x, 80);
  assert.deepEqual(crossings.map(crossing => [crossing.from.dimension, crossing.from.point.x,
    crossing.to.dimension, crossing.to.point.x]), [
    ["overworld", 80, "nether", 10], ["nether", 30, "overworld", 250], ["overworld", 260, "nether", 40],
  ]);
  assert.equal(data.active.segments.at(-1).dimension, "nether");
  assert.equal(parseJourneyData(finalizeJourney(data, 1_400), worldId, JOURNEY_CAPTURE_RULES).journeys[0].segments.length, 4);
});

await check("a second Nether exit creates a separate linked portal pair", () => {
  const journey = { id: "two-portals", worldId, sessionKey: "session", startedAt: 1_000, endedAt: 6_000,
    pendingBreak: false, truncated: false, segments: [
      { dimension: "overworld", points: [{ x: 80, y: 64, z: 0, at: 1_000 }] },
      { dimension: "nether", points: [{ x: 10, y: 64, z: 0, at: 2_000 }, { x: 100, y: 64, z: 0, at: 3_000 }] },
      { dimension: "overworld", points: [{ x: 800, y: 64, z: 0, at: 4_000 }] },
      { dimension: "nether", points: [{ x: 100, y: 64, z: 0, at: 5_000 }] },
    ] };
  const rules = [
    { sourceDimension: "overworld", targetDimension: "nether", horizontalScale: 1 / 8 },
    { sourceDimension: "nether", targetDimension: "overworld", horizontalScale: 8 },
  ];
  const links = observedJourneyPortals([journey], rules, 20_000, 32, 8);
  assert.equal(links.length, 2);
  assert.deepEqual(links.map(link => [link.transition.from.point.x, link.transition.to.point.x]), [[80, 10], [100, 800]]);
  const mismatched = { ...journey, id: "wrong-crossing", segments: [journey.segments[0],
    { dimension: "nether", points: [{ x: 200, y: 64, z: 0, at: 2_000 }] }] };
  assert.deepEqual(observedJourneyPortals([mismatched], rules, 20_000, 32, 8), []);
  const saved = mergeObservedPortals(links.slice(0, 1), links.slice(1), 8);
  assert.equal(saved.length, 2);
  const stale = { id: "old-wrong-position", transition: { ...links[0].transition,
    from: { ...links[0].transition.from, point: { ...links[0].transition.from.point, x: 10 } } } };
  assert.deepEqual(mergeObservedPortals([stale], links.slice(0, 1), 8), links.slice(0, 1));
});

await check("a destination coordinate arriving early does not replace the Overworld portal position", () => {
  const journey = { id: "early-location", worldId, sessionKey: "session", startedAt: 1_000, endedAt: 1_300,
    pendingBreak: false, truncated: false, segments: [
      { dimension: "overworld", points: [{ x: 80, y: 64, z: 0, at: 1_000 }, { x: 10, y: 64, z: 0, at: 1_100 }] },
      { dimension: "nether", points: [{ x: 10, y: 64, z: 0, at: 1_200 }] },
    ] };
  const links = observedJourneyPortals([journey], [
    { sourceDimension: "overworld", targetDimension: "nether", horizontalScale: 1 / 8 },
  ], 20_000, 32, 8);
  assert.equal(links.length, 1);
  assert.equal(links[0].transition.from.point.x, 80);
  const ambiguous = { ...journey, segments: [
    { dimension: "overworld", points: [{ x: 10, y: 64, z: 0, at: 1_100 }] }, journey.segments[1],
  ] };
  assert.deepEqual(observedJourneyPortals([ambiguous], [
    { sourceDimension: "overworld", targetDimension: "nether", horizontalScale: 1 / 8 },
  ], 20_000, 32, 8), []);
});

await check("a destination coordinate labeled as Overworld does not draw a false route leg", () => {
  const journey = { id: "leaked-route", worldId, sessionKey: "session", startedAt: 900, endedAt: 1_300,
    endReason: "session-ended", pendingBreak: false, truncated: false, segments: [
      { dimension: "overworld", points: [
        { x: 0, y: 64, z: 0, at: 900 }, { x: 80, y: 64, z: 0, at: 1_000 },
        { x: 10, y: 64, z: 0, at: 1_100 },
      ] },
      { dimension: "nether", points: [{ x: 10, y: 64, z: 0, at: 1_200 }] },
    ] };
  const corrected = correctedJourneyRoute(journey, 20_000);
  assert.deepEqual(corrected.segments[0].points.map(point => point.x), [0, 80]);
  assert.equal(journeyDistance(journey), 80);
  assert.deepEqual(projectJourney(journey, "overworld", { x: 0, z: 0, width: 400, height: 300, zoom: 1 }).paths,
    projectJourney(corrected, "overworld", { x: 0, z: 0, width: 400, height: 300, zoom: 1 }).paths);
  const read = { preferences: { visible: true, enabled: true }, data: { active: journey, journeys: [] } };
  assert.deepEqual(journeyTerrainPaths(read, "overworld", null), [[[0, 64, 0], [80, 64, 0]]]);
});

await check("removing a portal prevents the journey from recreating that marker", () => {
  const portal = { id: "recorded-portal", transition: { index: 0,
    from: { dimension: "overworld", point: { x: 80, y: 64, z: 0, at: 1_000 } },
    to: { dimension: "nether", point: { x: 10, y: 64, z: 0, at: 1_100 } },
  } };
  const personal = removeObservedPortal({ ...emptyPersonalState(), portals: [portal] }, portal);
  assert.deepEqual(personal.portals, []);
  assert.equal(personal.removedPortals[0].id, portal.id);
  assert.deepEqual(mergeObservedPortals(personal.portals, [{ ...portal, id: "same-portal-new-journey" }],
    8, personal.removedPortals), []);
});

await check("session replacement completes the prior journey before starting the next", () => {
  let data = captureJourneySample(emptyJourneyData(worldId), enabled, sample(1_000, 0), JOURNEY_CAPTURE_RULES, () => "first");
  data = captureJourneySample(data, enabled, sample(2_000, 1, "overworld", "replacement"), JOURNEY_CAPTURE_RULES, () => "second");
  assert.equal(data.journeys[0].id, "first"); assert.equal(data.journeys[0].endedAt, 2_000);
  assert.equal(data.active.id, "second"); assert.equal(data.active.sessionKey, "replacement");
});

await check("completed journeys are archived newest-first with their outcome", () => {
  let data = emptyJourneyData(worldId);
  data = captureJourneySample(data, enabled, sample(1_000, 0, "overworld", "first-session"), JOURNEY_CAPTURE_RULES, () => "first");
  data = finalizeJourney(data, 2_000, "session-ended");
  data = captureJourneySample(data, enabled, sample(3_000, 10, "overworld", "second-session"), JOURNEY_CAPTURE_RULES, () => "second");
  data = finalizeJourney(data, 4_000, "death");
  assert.deepEqual(data.journeys.map(journey => [journey.id, journey.endReason]), [["second", "death"], ["first", "session-ended"]]);
  const parsed = parseJourneyData(data, worldId, JOURNEY_CAPTURE_RULES);
  assert.deepEqual(parsed.journeys.map(journey => journey.id), ["second", "first"]);
});

await check("legacy latest-journey storage migrates into history", () => {
  let data = captureJourneySample(emptyJourneyData(worldId), enabled, sample(1_000, 0), JOURNEY_CAPTURE_RULES, () => "legacy");
  data = finalizeJourney(data, 2_000);
  const legacy = { ...data, schemaVersion: 1, latest: data.journeys[0] };
  delete legacy.journeys;
  const parsed = parseJourneyData(legacy, worldId, JOURNEY_CAPTURE_RULES);
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.journeys[0].id, "legacy");
});

await check("journey retention trims oldest points and segments without joining them", () => {
  const rules = { ...JOURNEY_CAPTURE_RULES, sampleIntervalMs: 1, minimumDistance: 0.01, gapAfterMs: 10,
    maxPoints: 3, maxSegments: 2 };
  let data = emptyJourneyData(worldId);
  for (let index = 0; index < 6; index++) data = captureJourneySample(data, enabled, sample(1_000 + index * 20, index), rules, () => "bounded");
  assert.equal(data.active.truncated, true);
  assert(data.active.segments.length <= 2);
  assert(data.active.segments.reduce((sum, segment) => sum + segment.points.length, 0) <= 3);
  assert.equal(data.active.segments.at(-1).points.at(-1).x, 5);
});

await check("journey validation owns data and rejects corrupt chronology or coordinates", () => {
  let data = captureJourneySample(emptyJourneyData(worldId), enabled, sample(1_000, 0), JOURNEY_CAPTURE_RULES, () => "owned");
  data = captureJourneySample(data, enabled, sample(2_000, 2), JOURNEY_CAPTURE_RULES, () => "unused");
  const parsed = parseJourneyData(data, worldId, JOURNEY_CAPTURE_RULES);
  data.active.segments[0].points[0].x = 99;
  assert.equal(parsed.active.segments[0].points[0].x, 0);
  const backwards = structuredClone(parsed); backwards.active.segments[0].points[1].at = 500;
  assert.throws(() => parseJourneyData(backwards, worldId, JOURNEY_CAPTURE_RULES));
  const outside = structuredClone(parsed); outside.active.segments[0].points[0].x = 30_000_001;
  assert.throws(() => parseJourneyData(outside, worldId, JOURNEY_CAPTURE_RULES));
});

await check("journey storage isolates preferences, data, clearing and malformed records", () => {
  const values = new Map(), memory = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let now = 10;
  const storage = createJourneyStorage({ storage: memory, events: new EventTarget(), prefix: "fixture", now: () => now });
  let read = storage.read(worldId); assert.equal(read.preferences.enabled, true); assert.equal(read.preferences.visible, true);
  storage.setEnabled(worldId, true); storage.setVisible(worldId, true);
  read = storage.read(worldId); assert.equal(read.preferences.enabled, true); assert.equal(read.preferences.visible, true);
  const active = captureJourneySample(read.data, read.preferences, sample(1_000, 0), JOURNEY_CAPTURE_RULES, () => "stored");
  storage.writeData(active); assert.equal(storage.read(worldId).data.active.id, "stored");
  now = 20; storage.clear(worldId); read = storage.read(worldId);
  assert.equal(read.data.active, null); assert.equal(read.preferences.enabled, true); assert.equal(read.preferences.visible, true);
  const dataKey = [...values.keys()].find(key => key.includes(":data:")); values.set(dataKey, "{bad");
  assert.equal(storage.read(worldId).error, "invalid-data");
  storage.remove(worldId); assert.equal(storage.read(worldId).error, null);
});

await check("deleting one completed journey preserves the active route and records a tombstone", () => {
  const values = new Map(), memory = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const storage = createJourneyStorage({ storage: memory, prefix: "delete-fixture", now: () => 10_000 });
  let data = emptyJourneyData(worldId);
  data = captureJourneySample(data, enabled, sample(1_000, 0), JOURNEY_CAPTURE_RULES, () => "first");
  data = finalizeJourney(data, 1_100);
  data = captureJourneySample(data, enabled, sample(2_000, 0), JOURNEY_CAPTURE_RULES, () => "second");
  data = finalizeJourney(data, 2_100);
  data = captureJourneySample(data, enabled, sample(3_000, 0), JOURNEY_CAPTURE_RULES, () => "active");
  storage.writeData(data);
  assert.equal(storage.deleteJourney(worldId, "first"), true);
  const read = storage.read(worldId).data;
  assert.deepEqual(read.journeys.map(journey => journey.id), ["second"]);
  assert.equal(read.active.id, "active");
  assert.deepEqual(read.deletedJourneyIds, ["first"]);
  assert.equal(storage.deleteJourney(worldId, "active"), false);
  assert.equal(storage.deleteJourney(worldId, "first"), false);
  const oldData = { ...read }; delete oldData.deletedJourneyIds;
  assert.deepEqual(parseJourneyData(oldData, worldId, JOURNEY_CAPTURE_RULES).deletedJourneyIds, []);
});

await check("journey projection clips huge coordinates and never bridges dimensions", () => {
  const journey = { id: "route", worldId, sessionKey: "session", startedAt: 1, endedAt: 4, pendingBreak: false,
    truncated: false, segments: [
      { dimension: "overworld", points: [{ x: -1_000_000, y: 64, z: 0, at: 1 }, { x: 0, y: 64, z: 0, at: 2 }, { x: 1_000_000, y: 64, z: 0, at: 3 }] },
      { dimension: "nether", points: [{ x: 0, y: 64, z: 0, at: 4 }] },
    ] };
  const result = projectJourney(journey, "overworld", { x: 0, z: 0, width: 200, height: 100, zoom: 1 });
  assert.equal(result.paths.length, 1); assert(result.paths[0].every(([x, y]) => x >= -12 && x <= 212 && y >= -12 && y <= 112));
  assert.equal(result.endpoint, null);
  assert.deepEqual(projectJourney(journey, "nether", { x: 0, z: 0, width: 200, height: 100, zoom: 1 }).paths, []);
});

await check("3D journey paths retain exact altitude and split at the active cutaway", () => {
  const route = { id: "route-3d", worldId, sessionKey: "session", startedAt: 1, endedAt: 5, pendingBreak: false,
    truncated: false, segments: [
      { dimension: "overworld", points: [{ x: 0, y: 60, z: 0, at: 1 }, { x: 10, y: 70, z: 0, at: 2 },
        { x: 20, y: 60, z: 0, at: 3 }] },
      { dimension: "nether", points: [{ x: 0, y: 40, z: 0, at: 4 }, { x: 2, y: 40, z: 2, at: 5 }] },
    ] };
  const read = { preferences: { ...enabled, visible: true }, data: { ...emptyJourneyData(worldId), journeys: [route] }, error: null };
  assert.deepEqual(journeyTerrainPaths(read, "overworld", null), [[[0, 60, 0], [10, 70, 0], [20, 60, 0]]]);
  assert.deepEqual(journeyTerrainPaths(read, "overworld", 64), [[[0, 60, 0], [4, 64, 0]], [[16, 64, 0], [20, 60, 0]]]);
  assert.deepEqual(journeyTerrainPaths(read, "nether", 64), [[[0, 40, 0], [2, 40, 2]]]);
  assert.deepEqual(journeyTerrainPaths({ ...read, preferences: { ...read.preferences, visible: false } }, "overworld", null), []);
  const alternating = Array.from({ length: 4_096 }, (_, index) => ({ x: index, y: index % 2 ? 70 : 60, z: 0, at: index + 1 }));
  const bounded = journeyTerrainPaths({ ...read, data: { ...read.data, journeys: [{ ...route, endedAt: 4_096,
    segments: [{ dimension: "overworld", points: alternating }] }] } }, "overworld", 64);
  assert(bounded.every(path => path.length >= 2));
  assert(bounded.reduce((sum, path) => sum + path.length, 0) <= 4_096);
});

await check("the background recorder accepts only a fresh explicitly bound session", async () => {
  const values = new Map(), memory = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let now = 1_000;
  const storage = createJourneyStorage({ storage: memory, prefix: "background", now: () => now });
  storage.setEnabled(worldId, true);
  const world = { schemaVersion: 1, id: worldId, name: "Fixture", edition: "java",
    generation: { version: "1.21.3", seed: "1", preset: "default", settings: {} }, association: null,
    favorite: false, createdAt: 1, lastOpenedAt: 1, movedToBottomAt: null, personal: emptyPersonalState() };
  const session = { ...createGameSession("session-id", 8032, "java"), registered: true, inWorld: true, generation: 1,
    identity: { worldName: "Fixture", server: null, realmId: null, realmName: null }, dimension: "overworld",
    position: { x: 4, y: 65, z: 8, receivedAt: now, sequence: 1 } };
  const binding = confirmSessionWorld(world, session, now);
  let library = { worlds: [world], selection: { id: "selection", worldId, revision: 1 }, binding };
  const recorder = createBackgroundJourneyRecorder({ repository: { snapshot: async () => library }, storage,
    now: () => now, newId: () => "background-route", intervalMs: 60_000 });
  recorder.observe(session); await recorder.idle();
  assert.equal(storage.read(worldId).data.active.segments[0].points[0].x, 4);
  now = 2_000; recorder.finish(); await recorder.idle();
  assert.equal(storage.read(worldId).data.journeys[0].id, "background-route");
  storage.clear(worldId); library = { ...library, binding: null };
  recorder.observe({ ...session, position: { ...session.position, receivedAt: now } }); await recorder.idle();
  assert.equal(storage.read(worldId).data.active, null);
  recorder.dispose();
});

await check("the recorder keeps the last source position when dimension events arrive together", async () => {
  const values = new Map(), memory = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let now = 1_000;
  const storage = createJourneyStorage({ storage: memory, prefix: "crossing-recorder", now: () => now });
  const world = { schemaVersion: 1, id: worldId, name: "Fixture", edition: "java",
    generation: { version: "1.21.3", seed: "1", preset: "default", settings: {} }, association: null,
    favorite: false, createdAt: 1, lastOpenedAt: 1, movedToBottomAt: null, personal: emptyPersonalState() };
  const overworld = { ...createGameSession("session-id", 8032, "java"), registered: true, inWorld: true, generation: 1,
    identity: { worldName: "Fixture", server: null, realmId: null, realmName: null }, dimension: "overworld",
    position: { x: 0, y: 65, z: 8, receivedAt: now, sequence: 1 } };
  const binding = confirmSessionWorld(world, overworld, now);
  const recorder = createBackgroundJourneyRecorder({ repository: { snapshot: async () =>
    ({ worlds: [world], selection: { id: "selection", worldId, revision: 1 }, binding }) }, storage,
  now: () => now, newId: () => "crossing-route", intervalMs: 60_000 });
  recorder.observe(overworld); await recorder.idle();
  now = 1_150;
  recorder.observe({ ...overworld, position: { x: 80, y: 65, z: 8, receivedAt: 1_050, sequence: 2 } });
  recorder.observe({ ...overworld, position: { x: 10, y: 72, z: 3, receivedAt: 1_075, sequence: 3 } });
  recorder.observe({ ...overworld, dimension: "nether", position: null });
  recorder.observe({ ...overworld, dimension: "nether",
    position: { x: 10, y: 72, z: 3, receivedAt: 1_100, sequence: 4 } });
  await recorder.idle();
  const crossings = journeyDimensionTransitions(storage.read(worldId).data.active);
  assert.deepEqual(crossings.map(crossing => [crossing.from.point.x, crossing.to.point.x]), [[80, 10]]);
  assert.deepEqual(storage.read(worldId).data.active.segments[0].points.map(point => point.x), [0, 80]);
  recorder.dispose();
});

await check("portal pairs persist in personal markers after journeys are cleared", async () => {
  const values = new Map(), memory = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let now = 1_000;
  const storage = createJourneyStorage({ storage: memory, prefix: "persistent-portals", now: () => now });
  let world = { schemaVersion: 1, id: worldId, name: "Fixture", edition: "java",
    generation: { version: "1.21.3", seed: "1", preset: "default", settings: {} }, association: null,
    favorite: false, createdAt: 1, lastOpenedAt: 1, movedToBottomAt: null, personal: emptyPersonalState() };
  const base = { ...createGameSession("session-id", 8032, "java"), registered: true, inWorld: true, generation: 1,
    identity: { worldName: "Fixture", server: null, realmId: null, realmName: null } };
  const position = (x, at, sequence) => ({ x, y: 64, z: 0, receivedAt: at, sequence });
  const overworld = { ...base, dimension: "overworld", position: position(80, 1_000, 1) };
  const binding = confirmSessionWorld(world, overworld, now);
  const recorder = createBackgroundJourneyRecorder({ repository: {
    snapshot: async () => ({ worlds: [world], selection: { id: "selection", worldId, revision: 1 }, binding }),
    updateBoundPersonal: async (_expected, change) => { world = { ...world, personal: change(world.personal) }; return world; },
  }, storage, now: () => now, newId: () => "recorded-route", intervalMs: 60_000 });
  recorder.observe(overworld); await recorder.idle();
  now = 1_200;
  recorder.observe({ ...overworld, position: position(10, 1_100, 2) });
  recorder.observe({ ...overworld, dimension: "nether", position: null });
  recorder.observe({ ...overworld, dimension: "nether", position: position(10, 1_200, 3) });
  await recorder.idle();
  assert.equal(world.personal.portals.length, 1);
  assert.deepEqual([world.personal.portals[0].transition.from.point.x,
    world.personal.portals[0].transition.to.point.x], [80, 10]);
  now = 1_250;
  recorder.finish(); await recorder.idle();
  assert.equal(storage.read(worldId).data.journeys.length, 1);
  now = 1_500;
  recorder.observe({ ...overworld, dimension: "nether", position: position(100, 1_300, 4) });
  recorder.observe({ ...overworld, dimension: "overworld", position: position(800, 1_500, 5) });
  await recorder.idle();
  assert.equal(world.personal.portals.length, 2);
  storage.clear(worldId);
  assert.equal(world.personal.portals.length, 2);
  recorder.dispose();
});

console.log(`${checks} journey checks passed.`);
