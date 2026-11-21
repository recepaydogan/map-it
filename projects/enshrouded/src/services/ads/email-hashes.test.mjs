import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasEmailHashConsent,
  setEmailHashConsent,
  syncUserEmailHashes,
} from "./email-hashes.ts";

test("email hashes require account consent and are cleared after sign-out", (t) => {
  const previousWindow = globalThis.window;
  const previousOverwolf = globalThis.overwolf;
  const storage = new Map();
  const events = new EventTarget();
  const calls = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    dispatchEvent: (event) => events.dispatchEvent(event),
  };
  globalThis.overwolf = {
    extensions: { current: {
      generateUserEmailHashes(email, callback) {
        calls.push({ kind: "generate", email, callback });
      },
      setUserEmailHashes(hashes, callback) {
        calls.push({ kind: "clear", hashes, callback });
      },
    } },
  };
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.overwolf = previousOverwolf;
  });

  assert.equal(hasEmailHashConsent("account-1"), false);
  setEmailHashConsent("account-1", true);
  assert.equal(hasEmailHashConsent("account-1"), true);
  assert.equal(hasEmailHashConsent("account-2"), false);

  syncUserEmailHashes("player@example.com");
  assert.equal(calls[0].kind, "generate");
  assert.equal(calls[0].email, "player@example.com");

  // A pending generation must finish before the sign-out clear is sent.
  syncUserEmailHashes(null);
  assert.equal(calls.length, 1);
  calls[0].callback({ success: true });
  assert.deepEqual(calls[1].hashes, {});
  calls[1].callback({ success: true });
  setEmailHashConsent("account-1", false);
  assert.equal(hasEmailHashConsent("account-1"), false);
});
