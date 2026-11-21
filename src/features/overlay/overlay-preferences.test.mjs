import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./overlay-preferences.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false,
  plugins: [{ name: "window-manager-mock", setup(plugin) {
    plugin.onResolve({ filter: /game-config$/ }, () => ({ path: "game-config", namespace: "game-mock" }));
    plugin.onLoad({ filter: /.*/, namespace: "game-mock" }, () => ({ contents: `
      export const isTargetGame = (game) => game.classId === 777;
    ` }));
    plugin.onResolve({ filter: /overwolf-utils\/window-manager$/ }, () => ({ path: "window-manager", namespace: "mock" }));
    plugin.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `
      export const OVERLAY_MAP_WINDOW = "overlay_map";
      export const getOpenWindow = async () => ({ id: "minimap" });
    ` }));
  } }],
});
let revision = 0;

const setup = async (t, { gameSize = { logicalWidth: 1920, logicalHeight: 1080 },
  oldLayout = null, current = { id: "minimap", left: 780, top: 360, width: 360, height: 360 },
  resizeSucceeds = true } = {}) => {
  const stored = new Map();
  if (oldLayout) stored.set("map-it:overlay-minimap-layout-version", oldLayout);
  let timer, attempts = 0;
  const geometry = [];
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  globalThis.window = {
    setInterval: (callback, delay) => { assert.equal(delay, 500); timer = callback; return 1; },
    clearInterval: () => { timer = undefined; },
    dispatchEvent: () => {},
  };
  globalThis.overwolf = {
    games: { getRunningGameInfo: (callback) => callback({ isRunning: true, classId: 777,
      ...gameSize }) },
    windows: {
      getCurrentWindow: (callback) => callback({ success: true, window: current }),
      changeSize: (size, callback) => { attempts++; geometry.push({ kind: "size", ...size }); callback({ success: resizeSucceeds }); },
      changePosition: (id, left, top, callback) => { geometry.push({ kind: "position", id, left, top }); callback({ success: true }); },
      removeWindowStyle: (_id, _style, callback) => callback({ success: true }),
    },
  };
  t.after(() => { delete globalThis.localStorage; delete globalThis.window; delete globalThis.overwolf; });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${++revision}`);
  return { api, stored, geometry, get timer() { return timer; }, get attempts() { return attempts; } };
};

test("first minimap opens 360 square, 20 px from the game's bottom-right", async (t) => {
  const h = await setup(t);
  const dispose = h.api.initializeOverlayMinimap();
  assert.deepEqual(h.geometry, [
    { kind: "size", window_id: "minimap", width: 360, height: 360, auto_dpi_resize: true },
    { kind: "position", id: "minimap", left: 1540, top: 700 },
  ]);
  assert.equal(h.stored.get("map-it:overlay-minimap-layout-version"), "2");
  assert.equal(h.timer, undefined);
  dispose();
  assert.equal(h.timer, undefined);
});

test("failed resize retries and never marks layout complete before a successful move", async (t) => {
  const h = await setup(t, { resizeSucceeds: false });
  const dispose = h.api.initializeOverlayMinimap();
  assert.equal(h.attempts, 1);
  assert.equal(h.stored.has("map-it:overlay-minimap-layout-version"), false);
  h.timer();
  assert.equal(h.attempts, 2);
  assert.equal(h.geometry.some((call) => call.kind === "position"), false);
  dispose();
});

test("existing custom placement is preserved when upgrading the layout", async (t) => {
  const h = await setup(t, { oldLayout: "1", current: {
    id: "minimap", left: 1450, top: 690, width: 420, height: 320,
  } });
  h.api.initializeOverlayMinimap()();
  assert.deepEqual(h.geometry, []);
  assert.equal(h.stored.get("map-it:overlay-minimap-layout-version"), "2");
});
