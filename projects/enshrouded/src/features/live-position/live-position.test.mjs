import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundles = await Promise.all(["live-position-store", "live-motion", "enshrouded-position-reader"].map(async (name) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`./${name}.ts`, import.meta.url))],
    bundle: true, format: "iife", globalName: "subject", write: false,
    plugins: [{ name: "react-hooks", setup(plugin) {
      plugin.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "mock" }));
      plugin.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents:
        "export const useEffect=()=>{}; export const useMemo=()=>{}; export const useRef=()=>{}; export const useState=()=>{};" }));
    } }],
  });
  return [name, result.outputFiles[0].text];
}));
const code = Object.fromEntries(bundles);

const harness = (name, native) => {
  let now = 10000, serial = 0;
  const timers = new Map(), writes = [], sent = [], channels = [];
  const storage = new Map();
  const window = new EventTarget();
  Object.assign(window, {
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { const id = ++serial; timers.set(id, { fn, delay, interval: true }); return id; },
    clearInterval(id) { timers.delete(id); },
  });
  const document = new EventTarget();
  document.hidden = false;
  const context = vm.createContext({
    window, document, console, Event, StorageEvent: class extends Event {},
    performance: { now: () => now }, Date: class extends Date { static now() { return now; } },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); writes.push(value); },
      removeItem: (key) => storage.delete(key),
    },
    BroadcastChannel: class {
      constructor() { channels.push(this); }
      postMessage(value) { sent.push(value); }
    },
    overwolf: { extensions: { current: {
      getExtraObject(_name, callback) { callback({ success: true, object: native }); },
    } } },
  });
  vm.runInContext(code[name], context);
  return { api: context.subject, timers, sent, writes, channels, document, storage,
    advance(ms) { now += ms; },
    fire(delay) {
      for (const [id, timer] of [...timers]) if (timer.delay === delay) {
        if (!timer.interval) timers.delete(id);
        timer.fn();
      }
    },
  };
};

const sample = (sequence, x = 3694) => ({
  version: 1, sequence, x, y: 8960, z: 893.5, dx: 1, dy: 0, updatedAt: 10000 + sequence * 50,
  receivedAt: 10000 + sequence * 50,
});
const nativeSample = (sequence) => JSON.stringify({ state: "live", sequence,
  x: 3694, y: 893.5, z: 1280, dx: 1, dz: 0 });

test("20 Hz delivery only persists once a second and rejects older cross-window samples", () => {
  const h = harness("live-position-store");
  const received = [];
  h.api.subscribeLivePosition((value) => received.push(value));
  for (let i = 1; i <= 40; i++) { h.api.publishLivePosition(sample(i)); h.advance(50); }
  assert.equal(h.sent.length, 40);
  assert.equal(received.length, 40);
  assert.equal(h.writes.length, 2);
  h.channels[0].onmessage({ data: sample(39) });
  h.channels[0].onmessage({ data: { ...sample(41), x: NaN } });
  assert.equal(h.api.getLatestLivePosition().sequence, 40);
  h.channels[0].onmessage({ data: sample(41) });
  assert.equal(h.api.getLatestLivePosition().sequence, 41);
  h.api.clearLivePosition();
  assert.equal(h.api.getLatestLivePosition(), null);
  assert.equal(h.storage.size, 0);
});

test("motion shares one clock, stops when stationary/hidden and snaps teleports", () => {
  const h = harness("live-motion");
  const frames = [];
  const unsub = h.api.subscribeLiveMotion((value) => frames.push(value));
  const unsub2 = h.api.subscribeLiveMotion(() => {});
  const deliver = (value) => h.channels[0].onmessage({ data: value });
  deliver(sample(1, 100));
  assert.equal(h.timers.size, 0);
  deliver(sample(2, 110));
  assert.equal(h.timers.size, 1);
  h.advance(60); h.fire(33);
  assert.equal(frames.at(-1).x, 105);
  h.advance(60); h.fire(33);
  assert.equal(frames.at(-1).x, 110);
  assert.equal(h.timers.size, 0);
  deliver(sample(3, 120));
  h.document.hidden = true; h.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(h.timers.size, 0);
  h.advance(200);
  h.document.hidden = false; h.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(frames.at(-1).x, 120);
  deliver(sample(4, 1000));
  assert.equal(frames.at(-1).x, 1000);
  deliver(sample(5, 1010));
  unsub(); unsub2();
  assert.equal(h.timers.size, 0);
});

test("bridge converts axes, has one outstanding native call and drops late replies after stop", () => {
  const callbacks = [];
  let starts = 0, stops = 0;
  const h = harness("enshrouded-position-reader", {
    start(pid, callback) { assert.equal(pid, 123); starts++; callback({ success: true }); },
    getSnapshot(callback) { callbacks.push(callback); }, stop(callback) { stops++; callback(); },
  });
  const stop = h.api.startEnshroudedPositionReader(123);
  assert.equal(starts, 1);
  assert.equal(callbacks.length, 1);
  assert.equal([...h.timers.values()].some((timer) => timer.delay === 50), false);
  callbacks.shift()(nativeSample(1));
  const position = h.sent.at(-1);
  assert.equal(position.x, 3694); assert.equal(position.y, 8960); assert.equal(position.z, 893.5);
  h.fire(50);
  callbacks.shift()(nativeSample(1));
  assert.equal(h.sent.filter(Boolean).length, 1);
  h.fire(50);
  stop(); stop();
  callbacks.shift()(nativeSample(2));
  assert.equal(stops, 1);
  assert.equal(h.sent.at(-1), null);
  assert.equal(h.timers.size, 0);
});

test("an unresponsive native reader is stopped instead of accumulating calls", () => {
  let requests = 0, stops = 0;
  const h = harness("enshrouded-position-reader", {
    start(_pid, callback) { callback({ success: true }); },
    getSnapshot() { requests++; }, stop() { stops++; },
  });
  h.api.startEnshroudedPositionReader(123);
  h.fire(3000);
  assert.equal(requests, 1);
  assert.equal(stops, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.api.decodeNativePosition('{"state":"live","x":null}', 1), null);
});
