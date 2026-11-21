import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const values = new Map();
globalThis.window = new EventTarget();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

const movement = await import("../src/features/overlay/overlay-keyboard-movement-preference.ts");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url)));

assert.equal(movement.getOverlayKeyboardMovementEnabled(), true);
movement.setOverlayKeyboardMovementEnabled(false);
assert.equal(movement.getOverlayKeyboardMovementEnabled(), false);
assert.equal(values.get(movement.OVERLAY_KEYBOARD_MOVEMENT_STORAGE_KEY), "false");

const expected = {
  move_overlay_up: { default: "Shift+Up", direction: { x: 0, y: -1 } },
  move_overlay_down: { default: "Shift+Down", direction: { x: 0, y: 1 } },
  move_overlay_left: { default: "Shift+Left", direction: { x: -1, y: 0 } },
  move_overlay_right: { default: "Shift+Right", direction: { x: 1, y: 0 } },
};

for (const [name, configuration] of Object.entries(expected)) {
  assert.deepEqual(movement.OVERLAY_MOVE_HOTKEYS[name], configuration.direction);
  assert.equal(manifest.data.hotkeys[name].default, configuration.default);
  assert.equal(manifest.data.hotkeys[name].hold, true);
  assert.equal(manifest.data.hotkeys[name].passthrough, true);
}

console.log("Overlay keyboard movement tests passed.");
