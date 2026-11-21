import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { GAME_CONFIG, isTargetGame } from "../game-config.ts";
import { getDesktopMapFollow, subscribeDesktopMapFollow, toggleDesktopMapFollow } from "../features/live-position/desktop-map-follow.ts";
import { DEFAULT_LAUNCH_PREFERENCES } from "../features/settings/launch-preferences.ts";

const TARGET_GAME_ID = 28268;
const targetGame = { id: 282681, classId: TARGET_GAME_ID, processId: 1,
  title: "World of Warcraft: Forever", isRunning: true };
const launcherGame = { id: 109021, classId: 10902, processId: 5,
  title: "League of Legends", isRunning: true };
const otherGame = { id: 7651, classId: 765, processId: 2,
  executionPath: "C:/World of Warcraft/_retail_/Wow.exe",
  title: "World of Warcraft", isRunning: true };
const betaGame = { ...otherGame, processId: 3,
  executionPath: "C:/World of Warcraft/_classic_beta_/WowB.exe" };

// Bundle the real controller and game config while replacing only its UI and
// Overwolf-facing dependencies. The test exercises its actual launch callbacks.
const mocks = {
  "../features/character-sync/character-sync-service": "export const startCharacterSync = () => () => {};",
  "../features/character-sync/addon-sync-store": `
    export const getAddonSyncState = () => ({ addonVersion: globalThis.__launchTest.addonVersion });
    export const subscribeAddonSync = listener => { globalThis.__launchTest.addonChanged = listener; return () => {}; };`,
  "../features/live-position/gep-event-monitor": "export const startGepEventMonitor = () => () => {};",
  "../features/live-position/ocr-position-tracker": "export const createOcrPositionTracker = () => ({ isLive: () => false, game(active) { globalThis.__launchTest.capture.push(active); } });",
  react: `export const useEffect = (effect) => { globalThis.__launchTest.cleanup = effect(); };`,
  "./background-analytics": `
    export const reportGameRunning = (running) => globalThis.__launchTest.calls.push(running ? "game-running" : "game-stopped");
    export const startBackgroundAnalytics = () => {};
  `,
  "../features/live-position/live-position-store": `
    export const clearLivePosition = () => globalThis.__launchTest.calls.push("clear-position");
    export const subscribeLivePosition = listener => {
      const harness = globalThis.__launchTest;
      harness.onPosition = listener;
      return () => { delete harness.onPosition; };
    };
  `,
  "../features/live-position/tracking-status": `
    export const setTrackingStatus = status => globalThis.__launchTest.calls.push("tracking-" + status);
  `,
  "../features/settings/launch-preferences": `
    export const getLaunchPreferences = () => globalThis.__launchTest.preferences;
    export const enableMinimapOnFirstPosition = () => {
      const h = globalThis.__launchTest;
      if (h.firstPositionHandled) return;
      h.firstPositionHandled = true;
      h.preferences.autoOpenMinimap = true;
    };
  `,
  "../services/analytics/analytics": `
    export const track = (name, props) => globalThis.__launchTest.analytics.push({ name, props });
  `,
  "../overwolf-utils/tray-manager": `
    export const initTray = () => {};
    export const destroyTray = () => {};
  `,
  "../overwolf-utils/window-manager": `
    const call = (name) => { globalThis.__launchTest.calls.push(name); return Promise.resolve(); };
    export const collapseInGameApp = () => call("collapse-overlay");
    export const expandInGameApp = () => call("expand-overlay");
    export const expandMinimap = () => call("expand-minimap");
    export const toggleMinimap = () => call("toggle-minimap");
    export const getMainWindowPresentationGeneration = () => globalThis.__launchTest.presentationGeneration;
    export const getMonitorsList = () => globalThis.__launchTest.monitorResult
      ?? Promise.resolve(globalThis.__launchTest.monitors);
    export const hideOverlayWindows = () => call("hide-overlay");
    export const isMainWindowBehindGame = () => globalThis.__launchTest.mainBehindGame;
    export const isInGameAppVisible = () => Promise.resolve(globalThis.__launchTest.overlayVisible);
    export const restoreMainWindowBehindGame = () => {
      globalThis.__launchTest.presentationGeneration++;
      globalThis.__launchTest.mainBehindGame = true;
      return call("open-main-behind-game");
    };
    export const restoreWindowPreservingPlacement = () => call("restore-main");
    export const revealMainWindowToFront = () => {
      globalThis.__launchTest.presentationGeneration++;
      globalThis.__launchTest.mainBehindGame = false;
      return call("reveal-main");
    };
    export const surfaceWindowOverExternalApp = () => call("surface-main");
    export const toggleWindow = () => call("toggle-main");
  `,
};

const loadController = async ({ mockWindows = true } = {}) => {
  const bundled = await build({
    stdin: {
      contents: `export { BackgroundController } from "./background-controller";
        ${mockWindows ? "" : 'export { closeCurrentWindow } from "../overwolf-utils/window-manager";'} `,
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    plugins: [{
      name: "launch-test-mocks",
      setup(plugin) {
        plugin.onResolve({ filter: /.*/ }, (args) => {
          const useRealWindows = !mockWindows && args.path === "../overwolf-utils/window-manager";
          if (!useRealWindows && args.importer.endsWith("background-controller.tsx") && args.path in mocks) {
            return { path: args.path, namespace: "launch-test-mock" };
          }
          if (args.path === "react") return { path: args.path, namespace: "launch-test-mock" };
        });
        plugin.onLoad({ filter: /.*/, namespace: "launch-test-mock" },
          (args) => ({ contents: mocks[args.path], loader: "js" }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
};
const { BackgroundController } = await loadController();

const event = () => {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    emit(payload) { for (const listener of listeners) listener(payload); },
  };
};

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const startController = (t, { game = targetGame, source = "gamelaunchevent",
  preferences = { autoOpenAppWithGame: true, autoOpenInGameOverlay: true },
  monitors = [{}], controller = BackgroundController, windowApi = {} } = {}) => {
  const calls = [];
  const timers = new Map();
  let nextTimerId = 0;
  const events = {
    gameUpdated: event(),
    hotkeyPressed: event(),
    appLaunch: event(),
    messageReceived: event(),
    windowStateChanged: event(),
  };
  const harness = {
    calls, events, timers, analytics: [], preferences: { ...DEFAULT_LAUNCH_PREFERENCES, ...preferences }, monitors, monitorResult: null, overlayVisible: false,
    mainBehindGame: false, presentationGeneration: 0,
    currentGame: game, addonVersion: null, capture: [],
    timerCount(delay) {
      return [...timers.values()].filter((timer) => timer.delay === delay).length;
    },
    fireTimers(delay = 15_000) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay) continue;
        timers.delete(id);
        timer.callback();
      }
    },
  };
  globalThis.__launchTest = harness;
  const storage = new Map();
  const windowEvents = new EventTarget();
  globalThis.window = {
    location: { search: source ? `?source=${source}` : "" },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(callback, delay) {
      assert.ok([3_000, 15_000].includes(delay));
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  globalThis.overwolf = {
    games: {
      getRunningGameInfo(callback) { callback(harness.currentGame); },
      onGameInfoUpdated: events.gameUpdated,
    },
    extensions: { onAppLaunchTriggered: events.appLaunch },
    settings: { hotkeys: { onPressed: events.hotkeyPressed } },
    utils: { getMonitorsList(done) { done({ success: true, displays: harness.monitors }); } },
    windows: { onMessageReceived: events.messageReceived, onStateChanged: events.windowStateChanged, ...windowApi },
  };
  controller();
  t.after(() => {
    harness.cleanup?.();
    delete globalThis.__launchTest;
    delete globalThis.window;
    delete globalThis.overwolf;
  });
  return harness;
};

test("OCR probes an unknown addon, keeps a supported session and stops for an old addon or game exit", t => {
  const h = startController(t);
  assert.deepEqual(h.capture, [true]);
  h.addonVersion = "0.1.8";
  h.addonChanged();
  assert.deepEqual(h.capture, [true]);
  h.addonVersion = "0.1.5";
  h.addonChanged();
  h.addonVersion = null;
  h.addonChanged();
  h.events.gameUpdated.emit({ runningChanged: true, gameInfo: { ...targetGame, isRunning: false } });
  h.addonChanged();
  assert.deepEqual(h.capture, [true, false, true, false]);
});

test("first position re-enables the minimap and OCR analytics is emitted once per game session", (t) => {
  const h = startController(t, { preferences: { autoOpenMinimap: false } });
  assert.equal(h.calls.filter(call => call === "expand-minimap").length, 0);
  h.onPosition(null);
  assert.equal(h.preferences.autoOpenMinimap, false);
  h.onPosition({ source: "ocr" });
  assert.equal(h.preferences.autoOpenMinimap, true);
  h.onPosition({ source: "gep" });
  h.onPosition({ source: "ocr" });
  assert.equal(h.calls.filter(call => call === "expand-minimap").length, 1);
  assert.deepEqual(h.analytics, [{ name: "location received by ocr", props: { source: "ocr" } }]);
  h.events.gameUpdated.emit({ runningChanged: true, gameInfo: { ...targetGame, isRunning: false } });
  h.preferences.autoOpenMinimap = false;
  h.events.gameUpdated.emit({ runningChanged: true, gameInfo: { ...targetGame, processId: 2 } });
  h.onPosition({ source: "gep" });
  h.onPosition({ source: "ocr" });
  assert.equal(h.calls.filter(call => call === "expand-minimap").length, 1);
  assert.equal(h.analytics.length, 2);
});

test("desktop follow re-arms on the next game's first fix, not on a tracker reconnect", (t) => {
  const h = startController(t);
  const transitions = [];
  const unsubscribe = subscribeDesktopMapFollow(() => transitions.push(getDesktopMapFollow()));
  assert.equal(getDesktopMapFollow(), false);

  h.onPosition({ source: "ocr" });
  assert.equal(getDesktopMapFollow(), true);
  toggleDesktopMapFollow();
  unsubscribe();
  assert.deepEqual(transitions, [true, false]);

  h.onPosition(null);
  h.onPosition({ source: "gep" });
  assert.equal(getDesktopMapFollow(), false, "a reopened desktop sees the previous manual choice");
  toggleDesktopMapFollow();
  assert.equal(getDesktopMapFollow(), true);

  h.events.gameUpdated.emit({ runningChanged: true, gameInfo: { ...targetGame, isRunning: false } });
  assert.equal(getDesktopMapFollow(), false);
  h.events.gameUpdated.emit({ runningChanged: true, gameInfo: { ...targetGame, processId: 2 } });
  assert.equal(getDesktopMapFollow(), false, "game launch alone does not enable follow");
  h.onPosition({ source: "gep" });
  assert.equal(getDesktopMapFollow(), true);
});

// Use real window commands with a fake Overwolf host for X-button scenarios.
const startDesktopLifecycle = async (t, options) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { BackgroundController: controller, closeCurrentWindow } = await loadController({ mockWindows: false });
  const windows = new Map();
  const desktopCalls = [];
  const getWindow = (name, done) => done({ success: windows.has(name), window: windows.get(name) });
  const windowApi = {
    getWindow,
    getCurrentWindow(done) { getWindow("main", done); },
    obtainDeclaredWindow(name, done) {
      if (!windows.has(name)) windows.set(name, { id: name, name, stateEx: "hidden" });
      getWindow(name, done);
    },
    restore(id, done) {
      if (id === "main") desktopCalls.push("restore");
      windows.get(id).stateEx = "normal";
      done({ success: true });
    },
    sendToBack(_id, done) { desktopCalls.push("send-back"); done({ success: true }); },
    close(id, done) {
      if (id === "main") desktopCalls.push("close");
      windows.delete(id);
      globalThis.__launchTest.events.windowStateChanged.emit({ window_name: id, window_state_ex: "closed" });
      done({ success: true });
    },
    hide(id, done) { windows.get(id).stateEx = "hidden"; done({ success: true }); },
    bringToFront(_id, _grabFocus, done) { desktopCalls.push("bring-front"); done({ success: true }); },
    setTopmost(_id, enabled, done) { desktopCalls.push(enabled ? "pin" : "unpin"); done({ success: true }); },
  };
  return { ...startController(t, { ...options, controller, windowApi }), desktopCalls, closeCurrentWindow };
};

test("manifest launches the background window only for the Forever game ID", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../public/manifest.json", import.meta.url)));
  assert.deepEqual(GAME_CONFIG.gameClassIds, [TARGET_GAME_ID]);
  assert.deepEqual(GAME_CONFIG.launcherClassIds, []);
  assert.deepEqual(manifest.data.game_targeting.game_ids, [TARGET_GAME_ID]);
  assert.deepEqual(manifest.data.launch_events[0].event_data.game_ids, [TARGET_GAME_ID]);
  assert.equal(manifest.data.start_window, "background");
  assert.equal(manifest.data.hotkeys.toggle_app.default, "Ctrl+Shift+A");
  assert.equal(manifest.data.hotkeys.toggle_overlay.default, "Ctrl+M");
  assert.equal(DEFAULT_LAUNCH_PREFERENCES.autoOpenInGameOverlay, true);
  assert.ok(manifest.permissions.includes("FileSystem"));
  assert.equal(manifest.data.windows.background.file, "background.html");
  assert.equal(manifest.data.windows.main.grab_focus_on_desktop, false);
  assert.equal(isTargetGame(targetGame), true);
  assert.equal(isTargetGame(otherGame), false);
  assert.equal(isTargetGame(launcherGame), false);
  assert.equal(isTargetGame({ classId: 5426 }), false);
  assert.equal(isTargetGame({ title: "League of Legends" }), false);
});

test("enabled single-monitor launch opens the in-game map after 15 seconds", async (t) => {
  const harness = startController(t);
  assert.ok(harness.calls.includes("game-running"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("reveal-main"));
  assert.equal(harness.timerCount(15_000), 1);
  assert.ok(!harness.calls.includes("expand-overlay"));
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(harness.calls.includes("expand-overlay"));
});

test("auto-open skips multiple monitors and an already visible map", async (t) => {
  const harness = startController(t, { monitors: [{}, {}] });
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
  harness.monitors = [{}];
  harness.overlayVisible = true;
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
});

test("switching auto-open off or stopping the game prevents pending opening", async (t) => {
  const harness = startController(t);
  harness.preferences.autoOpenInGameOverlay = false;
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
  harness.preferences.autoOpenInGameOverlay = true;
  harness.currentGame = { ...targetGame, isRunning: false };
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  harness.currentGame = { ...targetGame, processId: 4 };
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  assert.equal(harness.timers.size, 1);
  harness.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  assert.equal(harness.timers.size, 0);
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
});

test("turning auto-open on during the launch delay uses the restored preference", async (t) => {
  const harness = startController(t, { preferences: {
    autoOpenAppWithGame: true, autoOpenInGameOverlay: false,
  } });
  assert.equal(harness.timers.size, 1);
  harness.preferences.autoOpenInGameOverlay = true;
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(harness.calls.includes("expand-overlay"));
});

test("turning auto-open off during monitor lookup prevents a late opening", async (t) => {
  const harness = startController(t);
  const lookup = deferred();
  harness.monitorResult = lookup.promise;
  harness.fireTimers();
  harness.preferences.autoOpenInGameOverlay = false;
  lookup.resolve([{}]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
});

test("game exit during monitor lookup prevents a late opening", async (t) => {
  const harness = startController(t);
  const lookup = deferred();
  harness.monitorResult = lookup.promise;
  harness.fireTimers();
  harness.currentGame = { ...targetGame, isRunning: false };
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  lookup.resolve([{}]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
});

test("an old monitor lookup cannot open the map during a restarted game", async (t) => {
  const harness = startController(t);
  const oldLookup = deferred();
  harness.monitorResult = oldLookup.promise;
  harness.fireTimers();
  harness.currentGame = { ...targetGame, isRunning: false };
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  harness.currentGame = { ...targetGame, processId: 4 };
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  assert.equal(harness.timers.size, 1);
  oldLookup.resolve([{}]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
  harness.monitorResult = null;
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.filter((call) => call === "expand-overlay").length, 1);
});

test("an unavailable monitor list does not guess that there is one monitor", async (t) => {
  const harness = startController(t);
  harness.monitorResult = Promise.reject(new Error("monitor query failed"));
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
});

test("another WoW game does not trigger the app launch behavior", (t) => {
  const harness = startController(t, { game: otherGame });
  assert.ok(harness.calls.includes("game-stopped"));
  assert.ok(!harness.calls.includes("reveal-main"));
  assert.equal(harness.timers.size, 0);
  harness.events.gameUpdated.emit({ gameInfo: otherGame, runningChanged: true });
  assert.ok(!harness.calls.includes("reveal-main"));
});

test("the LoL launcher does not start the app or overlay", (t) => {
  const harness = startController(t, { game: launcherGame });
  assert.ok(harness.calls.includes("game-stopped"));
  assert.equal(harness.timers.size, 0);
  harness.events.gameUpdated.emit({ gameInfo: launcherGame, runningChanged: true });
  harness.events.appLaunch.emit({ origin: "gamelaunchevent", parameter: "" });
  assert.ok(!harness.calls.includes("reveal-main"));
  assert.ok(!harness.calls.includes("expand-overlay"));
});

test("the former WoW diagnostic id does not launch the app", (t) => {
  const harness = startController(t, { game: betaGame });
  assert.ok(!harness.calls.includes("reveal-main"));
  assert.equal(harness.timers.size, 0);

  harness.events.gameUpdated.emit({ gameInfo: betaGame, runningChanged: true });
  harness.events.appLaunch.emit({ origin: "gamelaunchevent", parameter: "" });
  assert.ok(!harness.calls.includes("reveal-main"));

  harness.events.gameUpdated.emit({
    gameInfo: { ...betaGame, isRunning: false }, runningChanged: true,
  });
  harness.events.gameUpdated.emit({
    gameInfo: { ...betaGame, processId: 4 }, runningChanged: true,
  });
});

test("single-monitor game launch opens desktop behind the game, then raises it after exit", async (t) => {
  const harness = startController(t, { game: null });
  harness.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("reveal-main"));
  assert.equal(harness.calls.filter((call) => call === "open-main-behind-game").length, 1);
  assert.equal(harness.timerCount(15_000), 1);
  harness.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.timers.size, 0);
  assert.ok(harness.calls.includes("hide-overlay"));
  assert.ok(harness.calls.includes("clear-position"));
  assert.equal(harness.calls.filter((call) => call === "reveal-main").length, 1);
});

test("source-less cold start waits for a late game detection before showing desktop", async (t) => {
  const harness = startController(t, { game: null, source: "" });
  assert.equal(harness.timerCount(3_000), 1);
  assert.ok(!harness.calls.includes("reveal-main"));
  harness.currentGame = targetGame;
  harness.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: true });
  assert.equal(harness.timerCount(3_000), 0);
  harness.fireTimers(3_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("reveal-main"));
});

test("source-less desktop start opens main after the game-info retry", (t) => {
  const harness = startController(t, { game: null, source: "" });
  harness.fireTimers(3_000);
  assert.equal(harness.calls.filter((call) => call === "reveal-main").length, 1);
});

test("a source-less startup retry can restore main after a manual launch and close", async (t) => {
  const harness = await startDesktopLifecycle(t, { game: null, source: "", preferences: {
    autoOpenAppWithGame: false, autoOpenInGameOverlay: false, autoOpenMinimap: false,
  } });
  assert.equal(harness.timerCount(3_000), 1);
  harness.events.appLaunch.emit({ origin: "user" });
  await new Promise(setImmediate);
  harness.closeCurrentWindow();
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "bring-front", "pin", "close"]);

  harness.fireTimers(3_000);
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "bring-front", "pin", "close", "restore", "bring-front", "pin"]);
  t.mock.timers.tick(1_200);
  assert.deepEqual(harness.desktopCalls.slice(-2), ["unpin", "unpin"]);
});

test("closing desktop suppresses automatic opening until the next game session", async (t) => {
  const harness = await startDesktopLifecycle(t, { preferences: { autoOpenMinimap: false } });
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "send-back"]);

  harness.closeCurrentWindow();
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "send-back", "close"]);
  assert.equal(harness.timerCount(15_000), 0);
  harness.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: false, focusChanged: true });
  harness.events.appLaunch.emit({ origin: "gamelaunchevent" });
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "send-back", "close"]);

  harness.currentGame = { ...targetGame, isRunning: false };
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "send-back", "close"]);

  harness.currentGame = { ...targetGame, processId: 2 };
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "send-back", "close", "restore", "send-back"]);
  assert.equal(harness.timerCount(15_000), 1);
  assert.equal(harness.preferences.autoOpenAppWithGame, true);

  harness.currentGame = { ...harness.currentGame, isRunning: false };
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "send-back", "close", "restore", "send-back", "bring-front", "pin"]);
  t.mock.timers.tick(1_200);
  assert.equal(harness.desktopCalls.at(-1), "unpin");
});

test("closing main cancels an automatic desktop opening during monitor lookup", async (t) => {
  const harness = startController(t, { game: null });
  const monitors = deferred();
  harness.monitorResult = monitors.promise;
  harness.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: true });
  harness.events.windowStateChanged.emit({ window_name: "main", window_state: "closed" });
  monitors.resolve([{}]);
  await new Promise(setImmediate);
  assert.ok(!harness.calls.includes("open-main-behind-game"));
  harness.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  await new Promise(setImmediate);
  assert.ok(!harness.calls.includes("reveal-main"));
});

test("closing main while game exit is pending prevents the desktop reveal", async (t) => {
  const harness = startController(t);
  await new Promise(setImmediate);
  harness.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  harness.events.windowStateChanged.emit({ window_name: "main", window_state_ex: "closed" });
  await new Promise(setImmediate);
  assert.ok(!harness.calls.includes("reveal-main"));
  harness.events.appLaunch.emit({ origin: "user" });
  assert.ok(harness.calls.includes("reveal-main"));
});

test("minimizing main or closing the minimap does not dismiss desktop opening on exit", async (t) => {
  const harness = startController(t);
  await new Promise(setImmediate);
  harness.events.windowStateChanged.emit({ window_name: "main", window_state_ex: "minimized" });
  harness.events.windowStateChanged.emit({ window_name: "overlay_map", window_state_ex: "closed" });
  harness.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  await new Promise(setImmediate);
  assert.ok(harness.calls.includes("reveal-main"));
});

test("a manual desktop reveal clears the pending reveal on game exit", async (t) => {
  const harness = await startDesktopLifecycle(t, { preferences: { autoOpenMinimap: false } });
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "send-back"]);

  harness.events.appLaunch.emit({ origin: "user" });
  await new Promise(setImmediate);
  t.mock.timers.tick(1_200);
  harness.closeCurrentWindow();
  await new Promise(setImmediate);
  assert.deepEqual(harness.desktopCalls, ["restore", "send-back", "bring-front", "pin", "unpin", "close"]);

  harness.currentGame = { ...targetGame, isRunning: false };
  harness.events.gameUpdated.emit({ gameInfo: harness.currentGame, runningChanged: true });
  await new Promise(setImmediate);
  assert.equal(harness.desktopCalls.at(-1), "close");
});

test("duplicate game launch signals do not surface the desktop on one monitor", async (t) => {
  const harness = startController(t);
  harness.events.appLaunch.emit({ origin: "gamelaunchevent", parameter: "" });
  harness.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.filter((call) => call === "reveal-main").length, 0);
  assert.equal(harness.calls.filter((call) => call === "open-main-behind-game").length, 1);
  assert.equal(harness.timerCount(15_000), 1);
});

test("two monitors open desktop once and do not auto-open the overlay", async (t) => {
  const harness = startController(t, { monitors: [{}, {}] });
  harness.events.appLaunch.emit({ origin: "gamelaunchevent", parameter: "" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.filter((call) => call === "restore-main").length, 1);
  assert.ok(!harness.calls.includes("reveal-main"));
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
  harness.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("reveal-main"));
});

test("desktop auto-open preference stays off on single-monitor game exit", async (t) => {
  const harness = startController(t, { preferences: {
    autoOpenAppWithGame: false, autoOpenInGameOverlay: true,
  } });
  harness.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("open-main-behind-game"));
  assert.ok(!harness.calls.includes("reveal-main"));
});

test("turning off desktop auto-open after it parks the window prevents a reveal on exit", async (t) => {
  const harness = startController(t);
  await new Promise(setImmediate);
  assert.ok(harness.calls.includes("open-main-behind-game"));

  harness.preferences.autoOpenAppWithGame = false;
  harness.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  await new Promise(setImmediate);
  assert.ok(!harness.calls.includes("reveal-main"));
});

test("desktop hotkey raises the parked window before normal toggling", async (t) => {
  const harness = startController(t);
  await new Promise((resolve) => setImmediate(resolve));
  harness.events.hotkeyPressed.emit({ name: "toggle_desktop_app" });
  assert.ok(harness.calls.includes("reveal-main"));
  assert.ok(!harness.calls.includes("toggle-main"));
  harness.events.hotkeyPressed.emit({ name: "toggle_desktop_app" });
  assert.ok(harness.calls.includes("toggle-main"));
});

test("a manual launch wins over a pending automatic monitor check", async (t) => {
  const harness = startController(t);
  harness.events.appLaunch.emit({ origin: "user" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.filter((call) => call === "reveal-main").length, 1);
  assert.ok(!harness.calls.includes("open-main-behind-game"));
});

test("launch preferences can suppress automatic windows", async (t) => {
  const harness = startController(t, { preferences: {
    autoOpenAppWithGame: false, autoOpenInGameOverlay: false,
  } });
  assert.ok(!harness.calls.includes("reveal-main"));
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
});

test("the in-game hotkey manually toggles the map on two monitors", async (t) => {
  const harness = startController(t, { monitors: [{}, {}] });
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("expand-overlay"));
  harness.preferences.autoOpenInGameOverlay = false;
  harness.events.hotkeyPressed.emit({ name: "toggle_app" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(harness.calls.includes("expand-overlay"));
  harness.overlayVisible = true;
  harness.events.hotkeyPressed.emit({ name: "toggle_app" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(harness.calls.includes("collapse-overlay"));
});


test("the Settings minimap hotkey works even when automatic overlays are disabled", async t => {
  const h = startController(t, { preferences: { autoOpenAppWithGame: false, autoOpenInGameOverlay: false } });
  h.events.hotkeyPressed.emit({ name: "toggle_overlay" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.filter(call => call === "toggle-minimap").length, 1);
  assert.ok(!h.calls.includes("expand-overlay"));
});


test("each target-game session opens the minimap once without waiting for coordinates", async t => {
  const h = startController(t, { monitors: [{}, {}] });
  assert.equal(h.calls.filter(call => call === "expand-minimap").length, 1);
  h.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: true });
  assert.equal(h.calls.filter(call => call === "expand-minimap").length, 1);
  h.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  h.events.gameUpdated.emit({ gameInfo: { ...targetGame, processId: 2 }, runningChanged: true });
  assert.equal(h.calls.filter(call => call === "expand-minimap").length, 2);
});

test("disabling minimap auto-open suppresses launch opening but leaves the hotkey available", async t => {
  const h = startController(t, { preferences: { autoOpenMinimap: false } });
  assert.ok(!h.calls.includes("expand-minimap"));
  h.events.hotkeyPressed.emit({ name: "toggle_overlay" });
  assert.equal(h.calls.filter(call => call === "toggle-minimap").length, 1);
});
