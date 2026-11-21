import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const result = await build({
  stdin: { contents: `export * from './src/services/support/support-service.ts'; export {calls,control} from 'support-test-client';`, resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "mock-client", setup(api) {
    api.onResolve({ filter: /supabase-client$|^support-test-client$/ }, () => ({ path: "client", namespace: "support-test" }));
    api.onLoad({ filter: /.*/, namespace: "support-test" }, () => ({ contents: `
      export const calls = []; export const control = { userId: null };
      export const getSupabaseClient = () => ({ auth: { getUser: async () => ({data:{user:control.userId ? {id:control.userId} : null}}) },
        rpc: async (name,args) => { calls.push({name,args}); return {data:name.includes('claim') ? 1 : [{id:'thread',game_id:args?.p_game_id,display_name:'Tester',status:'open',last_sender:'user'}],error:null}; } });` }));
  } }],
});
const service = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
const storage = new Map();
globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) } };

test("feedback validates game before sending and includes it in the shared RPC", async () => {
  for (const game of ["", "invalid", "valheim "]) assert.equal((await service.createThread("Tester","Body",game)).ok, false);
  assert.equal(service.calls.length, 0);
  const result = await service.createThread(" Tester "," Body ","valheim");
  assert.equal(result.ok, true); assert.equal(result.value.gameId,"valheim");
  assert.equal(service.calls[0].name,"map_it_support_start_thread");
  assert.equal(service.calls[0].args.p_game_id,"valheim");
  assert.equal(service.calls[0].args.p_body,"Body");
});

test("support tokens are separated by account and guest ownership rotates after claiming", async () => {
  const guestToken = storage.get("map-it:support-token:guest");
  service.control.userId = "account-a"; service.setSupportIdentity("account-a");
  await service.claimDeviceThreads();
  assert.equal(service.calls.at(-1).args.p_token, guestToken);
  assert.equal(storage.has("map-it:support-token:guest"),false);
  await service.fetchMyThreads();
  const first = service.calls.at(-1).args.p_token;
  service.control.userId = "account-b"; service.setSupportIdentity("account-b"); await service.fetchMyThreads();
  assert.notEqual(service.calls.at(-1).args.p_token,first);
  service.control.userId = null; service.setSupportIdentity(null); await service.fetchMyThreads();
  assert.notEqual(service.calls.at(-1).args.p_token,guestToken);
});

test("late support responses cannot restore a signed-out account's conversations", async () => {
  const bundled = await build({
    stdin: { contents: `export * from './src/store/support-store.ts'; export {pending} from 'support-store-mock';`, resolveDir: process.cwd() },
    bundle: true, platform: "node", format: "esm", write: false,
    plugins: [{ name: "deferred-support", setup(api) {
      api.onResolve({ filter: /support-service$|^support-store-mock$/ }, () => ({ path: "service", namespace: "support-store" }));
      api.onLoad({ filter: /.*/, namespace: "support-store" }, () => ({ contents: `
        export const pending = [];
        export const fetchMyThreads = () => new Promise(resolve => pending.push(resolve));
        export const fetchMessages = () => new Promise(resolve => pending.push(resolve));
        export const fetchAllThreads = async () => [];
        export const claimDeviceThreads = async () => 0;
        export const isSupportAdmin = async () => false;
        export const setSupportIdentity = () => {};
        export const createThread = async () => ({ok:false,error:'unused'});
        export const deleteThread = createThread, editMessage = createThread, markThreadRead = createThread, sendMessage = createThread, setThreadStatus = createThread;` }));
    } }],
  });
  const {useSupportStore:store,resetSupportForAccount:reset,pending} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
  reset("first");
  store.getState().setDraft({gameId:"valheim",body:"First account draft"});
  const refresh = store.getState().refresh();
  reset("second");
  pending.shift()([{id:"private-first-account"}]); await refresh;
  assert.deepEqual(store.getState().myThreads,[]);
  assert.equal(store.getState().draft.body,"");
  const messages = store.getState().loadMessages("private-first-account");
  reset(null);
  pending.shift()([{id:"private-message"}]); await messages;
  assert.deepEqual(store.getState().messages,{});
  assert.equal(store.getState().loadingThreadId,null);
});
