import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

// Exercise production lifecycle against a fake Overwolf window manager.
const root = path.resolve(import.meta.dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "minimap-lifecycle-"));
const bundle = path.join(directory, "fixture.cjs");
try {
  await build({ stdin: { contents: `export * from './src/features/overlay/minimap-lifecycle'; export * from './src/features/live-position/live-position-store';`, resolveDir: root }, bundle: true, platform: "node", format: "cjs", outfile: bundle });
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  globalThis.window = Object.assign(new EventTarget(), { localStorage });
  globalThis.BroadcastChannel = undefined;
  const windows = new Map();
  const listeners = new Set();
  let restores = 0;
  const state = (name, value) => {
    windows.set(name, { id: name, name, stateEx: value, state: value });
    for (const listener of listeners) listener({ window_name: name, window_state_ex: value });
  };
  globalThis.overwolf = { windows: {
    onStateChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
    getWindow: (name, callback) => callback({ success: windows.has(name), window: windows.get(name) }),
    obtainDeclaredWindow: (name, callback) => {
      if (!windows.has(name)) state(name, "hidden");
      callback({ success: true, window: windows.get(name) });
    },
    restore: (name, callback) => { restores++; state(name, "normal"); callback({ success: true }); },
    hide: (name, callback) => { state(name, "hidden"); callback({ success: true }); },
  } };
  const api = createRequire(import.meta.url)(bundle);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const sample = (pid, state = "tracking") => api.publishLivePosition({ state, timestamp: Date.now(), processId: pid, nativeMapId: 1000, mapId: "test", point: state === "tracking" ? { x: 1, y: 2 } : undefined });
  const controller = api.startMinimapLifecycle();
  sample(1); await settle();
  assert.equal(restores, 0, "No overlay outside the running game");
  controller.setGameRunning(true); await settle();
  assert.equal(restores, 1, "First verified sample opens overlay");
  for (let i = 0; i < 100; i++) sample(1);
  await settle(); assert.equal(restores, 1, "Position updates do not repeatedly restore the window");
  await api.hideMinimapForSession(); sample(1); await settle();
  assert.equal(windows.get("overlay_map").stateEx, "hidden", "Close survives subsequent samples");
  await controller.toggle();
  assert.equal(windows.get("overlay_map").stateEx, "normal", "Hotkey reopens dismissed overlay");
  state("in_game", "normal"); await settle();
  assert.equal(windows.get("overlay_map").stateEx, "hidden", "Full-app ad rail is never covered");
  state("in_game", "hidden"); await settle();
  assert.equal(windows.get("overlay_map").stateEx, "normal", "Overlay resumes after full app closes");
  sample(1, "identity-unverified"); sample(1); await settle();
  assert.equal(restores, 3, "Respawn does not reopen an already visible window");
  controller.setGameRunning(false); await settle();
  assert.equal(windows.get("overlay_map").stateEx, "hidden", "Game exit hides the overlay");
  sample(2); controller.setGameRunning(true); await settle();
  assert.equal(windows.get("overlay_map").stateEx, "normal", "Next game process auto-opens independently");
  state("in_game", "normal"); await settle(); await controller.toggle();
  assert.equal(windows.get("in_game").stateEx, "hidden", "Minimap hotkey dismisses the full app first");
  assert.equal(windows.get("overlay_map").stateEx, "normal");
  controller.stop(); assert.equal(listeners.size, 0, "Lifecycle cleans up window listeners");
  console.log("PASS: minimap lifecycle, session dismissal, hotkey, respawn, game exit and ad-rail protection.");
} finally {
  if (fs.existsSync(bundle)) fs.unlinkSync(bundle);
  fs.rmdirSync(directory);
}
