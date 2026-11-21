import assert from "node:assert/strict";
import { build } from "esbuild";

let listener;
let unsubscribed = false;
globalThis.__emailHashAuthSubscribe = (callback) => {
  listener = callback;
  return () => { unsubscribed = true; };
};
const compiled = await build({
  entryPoints: ["src/services/auth/email-hashes.ts"],
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{
    name: "mock-auth-events",
    setup(builder) {
      builder.onResolve({ filter: /^\.\/auth-service$/ }, () => ({
        path: "auth-service", namespace: "mock",
      }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
        contents: "export const onAuthChange = globalThis.__emailHashAuthSubscribe;",
      }));
    },
  }],
});
const { startEmailHashSync } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);

// Browser previews must not require Overwolf or subscribe to auth.
startEmailHashSync()();
assert.equal(listener, undefined);

const calls = [];
const callbacks = [];
globalThis.overwolf = { extensions: { current: {
  generateUserEmailHashes(email, callback) {
    calls.push(["generate", email]);
    callbacks.push(callback);
  },
  setUserEmailHashes(hashes, callback) {
    calls.push(["clear", hashes]);
    callbacks.push(callback);
  },
} } };
const finish = (success = true) => callbacks.shift()({ success });
const emit = (email) => listener(email === null ? null : { email });
const stop = startEmailHashSync();

// An existing session uses the real generation API, including after app restart.
emit("  player@example.com  ");
assert.deepEqual(calls, [["generate", "player@example.com"]]);
emit("player@example.com");
assert.equal(calls.length, 1, "Deduplicate pending auth events.");
finish();
emit("player@example.com");
assert.equal(calls.length, 1, "Token refresh must not repeat a successful write.");

// Email changes followed immediately by sign-out must leave hashes cleared.
emit("other@example.com");
emit(null);
assert.equal(calls.length, 2);
finish();
assert.deepEqual(calls.at(-1), ["clear", {}]);
finish();

const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args);
try {
  emit("retry@example.com");
  finish(false);
  const count = calls.length;
  emit("retry@example.com");
  assert.equal(calls.length, count + 1, "Failures must be retryable.");
  finish();
  const generate = overwolf.extensions.current.generateUserEmailHashes;
  overwolf.extensions.current.generateUserEmailHashes = () => {
    throw new Error("secret@example.com");
  };
  emit("secret@example.com");
  overwolf.extensions.current.generateUserEmailHashes = generate;
  emit("secret@example.com");
  finish();
  assert.equal(warnings.length, 2);
  assert.ok(!JSON.stringify(warnings).includes("@"), "Logs must not contain email input.");
} finally {
  console.warn = originalWarn;
}

// Only the newest account is sent after an outstanding write completes.
emit("first@example.com");
emit("second@example.com");
emit("last@example.com");
finish();
assert.deepEqual(calls.at(-1), ["generate", "last@example.com"]);
emit(null);
stop();
assert.equal(unsubscribed, true);
const count = calls.length;
finish();
assert.equal(calls.length, count, "Disposed subscriptions must not issue queued writes.");

const stopRestored = startEmailHashSync();
emit(null);
assert.deepEqual(calls.at(-1), ["clear", {}], "Signed-out startup clears persisted hashes.");
finish();
emit("   ");
assert.deepEqual(calls.at(-1), ["clear", {}], "Never generate hashes for an empty email.");
stopRestored();
delete globalThis.__emailHashAuthSubscribe;
delete globalThis.overwolf;
console.log("Email hash lifecycle tests passed.");
