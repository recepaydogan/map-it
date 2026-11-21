import assert from "node:assert/strict";
import { APP_HOTKEYS, isHotkeyName } from "../src/features/settings/hotkey-config.ts";
import { parseMapWindowCommand } from "../src/features/map/map-window-command.ts";
import { parseWorldHotkeyFeedback } from "../src/features/worlds/world-hotkey-feedback.ts";

let checks = 0;
const check = (name, run) => { run(); checks += 1; console.log(`PASS ${name}`); };

check("app hotkey declarations are unique and recognized", () => {
  const names = APP_HOTKEYS.map(hotkey => hotkey.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, 6);
  for (const name of names) assert.equal(isHotkeyName(name), true);
  assert.equal(isHotkeyName("unknown"), false);
});

check("settings hotkeys have display labels and fallback bindings", () => {
  assert(APP_HOTKEYS.every(hotkey => hotkey.labelKey.startsWith("settings.hotkey") && hotkey.fallback));
});

check("minimap zoom commands accept only the bounded command contract", () => {
  for (const direction of ["in", "out"]) {
    const parsed = parseMapWindowCommand({ type: "zoom", direction, ignored: true });
    assert.deepEqual(parsed, { type: "zoom", direction });
    assert.equal(Object.isFrozen(parsed), true);
  }
  for (const value of [null, {}, { type: "pan", direction: "in" }, { type: "zoom", direction: "sideways" }])
    assert.equal(parseMapWindowCommand(value), null);
});

check("minimap center commands accept only finite world coordinates", () => {
  const parsed = parseMapWindowCommand({ type: "center", x: -1616, z: -960, ignored: true });
  assert.deepEqual(parsed, { type: "center", x: -1616, z: -960 });
  assert.equal(Object.isFrozen(parsed), true);
  for (const value of [
    { type: "center", x: Number.NaN, z: 0 },
    { type: "center", x: 0, z: Number.POSITIVE_INFINITY },
    { type: "center", x: "0", z: 0 },
  ]) assert.equal(parseMapWindowCommand(value), null);
});

check("hotkey feedback rejects malformed or unbounded coordinates", () => {
  const saved = parseWorldHotkeyFeedback({ type: "pin", status: "saved", x: -5, y: 70, z: 10 });
  assert.deepEqual(saved, { type: "pin", status: "saved", x: -5, y: 70, z: 10 });
  assert.equal(Object.isFrozen(saved), true);
  for (const value of [
    { type: "pin", status: "saved", x: Number.NaN, y: 70, z: 10 },
    { type: "pin", status: "saved", x: 30_000_001, y: 70, z: 10 },
    { type: "pin", status: "other" },
    { type: "minimap", status: "saved" },
  ]) assert.equal(parseWorldHotkeyFeedback(value), null);
  assert.deepEqual(parseWorldHotkeyFeedback({ type: "pin", status: "limit" }), { type: "pin", status: "limit" });
  assert.deepEqual(parseWorldHotkeyFeedback({ type: "minimap", status: "unavailable" }), { type: "minimap", status: "unavailable" });
});

console.log(`${checks} map-window command checks passed.`);
