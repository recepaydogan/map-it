import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const calls = [];
let currentUser = "user-a", canFlush = true, changeUser = false;
const client = { auth: { getSession: async () => ({ data: { session: currentUser ? { user: { id: currentUser } } : null }, error: null }), signOut: async () => { calls.push("sign-out"); currentUser = null; return { error: null }; } } };
globalThis.sharedAccountSignoutFixture = { client, flush: async () => { calls.push("flush"); if (changeUser) currentUser = "user-b"; return canFlush; } };
const result = await build({ entryPoints: ["src/services/auth/auth-service.ts"], bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "test-auth", setup(api) {
    api.onResolve({ filter: /supabase-client$/ }, () => ({ path: "client", namespace: "fixture" }));
    api.onResolve({ filter: /shared-account-config$/ }, () => ({ path: "flush", namespace: "fixture" }));
    api.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "client" ? "export const getSupabaseClient=()=>globalThis.sharedAccountSignoutFixture.client;" : "export const flushSharedAccountData=(id)=>globalThis.sharedAccountSignoutFixture.flush(id);" }));
  } }] });
const { signOut } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
function reset() { currentUser = "user-a"; canFlush = true; changeUser = false; calls.length = 0; }
test("shared sign-out waits for saves and blocks unsaved changes", async () => {
  reset(); canFlush = false;
  const blocked = await signOut(); assert.equal(blocked.ok, false); assert.equal(blocked.reason, "unsynced"); assert.deepEqual(calls, ["flush"]);
  reset(); assert.equal((await signOut()).ok, true); assert.deepEqual(calls, ["flush", "sign-out"]);
});
test("a different account signed in during flushing is never signed out", async () => {
  reset(); changeUser = true;
  assert.equal((await signOut()).ok, true); assert.equal(currentUser, "user-b"); assert.deepEqual(calls, ["flush"]);
});
test("explicit discard bypasses the flush", async () => {
  reset(); canFlush = false;
  assert.equal((await signOut({ discardUnsynced: true })).ok, true); assert.deepEqual(calls, ["sign-out"]);
});
