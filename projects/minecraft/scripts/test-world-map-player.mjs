import assert from "node:assert/strict";
import { GAME_EDITIONS, GAME_TELEMETRY, GAME_MAP_DIMENSIONS } from "../src/game-config.ts";
import { createGameSession } from "../src/features/game-session/session-types.ts";
import { confirmSessionWorld } from "../src/features/worlds/world-session-binding.ts";
import { emptyPersonalState } from "../src/features/worlds/world-types.ts";
import { projectWorldMapPlayer, resolveWorldMapPlayer } from "../src/features/worlds/world-map-player.ts";
import { createSmoothedWorldMapPlayer } from "../src/features/worlds/use-smoothed-world-map-player.ts";
import { horizontalDestinationDistance, projectTrackedDestination,
  spreadDestinationEdges } from "../src/features/worlds/world-map-destination.ts";
import { worldMapSnapshotFilename } from "../src/features/worlds/world-map-snapshot.ts";
import { layoutTerrainMarkers } from "../src/features/worlds/world-terrain-marker-layout.ts";
import { WORLD_STRUCTURE_ICON_SIZE, WORLD_STRUCTURE_MARKER_CONTENT_PADDING, WORLD_STRUCTURE_MARKER_SCALE,
  WORLD_STRUCTURE_MARKER_SIZE } from "../src/features/worlds/world-structure-marker-size.ts";

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
check("follow motion shares one position without waking the map for every incoming sample", () => {
  const base = { worldId: "world", sessionKey: "session", dimension: "overworld", x: 0, y: 64, z: 0,
    yaw: 0, receivedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, facingExpiresAt: null };
  let time = 0, tick = () => {}, scheduled = 0, cancelled = 0, notifications = 0;
  const motion = createSmoothedWorldMapPlayer(base, () => time, callback => {
    scheduled++; tick = callback; return () => { cancelled++; };
  });
  const unsubscribe = motion.subscribe(() => { notifications++; });
  motion.setTarget({ ...base, x: 10, yaw: 90 });
  assert.equal(motion.getSnapshot().x, 0);
  assert.equal(notifications, 0, "Only motion ticks notify the marker and camera");
  time = 100; tick();
  assert.equal(motion.getSnapshot().x, 5);
  assert.equal(motion.getSnapshot().yaw, 45);
  motion.setTarget({ ...base, x: 10, yaw: 90 });
  assert.equal(scheduled, 1, "Repeated telemetry must not restart an unfinished glide");
  motion.setTarget({ ...base, x: 20, yaw: 180 });
  assert.equal(scheduled, 1, "Rapid samples share one animation clock");
  time = 160; tick();
  assert.equal(motion.getSnapshot().x, 12.5);
  time = 220; tick();
  assert.equal(motion.getSnapshot().x, 20);
  assert.equal(cancelled, 1);
  motion.setTarget({ ...base, x: 20, yaw: 180 });
  assert.equal(scheduled, 1, "An unchanged sample does not start another clock");
  motion.setTarget({ ...base, x: 200 });
  assert.equal(motion.getSnapshot().x, 200, "Teleports snap instead of sliding through the map");
  motion.setTarget(null);
  assert.equal(motion.getSnapshot(), null);
  unsubscribe(); motion.dispose();
});
check("five-per-second telemetry keeps a moving marker between samples", () => {
  const base = { worldId: "world", sessionKey: "session", dimension: "overworld", x: 0, y: 64, z: 0,
    yaw: 0, receivedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, facingExpiresAt: null };
  let time = 0, tick = () => {}, cancelled = 0;
  const motion = createSmoothedWorldMapPlayer(base, () => time, callback => {
    tick = callback; return () => { cancelled++; };
  });
  motion.setTarget({ ...base, x: 10 });
  time = 190; tick();
  time = 200;
  motion.setTarget({ ...base, x: 20 });
  time = 300; tick();
  assert(motion.getSnapshot().x > 14 && motion.getSnapshot().x < 15);
  time = 400; tick();
  assert(motion.getSnapshot().x < 20, "The glide must still be moving when the next sample arrives");
  motion.setTarget({ ...base, x: 30 });
  time = 500; tick();
  assert(motion.getSnapshot().x > 23 && motion.getSnapshot().x < 25);
  assert.equal(cancelled, 0, "Regular samples keep one continuous frame clock");
  motion.dispose();
  assert.equal(cancelled, 1);
});
check("telemetry between delayed display frames cannot keep restarting from a frozen marker", () => {
  const base = { worldId: "world", sessionKey: "session", dimension: "overworld", x: 0, y: 64, z: 0,
    yaw: 350, receivedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, facingExpiresAt: null };
  let time = 0, tick = () => {}, notifications = 0;
  const motion = createSmoothedWorldMapPlayer(base, () => time, callback => { tick = callback; return () => {}; });
  motion.subscribe(() => { notifications++; });
  for (let index = 1; index <= 20; index++) {
    time = index * 50;
    motion.setTarget({ ...base, x: index, z: -index, yaw: 10, receivedAt: time });
  }
  assert.equal(notifications, 0, "Incoming samples still do not render the workspace");
  tick();
  assert.ok(motion.getSnapshot().x > 17, "Elapsed motion must catch up even without an intervening display frame");
  assert.ok(motion.getSnapshot().x <= 20);
  assert.equal(motion.getSnapshot().z, -motion.getSnapshot().x);
  time += 300; tick();
  assert.equal(motion.getSnapshot().x, 20);
  assert.equal(motion.getSnapshot().receivedAt, 1000);
  motion.dispose();
});
check("an out-and-back sample replaces unfinished motion instead of leaving an obsolete target", () => {
  const base = { worldId: "world", sessionKey: "session", dimension: "overworld", x: 0, y: 64, z: 0,
    yaw: null, receivedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, facingExpiresAt: null };
  let time = 0, tick = () => {};
  const motion = createSmoothedWorldMapPlayer(base, () => time, callback => { tick = callback; return () => {}; });
  motion.setTarget({ ...base, x: 10 });
  time = 100; motion.setTarget({ ...base, receivedAt: 100 });
  time = 400; tick();
  assert.equal(motion.getSnapshot().x, 0);
  assert.equal(motion.getSnapshot().receivedAt, 100);
  motion.dispose();
});
check("a delayed display frame respects session changes and teleports after burst telemetry", () => {
  const base = { worldId: "world", sessionKey: "session", dimension: "overworld", x: 0, y: 64, z: 0,
    yaw: null, receivedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, facingExpiresAt: null };
  let time = 0, tick = () => {};
  const motion = createSmoothedWorldMapPlayer(base, () => time, callback => { tick = callback; return () => {}; });
  motion.setTarget({ ...base, x: 10 });
  time = 100; motion.setTarget({ ...base, x: 1000 });
  tick(); assert.equal(motion.getSnapshot().x, 1000);
  motion.setTarget({ ...base, sessionKey: "new", dimension: "nether", x: -5 });
  time = 500; tick();
  assert.equal(motion.getSnapshot().x, -5);
  assert.equal(motion.getSnapshot().dimension, "nether");
  motion.setTarget(null); tick(); assert.equal(motion.getSnapshot(), null);
  motion.dispose();
});
check("the default motion clock follows display frames and stops after arrival", () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map(), cancelled = [];
  let nextFrame = 0, time = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = id => { cancelled.push(id); frames.delete(id); };
  const base = { worldId: "world", sessionKey: "session", dimension: "overworld", x: 0, y: 64, z: 0,
    yaw: 0, receivedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, facingExpiresAt: null };
  const motion = createSmoothedWorldMapPlayer(base, () => time);
  try {
    motion.setTarget({ ...base, x: 10 });
    assert.equal(frames.size, 1);
    time = 100;
    const first = frames.get(1); frames.delete(1); first();
    assert.equal(motion.getSnapshot().x, 5);
    assert.equal(frames.size, 1, "Another display frame is requested while moving");
    time = 200;
    const second = frames.get(2); frames.delete(2); second();
    assert.equal(motion.getSnapshot().x, 10);
    assert.equal(frames.size, 0);
    assert.deepEqual(cancelled, [2]);
  } finally {
    motion.dispose();
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
check("structure map markers use the exact requested one-and-a-quarter scale", () => {
  assert.equal(WORLD_STRUCTURE_MARKER_SCALE, 1.25);
  assert.equal(WORLD_STRUCTURE_ICON_SIZE, 26.25);
  assert.equal(WORLD_STRUCTURE_MARKER_CONTENT_PADDING, 2.1875);
  assert.equal(WORLD_STRUCTURE_MARKER_SIZE, 30.625);
});
const dimensions = GAME_MAP_DIMENSIONS.map(item => item.id);
for (const edition of GAME_EDITIONS) {
  const world = { schemaVersion: 1, id: `world-${edition.id}`, name: "Fixture", edition: edition.id,
    generation: { version: "fixture", seed: "-9223372036854775808", preset: "default", settings: {} },
    personal: emptyPersonalState(), favorite: false, association: null, createdAt: 1, lastOpenedAt: 1, movedToBottomAt: null };
  const session = { ...createGameSession("fixture", edition.gameClassId, edition.id), registered: true, inWorld: true,
    dimension: dimensions[0], yaw: 90, facingReceivedAt: 1000,
    position: { x: -500, y: -32, z: 800, receivedAt: 1000, sequence: 1 } };
  const binding = confirmSessionWorld(world, session, 1000);
  const resolve = (s = session, b = binding, w = world, now = 1000, error = null) => resolveWorldMapPlayer(w,
    { session: s, error }, b, now, GAME_TELEMETRY.staleAfterMs, dimensions, GAME_TELEMETRY.coordinateLimit);
  check(`${edition.id}: fresh explicit binding preserves local coordinates and yaw`, () => {
    const player = resolve(); assert.equal(player.worldId, world.id); assert.equal(player.x, -500); assert.equal(player.y, -32);
    assert.equal(player.z, 800); assert.equal(player.yaw, 90); assert.equal(player.expiresAt, 1000 + GAME_TELEMETRY.staleAfterMs);
    assert.equal(player.facingExpiresAt, null);
  });
  check(`${edition.id}: an unverified stale position is excluded from live navigation`, () => {
    const stale = resolve(session, binding, world, 1001 + GAME_TELEMETRY.staleAfterMs);
    assert.equal(stale, null);
  });
  check(`${edition.id}: the bound resolver rejects unbound, inactive, errored and wrong-world streams`, () => {
    assert.equal(resolve(session, null), null); assert.equal(resolve(null), null);
    assert.equal(resolve(session, binding, null), null); assert.equal(resolve(session, binding, { ...world, id: "other" }), null);
    assert.equal(resolve(session, binding, world, 1000, "unavailable"), null);
    for (const patch of [{ connected: false }, { registered: false }, { inWorld: false }, { generation: 4 }, { id: "new-session" },
      { identity: { ...session.identity, worldName: "changed" } }, { issue: "invalid-data" }, { dimension: "unknown" }])
      assert.equal(resolve({ ...session, ...patch }), null);
    assert.equal(resolve(session, binding, { ...world, generation: { ...world.generation, seed: "1" } }), null);
    for (const x of [NaN, Infinity, GAME_TELEMETRY.coordinateLimit + 1])
      assert.equal(resolve({ ...session, position: { ...session.position, x } }), null);
  });
  check(`${edition.id}: an unbound server cannot display coordinates on a selected map`, () => {
    const remote = { ...session, identity: { ...session.identity, server: "example.server.test" } };
    assert.equal(resolve(remote, null), null);
    assert.equal(resolve(remote, binding), null);
  });
  check(`${edition.id}: the session retains old facing but rejects absent or future facing`, () => {
    const newer = { ...session, position: { ...session.position, receivedAt: 9000 } };
    for (const facingReceivedAt of [undefined, null, 9001])
      assert.equal(resolve({ ...newer, facingReceivedAt }, binding, world, 9000).yaw, null);
    assert.equal(resolve({ ...newer, facingReceivedAt: 1000 }, binding, world, 9000).yaw, 90);
    assert.equal(resolve({ ...newer, facingReceivedAt: 9000 }, binding, world, 9000).yaw, 90);
  });
  check(`${edition.id}: session reconfirmation changes the follow ownership key`, () => {
    assert.notEqual(resolve().sessionKey, resolve(session, confirmSessionWorld(world, session, 1001)).sessionKey);
  });
  check(`${edition.id}: screen projection respects negative coordinates, dimensions and offscreen bounds`, () => {
    const player = resolve(), view = { width: 840, height: 600, x: player.x, z: player.z, zoom: .25 };
    assert.deepEqual(projectWorldMapPlayer(player, player.dimension, view), { x: 420, y: 300, visible: true });
    assert.deepEqual(projectWorldMapPlayer({ ...player, x: player.x - 100, z: player.z + 100 }, player.dimension, view), { x: 395, y: 325, visible: true });
    assert.equal(projectWorldMapPlayer(player, dimensions[1], view), null);
    assert.equal(projectWorldMapPlayer(player, player.dimension, null), null);
    assert.equal(projectWorldMapPlayer({ ...player, x: 100000 }, player.dimension, view).visible, false);
  });
}
check("tracked destinations project to the usable map or its directional edge without crossing dimensions", () => {
  const view = { width: 840, height: 600, x: -100, z: 200, zoom: .5 };
  const area = { left: 380, top: 80, right: 820, bottom: 520 };
  const target = { id: "target", label: "Village", dimension: "overworld", x: -100, y: null, z: 200, pointId: "village" };
  assert.deepEqual(projectTrackedDestination(target, "overworld", view, area),
    { destination: target, x: 420, y: 300, angle: 90, kind: "visible" });
  const east = projectTrackedDestination({ ...target, id: "east", x: 10_000 }, "overworld", view, area);
  assert.equal(east.kind, "edge"); assert.equal(east.x, area.right); assert.equal(east.y, 300); assert.equal(east.angle, 90);
  const north = projectTrackedDestination({ ...target, id: "north", z: -10_000 }, "overworld", view, area);
  assert.equal(north.kind, "edge"); assert.equal(north.y, area.top); assert.equal(north.angle, 0);
  assert.equal(projectTrackedDestination(target, "nether", view, area), null);
  assert.equal(projectTrackedDestination(target, "overworld", null, area), null);
});
check("panel occlusion becomes an edge and coincident edge arrows spread deterministically", () => {
  const view = { width: 840, height: 600, x: 0, z: 0, zoom: 1 };
  const area = { left: 500, top: 100, right: 820, bottom: 500 };
  const target = id => ({ id, label: id, dimension: "overworld", x: 0, y: null, z: 0, pointId: id });
  const hidden = projectTrackedDestination(target("hidden"), "overworld", view, area);
  assert.equal(hidden.kind, "edge"); assert.equal(hidden.x, area.left); assert.equal(hidden.y, 300);
  const projected = [0, 1, 2].map(index => projectTrackedDestination({ ...target(String(index)), x: 10_000, z: index }, "overworld", view, area));
  const spread = spreadDestinationEdges(projected, area);
  assert.deepEqual(spread.map(item => item.x), [area.right, area.right, area.right]);
  assert.ok(spread[1].y - spread[0].y >= 38); assert.ok(spread[2].y - spread[1].y >= 38);
  assert.deepEqual(spreadDestinationEdges(projected, area).map(item => item.y), spread.map(item => item.y));
});
check("destination distance is horizontal and requires a player in the same dimension", () => {
  const target = { dimension: "overworld", x: -3, z: 4 };
  assert.equal(horizontalDestinationDistance(target, { dimension: "overworld", x: 0, z: 0 }), 5);
  assert.equal(horizontalDestinationDistance(target, { dimension: "nether", x: 0, z: 0 }), null);
  assert.equal(horizontalDestinationDistance(target, null), null);
});
check("snapshot filenames retain useful world context while removing unsafe separators", () => {
  assert.equal(worldMapSnapshotFilename({ worldName: "  Cherry / Snow: World  ", edition: "Java Edition",
    dimension: "The End", centerX: -511.6, centerZ: 800.4 }), "Cherry-Snow-World-Java-Edition-The-End-x-512-z800.png");
  assert.equal(worldMapSnapshotFilename({ worldName: "///", edition: "java", dimension: "overworld", centerX: 0, centerZ: 0 }),
    "world-java-overworld-x0-z0.png");
});
check("3D marker layout requires exact Y, matching dimensions, visible projection and retained cutaway side", () => {
  const camera = { target: [0, 64, 0], yaw: 0, pitch: 0, distance: 64 };
  const player = { dimension: "overworld", x: 0, y: 64, z: 0 };
  const destinations = [
    { id: "known", label: "Known", dimension: "overworld", x: 4, y: 32, z: 0, pointId: null },
    { id: "player-pin", label: "Pinned", dimension: "overworld", x: -4, y: 40, z: 0, pointId: "pin-one", kind: "player-pin" },
    { id: "unknown", label: "Unknown", dimension: "overworld", x: 0, y: null, z: 0, pointId: null },
    { id: "other", label: "Other", dimension: "nether", x: 0, y: 64, z: 0, pointId: null },
    { id: "behind", label: "Behind", dimension: "overworld", x: 0, y: 64, z: 100, pointId: null },
  ];
  assert.deepEqual(layoutTerrainMarkers({ camera, width: 840, height: 600, cutawayY: null,
    dimension: "overworld", player, destinations }).map(item => [item.id, item.kind]).sort(),
    [["known", "destination"], ["player", "player"], ["player-pin", "pin"]]);
  assert.deepEqual(layoutTerrainMarkers({ camera, width: 840, height: 600, cutawayY: 63,
    dimension: "overworld", player, destinations }).map(item => item.id).sort(), ["known", "player-pin"]);
  assert.equal(layoutTerrainMarkers({ camera, width: 0, height: 600, cutawayY: null,
    dimension: "overworld", player, destinations }).length, 0);
});
check("3D marker layout excludes terrain-occluded exact-Y points", () => {
  const camera = { target: [0, 64, 0], yaw: 0, pitch: 0, distance: 64 };
  const destinations = [{ id: "visible", label: "Visible", dimension: "overworld", x: 4, y: 64, z: 0, pointId: null },
    { id: "hidden", label: "Hidden", dimension: "overworld", x: -4, y: 64, z: 0, pointId: null }];
  const markers = layoutTerrainMarkers({ camera, width: 840, height: 600, cutawayY: null, dimension: "overworld",
    player: { dimension: "overworld", x: 0, y: 64, z: 0 }, destinations,
    isOccluded: point => point[0] < 0 });
  assert.deepEqual(markers.map(marker => marker.id).sort(), ["player", "visible"]);
});
check("3D structure markers require a bounded exact terrain anchor and preserve their source identity", () => {
  const camera = { target: [0, 64, 0], yaw: 0, pitch: 0, distance: 64 };
  const structures = [{ id: "village:4:0", type: "village", label: "Village", point: [4.5, 65.75, 0.5], evidence: "predicted" },
    { id: "cut", type: "outpost", label: "Outpost", point: [-4.5, 90.75, 0.5], evidence: "saved" },
    { id: "invalid", type: "village", label: "Invalid", point: [0, Number.NaN, 0], evidence: "saved" }];
  const markers = layoutTerrainMarkers({ camera, width: 840, height: 600, cutawayY: 80, dimension: "overworld",
    player: null, destinations: [], structures });
  assert.equal(markers.length, 1); assert.equal(markers[0].id, "structure:predicted:village:4:0");
  assert.equal(markers[0].sourceId, "village:4:0"); assert.equal(markers[0].structureType, "village");
  assert.equal(markers[0].structureEvidence, "predicted");
  assert.equal(layoutTerrainMarkers({ camera, width: 840, height: 600, cutawayY: null, dimension: "overworld",
    player: null, destinations: [], structures: Array.from({ length: 129 }, (_, index) => ({
      id: `point-${index}`, type: "village", label: "Village", point: [4.5, 65.75, 0.5], evidence: "saved",
    })) }).length, 128);
});
check("3D player facing projects world yaw into the camera plane and preserves unknown heading", () => {
  const camera = { target: [0, 64, 0], yaw: Math.PI / 2, pitch: 0.6, distance: 64 };
  const marker = yaw => layoutTerrainMarkers({ camera, width: 840, height: 600, cutawayY: null,
    dimension: "overworld", player: { dimension: "overworld", x: 0, y: 64, z: 0, yaw }, destinations: [] })[0];
  const forward = marker(0), backward = marker(180);
  assert.notEqual(forward.headingAngle, null); assert.notEqual(backward.headingAngle, null);
  const separation = Math.abs(((forward.headingAngle - backward.headingAngle + 540) % 360) - 180);
  assert.ok(Math.abs(separation - 180) < 0.001);
  assert.equal(marker(null).headingAngle, null);
});
console.log(`${checks} bound map-player checks passed (synthetic telemetry, not running-game verification).`);
