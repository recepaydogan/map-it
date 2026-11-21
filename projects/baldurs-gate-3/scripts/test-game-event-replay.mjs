import assert from "node:assert/strict";
import { normalizeInfoUpdate } from "../src/features/game-events/game-event-normalizer.ts";
import { replayGameEventRecords } from "../src/features/game-events/game-event-replay.ts";
import {
  gameWorldPositionToLivePosition,
  isTrackableGameWorldPosition,
  resolvePrimaryGamePlayerId,
} from "../src/game-config.ts";
import { LIVE_POSITION_STALE_AFTER_MS } from "../src/features/live-position/live-position-types.ts";
import { worldToMapDirection } from "../src/features/map/map-coordinate-reference.ts";
import { LiveMotionInterpolator } from "../src/features/live-position/live-motion-interpolator.ts";

const nested = normalizeInfoUpdate({
  info: {
    game_info: { scene: "exploration" },
    match_info: { maps: { main_map: "region-alpha", sub_map: "vault-one" } },
    location: {
      location_camera: "{\"x\":12.5,\"y\":4,\"z\":-9}",
      location_players: "[{\"player_0\":{\"x\":10,\"y\":3,\"z\":-7}}]",
    },
  },
});

assert.deepEqual(nested, {
  scene: "exploration",
  mainMap: "region-alpha",
  subMap: "vault-one",
  camera: { x: 12.5, y: 4, z: -9 },
  players: { player_0: { x: 10, y: 3, z: -7 } },
});

const records = [
  { id: "s:2", sessionId: "s", sequence: 2, receivedAt: 20, channel: "event", payload: { events: [{ name: "match_end" }] } },
  { id: "s:1", sessionId: "s", sequence: 1, receivedAt: 10, channel: "info", payload: { key: "main_map", data: "region-alpha" } },
];
const replayed = replayGameEventRecords(records);
assert.equal(replayed.mainMap, "region-alpha");
assert.equal(replayed.matchState, "ended");
assert.equal(replayed.lastEventAt, 20);

assert.deepEqual(
  gameWorldPositionToLivePosition({ x: 10, y: 3, z: -7 }),
  { x: 10, y: 3, z: -7 },
);
assert.equal(isTrackableGameWorldPosition({ x: 0, y: 0, z: 0 }), false);
assert.equal(isTrackableGameWorldPosition({ x: 0, y: -0.1, z: 0 }), true);
assert.equal(LIVE_POSITION_STALE_AFTER_MS, 60_000);
assert.equal(resolvePrimaryGamePlayerId({
  player_1: { x: 2, y: 0, z: 0 },
  player_0: { x: 8, y: 0, z: 0 },
}), "player_0");
assert.equal(resolvePrimaryGamePlayerId({
  companion: { x: 30, y: 0, z: 30 },
  controlled: { x: 2, y: 0, z: 3 },
}, { x: 1, y: 20, z: 2 }), "controlled");
assert.deepEqual(worldToMapDirection(
  { x: 3, y: 4 },
  {
    worldBounds: { x: 0, y: 0, width: 30, height: 40 },
    imageBounds: { x: 0, y: 0, width: 300, height: 400 },
    flipY: true,
  },
), { x: 0.6, y: -0.8 });

const motion = new LiveMotionInterpolator(140, 96);
assert.deepEqual(motion.accept({ x: 0, y: 0 }, 0), { x: 0, y: 0 });
assert.deepEqual(motion.accept({ x: 12, y: 0 }, 1_000), { x: 0, y: 0 });
const movingA = motion.positionAt(1_016);
const movingB = motion.positionAt(1_032);
const movingC = motion.positionAt(1_500);
assert(movingA.x > 0 && movingA.x < 12);
assert(movingB.x > movingA.x);
assert(movingC.x > movingB.x);
assert.equal(motion.isMoving(1_500), true);
const beforeStop = motion.positionAt(2_000);
motion.accept({ x: 12, y: 0 }, 2_000);
const settling = motion.positionAt(2_140);
assert(settling.x < beforeStop.x && settling.x > 12);
assert.deepEqual(motion.accept({ x: 200, y: 50 }, 2_170), { x: 200, y: 50 });

const oneHertzMotion = new LiveMotionInterpolator(140, 96);
oneHertzMotion.accept({ x: 0, y: 0 }, 0);
oneHertzMotion.accept({ x: 4, y: 0 }, 1_000);
const framePositions = [];
for (let now = 1_016; now < 3_000; now += 16) {
  if (now >= 2_008 && framePositions.length > 0 && framePositions.at(-1).sample !== 2) {
    oneHertzMotion.accept({ x: 8, y: 0 }, 2_000);
    framePositions.push({ sample: 2, x: oneHertzMotion.positionAt(now).x });
    continue;
  }
  framePositions.push({ sample: framePositions.at(-1)?.sample ?? 1, x: oneHertzMotion.positionAt(now).x });
}
const movingFrames = framePositions
  .map((frame, index) => index === 0 ? 0 : frame.x - framePositions[index - 1].x)
  .slice(1)
  .filter((delta) => delta > 0.000_001);
assert(movingFrames.length > 100, "A 1 Hz feed should still generate continuous animation frames.");

console.log("Game-event replay tests passed.");
