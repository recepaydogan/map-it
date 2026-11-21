import assert from "node:assert/strict";
import test from "node:test";
import { getDesktopFollowOnFirstFix, writeDesktopFollowTarget } from "./desktop-follow-session.ts";

test("desktop follows only on the first valid position of a game session", (t) => {
  const storage = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } };
  t.after(() => { globalThis.window = previousWindow; });

  assert.equal(getDesktopFollowOnFirstFix(null, true, null), null);
  assert.equal(getDesktopFollowOnFirstFix(42, false, null), null);
  assert.deepEqual(getDesktopFollowOnFirstFix(42, true, null), { session: 42, target: "self" });
  writeDesktopFollowTarget(42, null);
  assert.equal(getDesktopFollowOnFirstFix(42, true, 42), null);
  assert.deepEqual(getDesktopFollowOnFirstFix(42, true, null), { session: 42, target: null });

  writeDesktopFollowTarget(42, 7);
  assert.deepEqual(getDesktopFollowOnFirstFix(42, true, null), { session: 42, target: 7 });
  assert.deepEqual(getDesktopFollowOnFirstFix(43, true, 42), { session: 43, target: "self" });
});
