import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const mocks = {
  "../features/settings/launch-preferences": `
    export const getLaunchPreferences = () => globalThis.__monitorTest.preferences;
  `,
  "./window-manager": `
    export const MAIN_WINDOW_MIN_HEIGHT = 840;
    export const MAIN_WINDOW_MIN_WIDTH = 1300;
    export const bringWindowToFront = () => Promise.resolve();
    export const cancelMainWindowBoundsCorrection = () => {};
    export const centerWindowOnMonitor = (_name, monitor) => {
      globalThis.__monitorTest.calls.push("move-main");
      globalThis.__monitorTest.windowInfo.monitorId = monitor.id;
      globalThis.__monitorTest.windowInfo.left = monitor.x;
    };
    export const surfaceWindowOverExternalApp = () => {
      globalThis.__monitorTest.calls.push("surface-main");
      return Promise.resolve();
    };
  `,
};

const bundled = await build({
  entryPoints: [fileURLToPath(new URL("./game-launch-monitor-switch.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  plugins: [{
    name: "monitor-switch-test-mocks",
    setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, (args) => {
        if (args.path in mocks) return { path: args.path, namespace: "monitor-switch-test-mock" };
      });
      plugin.onLoad({ filter: /.*/, namespace: "monitor-switch-test-mock" },
        (args) => ({ contents: mocks[args.path], loader: "js" }));
    },
  }],
});

const event = () => {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    emit(payload) { for (const listener of listeners) listener(payload); },
  };
};

let moduleId = 0;
const startMonitorSwitch = async (t, { monitorCount, autoOpenAppWithGame = true }) => {
  const calls = [];
  const timers = [];
  const appLaunch = event();
  const gameUpdated = event();
  const gameLaunched = event();
  const displays = Array.from({ length: monitorCount }, (_, index) => ({
    id: String(index + 1), x: index * 1920, y: 0, width: 1920, height: 1080,
    handle: { value: index + 1 },
  }));
  const gameInfo = {
    id: 282681, classId: 28268, processId: 1, isRunning: true,
    monitorHandle: { value: 1 },
  };
  const windowInfo = {
    id: "main-id", name: "main", stateEx: "normal", monitorId: "1",
    left: 0, top: 0, width: 1560, height: 900,
  };
  const overwolf = {
    extensions: { onAppLaunchTriggered: appLaunch },
    games: {
      getRunningGameInfo(done) { done(gameInfo); },
      onGameInfoUpdated: gameUpdated,
      onGameLaunched: gameLaunched,
    },
    utils: { getMonitorsList(done) { done({ success: true, displays }); } },
    windows: {
      getCurrentWindow(done) { done({ success: true, window: windowInfo }); },
      obtainDeclaredWindow(_name, done) {
        calls.push("obtain-main");
        done({ success: true, window: windowInfo });
      },
      restore(_name, done) { calls.push("restore-main"); done({ success: true }); },
    },
  };
  globalThis.__monitorTest = {
    calls, windowInfo, preferences: { autoOpenAppWithGame, autoOpenInGameOverlay: true },
  };
  globalThis.window = {
    overwolf,
    location: { href: "http://localhost/?window=main" },
    screenX: 0,
    screenY: 0,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
  };
  t.after(() => {
    delete globalThis.__monitorTest;
    delete globalThis.window;
  });
  const source = Buffer.from(bundled.outputFiles[0].text).toString("base64");
  const { setupGameLaunchMonitorSwitch } = await import(
    `data:text/javascript;base64,${source}#${++moduleId}`
  );
  setupGameLaunchMonitorSwitch();
  return { calls, appLaunch, fireTimers() {
    for (const callback of timers.splice(0)) callback();
  } };
};

test("single-monitor game launch never obtains or surfaces the desktop window", async (t) => {
  const harness = await startMonitorSwitch(t, { monitorCount: 1 });
  harness.appLaunch.emit({ origin: "gamelaunchevent" });
  assert.deepEqual(harness.calls, []);
});

test("multiple monitors still surface and move the desktop window", async (t) => {
  const harness = await startMonitorSwitch(t, { monitorCount: 2 });
  assert.ok(harness.calls.includes("obtain-main"));
  assert.ok(harness.calls.includes("move-main"));
  assert.ok(!harness.calls.includes("surface-main"));
  harness.fireTimers();
  assert.ok(harness.calls.includes("surface-main"));
  assert.ok(harness.calls.indexOf("move-main") < harness.calls.indexOf("surface-main"));
});

test("desktop launch preference prevents monitor switch from surfacing the window", async (t) => {
  const harness = await startMonitorSwitch(t, { monitorCount: 2, autoOpenAppWithGame: false });
  harness.appLaunch.emit({ origin: "gamelaunchevent" });
  assert.deepEqual(harness.calls, []);
});
