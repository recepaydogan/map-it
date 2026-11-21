import assert from "node:assert/strict";
import test from "node:test";
import { expandMinimap, hideOverlayWindows, toggleMinimap } from "./window-manager.ts";

function harness(t, initial = null) {
  let current = initial;
  let generation = 0;
  const calls = [];
  globalThis.localStorage = { getItem: () => null };
  globalThis.overwolf = { windows: {
    getWindow(name, callback) { callback({ success: Boolean(current && name === "overlay_map"), window: current }); },
    obtainDeclaredWindow(name, callback) {
      if (name === "overlay_map") current ??= { id: `minimap-${++generation}`, stateEx: "hidden" };
      callback({ success: true, window: name === "overlay_map" ? current : { id: name, stateEx: "hidden" } });
    },
    close(id, callback) { calls.push(["close", id]); current = null; callback({ success: true }); },
    restore(id, callback) { calls.push(["restore", id]); current.stateEx = "normal"; callback({ success: true }); },
    hide(id, callback) { calls.push(["hide", id]); if (id === current?.id) current.stateEx = "hidden"; callback({ success: true }); },
  } };
  t.after(() => { delete globalThis.overwolf; delete globalThis.localStorage; });
  return { calls, current: () => current };
}

test("the minimap toggles open and closed without a live position, and reopens its hidden surface", async t => {
  const h = harness(t);
  await toggleMinimap();
  assert.equal(h.current().stateEx, "normal");
  assert.deepEqual(h.calls, [["restore", "minimap-1"]]);
  await toggleMinimap();
  assert.equal(h.current().stateEx, "hidden");
  await toggleMinimap();
  assert.equal(h.current().stateEx, "normal");
  assert.deepEqual(h.calls, [["restore", "minimap-1"], ["hide", "minimap-1"],
    ["close", "minimap-1"], ["restore", "minimap-2"]]);
});

test("opening an already visible minimap leaves it intact; game exit still hides it", async t => {
  const h = harness(t, { id: "visible-minimap", stateEx: "normal" });
  await expandMinimap();
  assert.deepEqual(h.calls, []);
  await hideOverlayWindows();
  assert.equal(h.current().stateEx, "hidden");
  assert.ok(h.calls.some(([action, id]) => action === "hide" && id === "visible-minimap"));
});
