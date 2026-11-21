import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const TARGET_GAME_ID = 777;
const targetGame = { id: 7771, classId: TARGET_GAME_ID, processId: 1,
  title: "Test Game", isRunning: true };
const otherGame = { id: 7651, classId: 765, processId: 2,
  executionPath: "C:/World of Warcraft/_retail_/Wow.exe",
  title: "World of Warcraft", isRunning: true };
// Exercise the actual controller callbacks with a simulated supported game.
// This does not assert that a production Overwolf game ID has been assigned.
const mocks = {
  "../game-config": `
    export const isTargetGame = (game) => game?.classId === 777;
    export const isGameDetectionCandidate = isTargetGame;
  `,
  "../features/live-position/game-position-reader": `
    export const startGamePositionReader = (pid) => {
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
    export const hideOverlayWindows = () => call("hide-overlays");
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
  globalThis.window = {
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

test("minimap opens once per game process and closes on game exit", (t) => {
  const h = startController(t);
  h.events.gameUpdated.emit({ gameInfo: targetGame, runningChanged: false });
  assert.equal(h.calls.filter((call) => call === "expand-minimap").length, 1);
  h.events.gameUpdated.emit({ gameInfo: { ...targetGame, isRunning: false }, runningChanged: true });
  assert.ok(h.calls.includes("hide-overlays"));
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

test("minimap hotkey ignores an unrelated running game", async (t) => {
  const h = startController(t, { game: otherGame });
  h.events.hotkeyPressed.emit({ name: "toggle_overlay" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.includes("expand-minimap"), false);
});
