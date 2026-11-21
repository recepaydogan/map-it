import assert from "node:assert/strict";
import test from "node:test";
import { closeOverlayWindows, closeWindow } from "./window-manager.ts";

test("closing an unopened window does not create a renderer", async (t) => {
  const previous = globalThis.overwolf;
  const calls = [];
  globalThis.overwolf = {
    windows: {
      getWindow(name, callback) {
        calls.push(`get:${name}`);
        callback({ success: false });
      },
      obtainDeclaredWindow() { calls.push("obtain"); },
      close() { calls.push("close"); },
    },
  };
  t.after(() => { globalThis.overwolf = previous; });

  await closeWindow("in_game");
  assert.deepEqual(calls, ["get:in_game"]);
});

test("game exit closes both existing in-game renderers", async (t) => {
  const previous = globalThis.overwolf;
  const open = new Map([["in_game", "full-map-id"], ["overlay_map", "minimap-id"]]);
  const closed = [];
  globalThis.overwolf = {
    windows: {
      getWindow(name, callback) {
        const id = open.get(name);
        callback(id ? { success: true, window: { id } } : { success: false });
      },
      close(id, callback) {
        closed.push(id);
        callback({ success: true });
      },
    },
  };
  t.after(() => { globalThis.overwolf = previous; });

  await closeOverlayWindows();
  assert.deepEqual(closed.sort(), ["full-map-id", "minimap-id"]);
});
