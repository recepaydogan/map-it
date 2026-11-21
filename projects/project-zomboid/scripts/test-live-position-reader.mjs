import assert from "node:assert/strict";
import {
  isFreshLivePositionBridgePayload,
  parseLivePositionBridgePayload,
  parseLivePositionStreamHandover,
} from "../src/features/live-position/live-position-payload.ts";
import {
  createLivePositionBroadcaster,
  isLivePositionChannelAvailable,
  subscribeLivePositionChannel,
} from "../src/features/live-position/live-position-channel.ts";

const now = 1_786_540_000_000;
const pausedPayload = parseLivePositionBridgePayload(JSON.stringify({
  version: 1,
  sequence: 42,
  updatedAt: now - 10_000,
  x: 11_005.177,
  y: 9_687.168,
  z: 0,
}));

assert.ok(pausedPayload, "A structurally valid paused payload must remain readable.");
assert.equal(isFreshLivePositionBridgePayload(pausedPayload, now), false);
assert.equal(isFreshLivePositionBridgePayload({ ...pausedPayload, updatedAt: now - 500 }, now), true);
assert.equal(parseLivePositionBridgePayload('{"version":1,"x":'), null);
assert.equal(parseLivePositionBridgePayload(JSON.stringify({
  version: 1,
  sequence: 43,
  updatedAt: now,
  x: Number.MAX_VALUE,
  y: 100,
  z: 0,
})), null);
assert.equal(
  parseLivePositionStreamHandover('{"version":1,"rotate":"position-stream-b.txt"}'),
  "position-stream-b.txt",
);
assert.equal(parseLivePositionStreamHandover('{"rotate":"..\\secret.txt"}'), null);

if (isLivePositionChannelAvailable()) {
  const relayed = [];
  const unsubscribe = subscribeLivePositionChannel((position) => relayed.push(position));
  const broadcaster = createLivePositionBroadcaster();
  const position = {
    version: 1,
    sequence: 44,
    updatedAt: now,
    receivedAt: now,
    x: 10,
    y: 20,
    z: 0,
    dx: 1,
    dy: 0,
  };
  broadcaster.publish(position);
  broadcaster.publish(null);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(relayed, [position, null]);
  unsubscribe();
  broadcaster.close();
}

console.log("Live position reader tests passed.");
