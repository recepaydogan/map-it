import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/services/auth/email-hashes.ts"], bundle: true,
  platform: "node", format: "esm", write: false,
  plugins: [{ name: "auth-session", setup(api) {
    api.onResolve({ filter: /supabase-client$/ }, () => ({ path: "client", namespace: "test" }));
    api.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents:
      "export const getSupabaseClient = () => globalThis.__emailHashClient;" }));
  } }],
});
const { startEmailHashSync } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

function setup(t) {
  const calls = [];
  let listener;
  let unsubscribed = false;
  globalThis.__emailHashClient = { auth: { onAuthStateChange(callback) {
    listener = callback;
    return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } };
  } } };
  globalThis.overwolf = { extensions: { current: {
    generateUserEmailHashes(email, callback) { calls.push({ email, callback }); },
    setUserEmailHashes(hashes, callback) { calls.push({ hashes, callback }); },
  } } };
  t.after(() => { delete globalThis.overwolf; delete globalThis.__emailHashClient; });
  return { calls, emit(event, email) { listener(event, email ? { user: { email } } : null); },
    get unsubscribed() { return unsubscribed; } };
}

test("restored and new sessions send the email through Overwolf's hashing API", t => {
  const h = setup(t);
  const stop = startEmailHashSync();
  h.emit("INITIAL_SESSION", "player@example.invalid");
  assert.equal(h.calls[0].email, "player@example.invalid");
  h.calls[0].callback({ success: true });
  h.emit("TOKEN_REFRESHED", "player@example.invalid");
  assert.equal(h.calls.length, 1);
  h.emit("USER_UPDATED", "changed@example.invalid");
  assert.equal(h.calls[1].email, "changed@example.invalid");
  h.calls[1].callback({ success: true });
  h.emit("SIGNED_OUT");
  assert.deepEqual(h.calls[2].hashes, {});
  h.calls[2].callback({ success: true });
  h.emit("SIGNED_IN", "another@example.invalid");
  assert.equal(h.calls[3].email, "another@example.invalid");
  stop();
  assert(h.unsubscribed);
});

test("sign-out waits for an in-flight hash update and then clears it", t => {
  const h = setup(t);
  startEmailHashSync();
  h.emit("SIGNED_IN", "player@example.invalid");
  h.emit("SIGNED_OUT");
  assert.equal(h.calls.length, 1);
  h.calls[0].callback({ success: true });
  assert.deepEqual(h.calls[1].hashes, {});
});

test("signed-out startup clears any identity left by an earlier session", t => {
  const h = setup(t);
  startEmailHashSync();
  h.emit("INITIAL_SESSION");
  assert.deepEqual(h.calls[0].hashes, {});
});

test("failed API calls retry on the next auth event without logging the email", t => {
  const h = setup(t);
  const messages = [];
  const warn = console.warn;
  console.warn = (...args) => messages.push(args.join(" "));
  t.after(() => { console.warn = warn; });
  startEmailHashSync();
  h.emit("SIGNED_IN", "player@example.invalid");
  h.calls[0].callback({ success: false });
  assert.equal(h.calls.length, 1);
  h.emit("TOKEN_REFRESHED", "player@example.invalid");
  assert.equal(h.calls.length, 2);
  assert(messages.every(message => !message.includes("player@example.invalid")));
});

test("cleanup prevents queued writes after the background owner stops", t => {
  const h = setup(t);
  const stop = startEmailHashSync();
  h.emit("SIGNED_IN", "player@example.invalid");
  h.emit("USER_UPDATED", "changed@example.invalid");
  stop();
  h.calls[0].callback({ success: true });
  assert.equal(h.calls.length, 1);
  assert(h.unsubscribed);
});

test("browser, older runtime and unconfigured accounts are safe no-ops", t => {
  setup(t);
  delete globalThis.overwolf;
  startEmailHashSync()();
  globalThis.overwolf = { extensions: { current: {} } };
  startEmailHashSync()();
  globalThis.overwolf.extensions.current = {
    generateUserEmailHashes() { assert.fail("No account should be sent"); },
    setUserEmailHashes() { assert.fail("No account should be cleared"); },
  };
  globalThis.__emailHashClient = null;
  startEmailHashSync()();
});
