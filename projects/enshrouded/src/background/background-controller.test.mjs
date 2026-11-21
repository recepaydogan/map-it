import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { GAME_CONFIG, isTargetGame } from "../game-config.ts";
import { getDesktopMapFollow, toggleDesktopMapFollow } from "../features/live-position/desktop-map-follow.ts";
import { DEFAULT_LAUNCH_PREFERENCES } from "../features/settings/launch-preferences.ts";

const TARGET_GAME_ID = 23946;
const targetGame = { id: 239461, classId: TARGET_GAME_ID, processId: 1,
  title: "Enshrouded", isRunning: true };
const launcherGame = { id: 109021, classId: 10902, processId: 5,
  title: "League of Legends", isRunning: true };
const otherGame = { id: 7651, classId: 765, processId: 2,
  executionPath: "C:/World of Warcraft/_retail_/Wow.exe",
  title: "World of Warcraft", isRunning: true };
const unsupportedGame = { ...otherGame, processId: 3,
  executionPath: "C:/World of Warcraft/_classic_beta_/WowB.exe" };

// Bundle the real controller and game config while replacing only its UI and
// Overwolf-facing dependencies. The test exercises its actual launch callbacks.
const mocks = {
  "../features/live-position/enshrouded-position-reader": `
    export const startEnshroudedPositionReader = (pid) => {
      globalThis.__launchTest.calls.push({ kind: "reader-start", pid });
      return () => globalThis.__launchTest.calls.push("reader-stop");
    };
  `,
  react: `export const useEffect = (effect) => { globalThis.__launchTest.cleanup = effect(); };`,
  "./background-analytics": `
    export const noteInGameAutoOpen = () => globalThis.__launchTest.calls.push("note-auto-open");
    export const reportGameDetection = (info, source) => globalThis.__launchTest.calls.push({
      kind: "game-detection", id: info.id, classId: info.classId, source,
    });
    export const reportGameRunning = (running) => globalThis.__launchTest.calls.push(running ? "game-running" : "game-stopped");
    export const startBackgroundAnalytics = () => () => {};
  `,
  "../features/live-position/live-position-store": `
    export const clearLivePosition = () => globalThis.__launchTest.calls.push("clear-position");
    export const subscribeLivePosition = (listener) => {
      globalThis.__launchTest.onPosition = listener;
      return () => { delete globalThis.__launchTest.onPosition; };
    };
  `,
  "../features/overlay/minimap-session": `
    export const isMinimapAutoOpenBlocked = (pid) => globalThis.__launchTest.blockedPid === pid;
    export const blockMinimapAutoOpen = (pid) => {
      globalThis.__launchTest.blockedPid = pid;
      globalThis.__launchTest.calls.push({ kind: "minimap-blocked", pid });
    };
  `,
  "../features/settings/launch-preferences": `
    export const getLaunchPreferences = () => globalThis.__launchTest.preferences;
  `,
  "../overwolf-utils/tray-manager": `
    export const initTray = () => {};
    export const destroyTray = () => {};
  `,
  "../overwolf-utils/window-manager": `
    const call = (name) => { globalThis.__launchTest.calls.push(name); return Promise.resolve(); };
    export const collapseInGameApp = () => call("collapse-overlay");
    export const collapseMinimap = () => call("collapse-minimap");
    export const expandInGameApp = () => call("expand-overlay");
    export const expandMinimap = () => call("expand-minimap");
    export const getMainWindowPresentationGeneration = () => globalThis.__launchTest.presentationGeneration;
    export const getMonitorsList = () => globalThis.__launchTest.monitorResult
      ?? Promise.resolve(globalThis.__launchTest.monitors);
    export const closeOverlayWindows = () => call("close-overlays");
    export const isMainWindowBehindGame = () => globalThis.__launchTest.mainBehindGame;
    export const isInGameAppVisible = () => Promise.resolve(globalThis.__launchTest.overlayVisible);
    export const isMinimapVisible = () => Promise.resolve(globalThis.__launchTest.minimapVisible);
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

const bundled = await build({
  entryPoints: [fileURLToPath(new URL("./background-controller.tsx", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  plugins: [{
    name: "launch-test-mocks",
    setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, (args) => {
        if (args.importer.endsWith("background-controller.tsx") && args.path in mocks) {
          return { path: args.path, namespace: "launch-test-mock" };
        }
        if (args.path === "react") return { path: args.path, namespace: "launch-test-mock" };
      });
      plugin.onLoad({ filter: /.*/, namespace: "launch-test-mock" },
        (args) => ({ contents: mocks[args.path], loader: "js" }));
    },
  }],
});
const { BackgroundController } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);

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
  monitors = [{}] } = {}) => {
  const calls = [];
  const timers = new Map();
  let nextTimerId = 0;
  const events = {
    gameUpdated: event(),
    hotkeyPressed: event(),
    appLaunch: event(),
    messageReceived: event(),
  };
  const harness = {
    calls, events, timers, preferences: { autoOpenMinimap: true, ...preferences }, monitors,
    monitorResult: null, overlayVisible: false, minimapVisible: false, blockedPid: null,
    mainBehindGame: false, presentationGeneration: 0,
    currentGame: game,
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
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    dispatchEvent() {},
    location: { search: source ? `?source=${source}` : "" },
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
    windows: { onMessageReceived: events.messageReceived },
  };
  BackgroundController();
  t.after(() => {
    harness.cleanup?.();
    delete globalThis.__launchTest;
    delete globalThis.window;
    delete globalThis.overwolf;
  });
  return harness;
};

test("desktop follow starts on the first fix of each process and survives a tracker dropout", (t) => {
  const harness = startController(t);
  const firstFix = { x: 10, y: 20 };
  assert.equal(getDesktopMapFollow(), false);
  harness.onPosition(firstFix);
  assert.equal(getDesktopMapFollow(), true);
  toggleDesktopMapFollow();
  harness.onPosition(null);
  harness.onPosition(firstFix);
  assert.equal(getDesktopMapFollow(), false);
  harness.events.gameUpdated.emit({ runningChanged: true, gameInfo: { ...targetGame, isRunning: false } });
  harness.events.gameUpdated.emit({ runningChanged: true, gameInfo: { ...targetGame, processId: 2 } });
  assert.equal(getDesktopMapFollow(), false);
  harness.onPosition(firstFix);
  assert.equal(getDesktopMapFollow(), true);
});

test("manifest launches the background window only for Enshrouded", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../public/manifest.json", import.meta.url)));
  assert.deepEqual(GAME_CONFIG.gameClassIds, [TARGET_GAME_ID]);
  assert.deepEqual(GAME_CONFIG.launcherClassIds, []);
  assert.deepEqual(manifest.data.game_targeting.game_ids, [TARGET_GAME_ID]);
  assert.deepEqual(manifest.data.launch_events[0].event_data.game_ids, [TARGET_GAME_ID]);
  assert.equal(manifest.data.start_window, "background");
  assert.equal(manifest.data.hotkeys.toggle_app.default, "Ctrl+Shift+A");
  assert.equal(manifest.data.hotkeys.toggle_overlay.default, "Ctrl+Alt+E");
  assert.deepEqual(manifest.data.windows.overlay_map.size, { width: 360, height: 360 });
  assert.deepEqual(manifest.data.windows.overlay_map.min_size, { width: 180, height: 180 });
  assert.equal(DEFAULT_LAUNCH_PREFERENCES.autoOpenInGameOverlay, true);
  assert.equal(DEFAULT_LAUNCH_PREFERENCES.autoOpenMinimap, true);
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
  assert.ok(harness.calls.includes("expand-minimap"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!harness.calls.includes("reveal-main"));
  assert.equal(harness.timerCount(15_000), 1);
  assert.ok(!harness.calls.includes("expand-overlay"));
  harness.fireTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(harness.calls.includes("note-auto-open"));
  assert.ok(harness.calls.includes("expand-overlay"));
});

test("one reader per process, replaced on process change and stopped on exit", (t) => {
  const h = startController(t);
  h.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: false });
  assert.equal(h.calls.filter((call) => call?.kind === "reader-start").length, 1);
  h.events.gameUpdated.emit({ gameInfo: { ...targetGame, processId: 9 }, runningChanged: false });
  assert.equal(h.calls.filter((call) => call?.kind === "reader-start").length, 2);
  assert.equal(h.calls.filter((call) => call === "reader-stop").length, 1);
  h.events.gameUpdated.emit({ gameInfo: { ...targetGame, processId: 9, isRunning: false }, runningChanged: true });
  assert.equal(h.calls.filter((call) => call === "reader-stop").length, 2);
});

test("minimap opens once per game process and closes on game exit", (t) => {
  const h = startController(t);
  h.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: false });
  assert.equal(h.calls.filter((call) => call === "expand-minimap").length, 1);
  h.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  assert.ok(h.calls.includes("close-overlays"));
  h.events.gameUpdated.emit({ gameInfo: { ...targetGame, processId: 9 }, runningChanged: true });
  assert.equal(h.calls.filter((call) => call === "expand-minimap").length, 2);
});

test("minimap auto-open preference and per-process manual hide keep the hotkey available", async (t) => {
  const h = startController(t, { preferences: { autoOpenAppWithGame: false,
    autoOpenInGameOverlay: false, autoOpenMinimap: false } });
  assert.ok(!h.calls.includes("expand-minimap"));
  h.events.hotkeyPressed.emit({ name: "toggle_overlay" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.calls.includes("expand-minimap"));
  h.minimapVisible = true;
  h.events.hotkeyPressed.emit({ name: "toggle_overlay" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(h.calls.includes("collapse-minimap"));
  assert.equal(h.blockedPid, targetGame.processId);
  h.preferences.autoOpenMinimap = true;
  h.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  h.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: true });
  assert.equal(h.calls.filter((call) => call === "expand-minimap").length, 1);
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

test("another game does not trigger the app launch behavior", (t) => {
  const harness = startController(t, { game: otherGame });
  assert.ok(harness.calls.includes("game-stopped"));
  assert.ok(!harness.calls.includes("reveal-main"));
  assert.equal(harness.timers.size, 0);
  harness.events.gameUpdated.emit({ gameInfo: otherGame, runningChanged: true });
  assert.ok(!harness.calls.includes("reveal-main"));
  assert.equal(harness.calls.filter((call) => call.kind === "game-detection").length, 0);
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

test("an unsupported game does not launch or report detection", (t) => {
  const harness = startController(t, { game: unsupportedGame });
  assert.deepEqual(harness.calls.filter((call) => call.kind === "game-detection"), []);
  assert.ok(!harness.calls.includes("reveal-main"));
  assert.equal(harness.timers.size, 0);

  harness.events.gameUpdated.emit({ gameInfo: unsupportedGame, runningChanged: true });
  harness.events.appLaunch.emit({ origin: "gamelaunchevent", parameter: "" });
  assert.equal(harness.calls.filter((call) => call.kind === "game-detection").length, 0);
  assert.ok(!harness.calls.includes("reveal-main"));

  harness.events.gameUpdated.emit({
    gameInfo: { ...unsupportedGame, isRunning: false }, runningChanged: true,
  });
  harness.events.gameUpdated.emit({
    gameInfo: { ...unsupportedGame, processId: 4 }, runningChanged: true,
  });
  assert.equal(harness.calls.filter((call) => call.kind === "game-detection").length, 0);
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
  assert.ok(harness.calls.includes("close-overlays"));
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
