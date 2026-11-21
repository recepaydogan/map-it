import assert from "node:assert/strict";
import {
  DEFAULT_LAUNCH_PREFERENCES,
  normalizeLaunchPreferences,
  shouldAutoMoveDesktopMap,
} from "../src/features/settings/launch-preferences.ts";
import { defaultDimensionView } from "../src/features/worlds/world-types.ts";
import {
  readWorldCamera2d,
  readWorldCamera3d,
  readWorldViewMode,
  writeWorldCamera2d,
  writeWorldCamera3d,
  writeWorldViewMode,
} from "../src/features/worlds/world-view-state.ts";
import {
  LINKED_WORLD_PREVIEW,
  parseWorldPreviewState,
  readWorldPreviewState,
  resolveWorldPreview,
  writeWorldPreviewState,
} from "../src/features/worlds/world-preview-state.ts";

let checks = 0;
const check = (name, run) => {
  run();
  checks += 1;
  console.log(`PASS ${name}`);
};

check("legacy camera and mode remain valid fallbacks on both full-map surfaces", () => {
  const view = {
    ...defaultDimensionView(),
    mode: "3d",
    camera2d: { x: 12, z: -8, zoom: 0.5 },
    camera3d: { x: 12, y: 70, z: -8, yaw: 1, pitch: 0.5, distance: 80, cutawayY: null },
  };
  assert.equal(readWorldViewMode(view, "desktop"), "3d");
  assert.equal(readWorldViewMode(view, "in-game"), "3d");
  assert.deepEqual(readWorldCamera2d(view, "in-game"), view.camera2d);
  assert.deepEqual(readWorldCamera3d(view, "desktop"), view.camera3d);
});

check("desktop and in-game cameras and modes persist without contaminating each other", () => {
  const base = { ...defaultDimensionView(), visibleCategories: ["village"] };
  const desktop2d = { x: 128, z: -64, zoom: 1 };
  const game2d = { x: -512, z: 256, zoom: 0.25 };
  const desktop3d = { x: 1, y: 70, z: 2, yaw: 0.2, pitch: 0.6, distance: 96, cutawayY: null };
  const game3d = { x: 9, y: 20, z: -4, yaw: -1, pitch: 0.3, distance: 42, cutawayY: 18 };
  let view = writeWorldCamera2d(base, "desktop", desktop2d);
  view = writeWorldCamera2d(view, "in-game", game2d);
  view = writeWorldCamera3d(view, "desktop", desktop3d);
  view = writeWorldCamera3d(view, "in-game", game3d);
  view = writeWorldViewMode(view, "desktop", "3d");
  view = writeWorldViewMode(view, "in-game", "2d");

  assert.deepEqual(readWorldCamera2d(view, "desktop"), desktop2d);
  assert.deepEqual(readWorldCamera2d(view, "in-game"), game2d);
  assert.deepEqual(readWorldCamera3d(view, "desktop"), desktop3d);
  assert.deepEqual(readWorldCamera3d(view, "in-game"), game3d);
  assert.equal(readWorldViewMode(view, "desktop"), "3d");
  assert.equal(readWorldViewMode(view, "in-game"), "2d");
  assert.deepEqual(view.visibleCategories, ["village"]);
  assert.equal(readWorldCamera2d({ ...view, camera2dBySurface: {
    ...view.camera2dBySurface,
    "in-game": null,
  } }, "in-game"), null);
});

check("second-screen preference migrates old records and preserves explicit opt-out", () => {
  assert.equal(normalizeLaunchPreferences({}).moveDesktopMapToSecondMonitor,
    DEFAULT_LAUNCH_PREFERENCES.moveDesktopMapToSecondMonitor);
  assert.equal(normalizeLaunchPreferences({ moveDesktopMapToSecondMonitor: false })
    .moveDesktopMapToSecondMonitor, false);
  assert.equal(normalizeLaunchPreferences({ moveDesktopMapToSecondMonitor: "yes" })
    .moveDesktopMapToSecondMonitor, true);
  assert.equal(shouldAutoMoveDesktopMap({
    ...DEFAULT_LAUNCH_PREFERENCES,
    autoOpenAppWithGame: false,
  }), false);
  assert.equal(shouldAutoMoveDesktopMap({
    ...DEFAULT_LAUNCH_PREFERENCES,
    moveDesktopMapToSecondMonitor: false,
  }), false);
  assert.equal(shouldAutoMoveDesktopMap(DEFAULT_LAUNCH_PREFERENCES), true);
});

check("detached preview remains window-local and cannot inherit live selection changes", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const desktopKey = "preview:desktop", gameKey = "preview:in-game";
  writeWorldPreviewState(storage, desktopKey, { mode: "detached", worldId: "world-b" });
  assert.deepEqual(readWorldPreviewState(storage, desktopKey), { mode: "detached", worldId: "world-b" });
  assert.deepEqual(readWorldPreviewState(storage, gameKey), LINKED_WORLD_PREVIEW);
  assert.deepEqual(resolveWorldPreview(readWorldPreviewState(storage, desktopKey), "world-c", ["world-a", "world-b", "world-c"]), {
    state: { mode: "detached", worldId: "world-b" }, worldId: "world-b", detached: true,
  });
  assert.deepEqual(resolveWorldPreview(readWorldPreviewState(storage, gameKey), "world-c", ["world-a", "world-b", "world-c"]), {
    state: LINKED_WORLD_PREVIEW, worldId: "world-c", detached: false,
  });
});

check("detached preview fails closed when its world or stored record is invalid", () => {
  assert.deepEqual(parseWorldPreviewState({ mode: "detached", worldId: "" }), LINKED_WORLD_PREVIEW);
  assert.deepEqual(parseWorldPreviewState({ mode: "other", worldId: "world-a" }), LINKED_WORLD_PREVIEW);
  assert.deepEqual(resolveWorldPreview({ mode: "detached", worldId: "forgotten" }, "world-a", ["world-a"]), {
    state: LINKED_WORLD_PREVIEW, worldId: "world-a", detached: false,
  });
  assert.deepEqual(resolveWorldPreview({ mode: "detached", worldId: "forgotten" }, "missing", ["world-a"]), {
    state: LINKED_WORLD_PREVIEW, worldId: null, detached: false,
  });
});

console.log(`${checks} window synchronization checks passed.`);
