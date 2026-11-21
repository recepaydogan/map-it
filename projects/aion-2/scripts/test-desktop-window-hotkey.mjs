import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const { outputFiles } = await build({
  stdin: {
    contents: `export * from './src/overwolf-utils/desktop-window-hotkey';
      export { toggleWindow, restoreMainWindowBehindGame } from './src/overwolf-utils/window-manager';`,
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
  },
  bundle: true, platform: "node", format: "esm", write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realWarn = console.warn;
let count = 0;

async function check({ state = "normal", focused = false, visibility = "hidden", expected,
  missing = false, behindGame = false, legacy = false }) {
  const api = await import(`${moduleUrl}#${count++}`);
  const actions = [];
  const timers = new Map();
  const warnings = [];
  let queries = 0;
  let current = missing ? null : {
    id: "main", name: "main", stateEx: state, state,
    left: 2050, top: 60, width: 1560, height: 900,
  };
  const bounds = current && { ...current };
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay };
    timers.set(timer, timer);
    return timer;
  };
  globalThis.clearTimeout = timer => timers.delete(timer);
  console.warn = (...args) => warnings.push(args);
  const ok = callback => callback({ success: true });
  globalThis.overwolf = { windows: {
    getWindow: (_name, callback) => callback({ success: !!current, window: current }),
    obtainDeclaredWindow: (_name, callback) => {
      current ??= { id: "main", name: "main", stateEx: "closed" };
      callback({ success: true, window: current });
    },
    getOpenWindows: callback => {
      queries++;
      if (visibility === "throw") throw new Error("Window query failed");
      callback({ main: {
        document: { hasFocus: () => focused },
        overwolf: { windows: visibility === "unavailable" ? {} : {
          isWindowVisibleToUser: cb => {
            if (visibility === "timeout") {
              const timer = [...timers.values()].find(timer => timer.delay === 500);
              timer.callback();
            } else if (visibility === "error") cb({ success: false, error: "unsupported" });
            else cb({ success: true, visible: visibility });
          },
        } },
      } });
    },
    restore: (_id, callback) => { actions.push("restore"); current.stateEx = "normal"; ok(callback); },
    minimize: (_id, callback) => { actions.push("minimize"); current.stateEx = "minimized"; ok(callback); },
    sendToBack: (_id, callback) => { actions.push("back"); ok(callback); },
    bringToFront: (_id, focus, callback) => { assert.equal(focus, true); actions.push("front"); ok(callback); },
    setTopmost: (_id, topmost, callback) => { actions.push(`topmost:${topmost}`); ok(callback); },
    // A visibility query on the background would answer for the wrong window.
    isWindowVisibleToUser: () => assert.fail("Must query the desktop window's visibility"),
  } };
  if (behindGame) { await api.restoreMainWindowBehindGame(); actions.length = 0; }
  if (legacy) await api.toggleWindow("main");
  else await api.toggleDesktopWindow();
  assert.deepEqual(actions, expected, JSON.stringify({ state, focused, visibility, behindGame, legacy }));
  if (expected.includes("front")) {
    const release = [...timers.values()].find(timer => timer.delay === 1200);
    assert.ok(release, "Foregrounding must schedule release of always-on-top");
    release.callback();
    assert.equal(actions.at(-1), "topmost:false");
    if (state === "maximized") assert.equal(current.stateEx, "maximized", "Covered maximized windows stay maximized");
  }
  if (bounds) {
    for (const key of ["left", "top", "width", "height"]) assert.equal(current[key], bounds[key], `Preserve ${key}`);
  }
  if (missing || behindGame || ["hidden", "closed", "minimized"].includes(state) || legacy) assert.equal(queries, 0);
  if (["unavailable", "error", "timeout", "throw", "unknown"].includes(visibility)) assert.equal(warnings.length, 1);
}

try {
  const front = ["front", "topmost:true"];
  for (const state of ["normal", "maximized"]) {
    for (const visibility of ["hidden", "partial"]) await check({ state, visibility, expected: front });
    await check({ state, focused: true, expected: ["minimize"] });
    for (const visibility of ["full", "fully"]) await check({ state, visibility, expected: ["minimize"] });
  }
  for (const state of ["hidden", "minimized", "closed"]) await check({ state, expected: ["restore", ...front] });
  await check({ missing: true, expected: ["restore", ...front] });
  await check({ behindGame: true, expected: front });
  for (const visibility of ["unavailable", "error", "timeout", "throw", "unknown"]) await check({ visibility, expected: front });
  await check({ legacy: true, expected: ["minimize"] });
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  console.warn = realWarn;
  delete globalThis.overwolf;
}
console.log(`PASS: ${count} desktop hotkey cases (occlusion, focus, restoration, bounds, topmost release, fallback and legacy toggle).`);
