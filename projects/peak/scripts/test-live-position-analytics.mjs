import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const events = {
  LIVE_POSITION_CONNECTED: "live_position_connected",
  LIVE_POSITION_MISSING: "live_position_missing",
};
let now = 1_000_000;
let nextTimerId = 1;
let sample = null;
let readFailure = false;
let readBarrier = null;
let session = { trackingStatus: "ready" };
let captures = [];
const timeouts = new Map();
const intervals = new Map();

const windowMock = {
  setTimeout: (callback, delay) => {
    const id = nextTimerId++;
    timeouts.set(id, { callback, delay });
    return id;
  },
  clearTimeout: (id) => timeouts.delete(id),
  setInterval: (callback, delay) => {
    const id = nextTimerId++;
    intervals.set(id, { callback, delay });
    return id;
  },
  clearInterval: (id) => intervals.delete(id),
};

const source = await readFile(
  new URL("../src/features/map/live-position-analytics.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  require: (name) => ({
    "../../state/peak-session-store": { getPeakSession: () => session },
    "../../utils/analytics/analytics": {
      track: (event, properties) => captures.push({ event, properties }),
    },
    "../../utils/analytics/events": { EVENTS: events },
    "./live-state": {
      readLiveStateSnapshot: async () => {
        if (readBarrier) await readBarrier;
        if (readFailure) throw new Error("read failed");
        return sample;
      },
      localPlayerOf: (state) => state?.players.find((player) => player.isLocal) ?? null,
      isDeathWarp: (player) => player.y === 5_000 && player.z === -5_000,
    },
  })[name] ?? require(name),
  window: windowMock,
  Date: { now: () => now },
});

const settle = () => new Promise((resolve) => setImmediate(resolve));
const freshSample = {
  payloadVersion: 2,
  disabled: [],
  players: [{ isLocal: true, x: 10, y: 20, z: 30 }],
};

// A first usable fix reports once, includes latency, and stops further polling.
sample = freshSample;
let cleanup = exports.startLivePositionAnalytics();
await settle();
assert.equal(captures.length, 1);
assert.equal(captures[0].event, events.LIVE_POSITION_CONNECTED);
assert.equal(captures[0].properties.wait_seconds, 0);
assert.equal(captures[0].properties.after_missing, false);
assert.deepEqual(captures[0].properties.disabled_features, []);
assert.equal(intervals.size, 0);
assert.equal(timeouts.size, 0);
cleanup();

// A failed bridge reports a stable reason after the same 120-second grace as PZ.
captures = [];
sample = null;
session = { trackingStatus: "failed" };
cleanup = exports.startLivePositionAnalytics();
await settle();
const missingTimer = [...timeouts.values()][0];
assert.equal(missingTimer.delay, 120_000);
missingTimer.callback();
assert.equal(captures[0].event, events.LIVE_POSITION_MISSING);
assert.equal(captures[0].properties.reason, "bridge_install_failed");
assert.equal(captures[0].properties.tracking_status, "failed");
assert.equal(captures[0].properties.last_sample_seen, false);
cleanup();

// A late fix is still reported and marked so PostHog can exclude recovered setups.
captures = [];
session = { trackingStatus: "ready" };
cleanup = exports.startLivePositionAnalytics();
await settle();
[...timeouts.values()][0].callback();
sample = freshSample;
now += 121_000;
[...intervals.values()][0].callback();
await settle();
assert.equal(captures.length, 2);
assert.equal(captures[0].properties.reason, "no_fresh_position");
assert.equal(captures[1].event, events.LIVE_POSITION_CONNECTED);
assert.equal(captures[1].properties.after_missing, true);
cleanup();

// Unexpected reader failures remain distinguishable from absent/stale samples.
captures = [];
sample = null;
readFailure = true;
cleanup = exports.startLivePositionAnalytics();
await settle();
[...timeouts.values()][0].callback();
assert.equal(captures[0].properties.reason, "live_state_read_failed");
cleanup();

// Ending the game session suppresses a position read that finishes afterward.
captures = [];
readFailure = false;
sample = freshSample;
let releaseRead;
readBarrier = new Promise((resolve) => { releaseRead = resolve; });
cleanup = exports.startLivePositionAnalytics();
cleanup();
releaseRead();
await settle();
assert.equal(captures.length, 0);
readBarrier = null;

console.log("Live-position analytics tests passed: connected, missing reason, late recovery, read failure, and session cleanup.");
