import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const mocks = {
  react: `
    export const useEffect = (effect) => { globalThis.__positionAnalytics.cleanup = effect(); };
    export const useMemo = () => {};
    export const useRef = () => {};
    export const useState = () => {};
  `,
  "posthog-js": `export default {
    init() {},
    capture(event, properties) { globalThis.__positionAnalytics.events.push({ event, properties }); },
  };`,
};

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./background-controller.tsx", import.meta.url))],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  define: { "import.meta.env": '{"DEV":false,"VITE_POSTHOG_KEY":"test-key"}' },
  plugins: [{
    name: "position-analytics-mocks",
    setup(plugin) {
      plugin.onResolve({ filter: /^(react|posthog-js)$/ }, ({ path }) => ({ path, namespace: "mock" }));
      plugin.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path] }));
    },
  }],
});
const { BackgroundController } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("captures the first published live position once per native game process", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  const state = { events: [], cleanup: null };
  const storage = new Map();
  t.mock.method(console, "info", () => {});
  const fetch = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "https://pzb.ingredientassets.com/live-position/profiles-v1.json");
    return new Response(null, { status: 503 });
  });

  let snapshot = '{"state":"waiting-game"}';
  const reader = {
    setProfiles(_json, done) { done({ success: true }); },
    start(_pid, done) { done({ success: true }); },
    getSnapshot(done) { done(snapshot); },
    stop() {},
  };
  globalThis.__positionAnalytics = state;
  globalThis.window = Object.assign(new EventTarget(), { location: { search: "" } });
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.overwolf = { extensions: { current: {
    getExtraObject(_name, done) { done({ success: true, object: reader }); },
    getManifest(done) { done({ meta: { version: "1.0.1" } }); },
  } } };
  t.after(() => {
    state.cleanup();
    delete globalThis.__positionAnalytics;
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.overwolf;
  });

  const poll = (value) => {
    snapshot = JSON.stringify(value);
    t.mock.timers.tick(50);
  };
  const position = (sequence, props = {}) => ({
    state: "live", pid: 123, sequence, sampledAt: Date.now(), region: "XiGu",
    layer: 0, x: 100, y: 200, z: 300, u: 0.5, v: 0.5, dx: 1, dy: 0, ...props,
  });

  BackgroundController();
  await new Promise(setImmediate);
  poll(position(1, { sampledAt: Date.now() - 2000 }));
  poll(position(2, { region: "unknown" }));
  poll(position(3, { pid: undefined }));
  assert.equal(JSON.parse(storage.get("phantom-blade-app:live-position")).mapId, "xi-gu");
  assert.deepEqual(state.events, []);

  poll(position(4));
  assert.deepEqual(state.events, [{
    event: "live_position_received",
    properties: { surface: "background", app_version: "1.0.1", game_running: true,
      screen_count: 0, multi_monitor: false },
  }]);

  poll(position(5, { region: "PangZhen" }));
  poll({ state: "unavailable-map" });
  poll({ state: "connecting" });
  poll(position(6));
  state.cleanup();
  BackgroundController();
  assert.equal(state.events.length, 1);

  poll({ state: "waiting-game" });
  poll(position(7, { pid: 456 }));
  poll(position(8, { pid: 456 }));
  poll(position(9, { pid: 789 }));
  assert.deepEqual(state.events.map(({ event }) => event), Array(3).fill("live_position_received"));
  assert.equal(fetch.mock.callCount(), 0);
  poll({ state: "unsupported-build" });
  poll({ state: "unsupported-build" });
  assert.equal(fetch.mock.callCount(), 1);
  await new Promise(setImmediate);
  poll({ state: "waiting-game" });
  poll({ state: "unsupported-build" });
  assert.equal(fetch.mock.callCount(), 2);
});
