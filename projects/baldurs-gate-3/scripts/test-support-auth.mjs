import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
let effect, authChange;
let resets = 0, rotations = 0, refreshes = 0, unsubscribed = false;
const timers = new Map();
let timerId = 0;
const setTimer = callback => { timers.set(++timerId,callback); return timerId; };
const clearTimer = id => timers.delete(id);
const state = {refresh: async () => { refreshes++; }, resetSession: () => { resets++; }};
const store = selector => selector(state);
store.getState = () => state;
const mocks = {
 'react': {useEffect: callback => {effect=callback;},useMemo: callback=>callback()},
 '../data/supabase-client': {getSupabaseClient:()=>({auth:{onAuthStateChange: callback=>{
   authChange=callback; return {data:{subscription:{unsubscribe:()=>{unsubscribed=true;}}}};
 }}})},
 '../store/support-store': {useSupportStore:store},
 '../services/support/support-service': {resetSupportDeviceToken:()=>{rotations++;}},
};
const exports = {};
const source=await readFile(new URL('../src/state/use-support.ts',import.meta.url),'utf8');
runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
 exports, require:name=>mocks[name]??require(name), console,
 setTimeout:setTimer,clearTimeout:clearTimer,setInterval:setTimer,clearInterval:clearTimer,
 window:{addEventListener:()=>{},removeEventListener:()=>{}},navigator:{onLine:true},
});
exports.useSupportWatch();
const cleanup=effect();
const asUser=id=>({user:{id}});
authChange('INITIAL_SESSION',asUser('reporter'));
assert.equal(resets,1);
assert.equal(rotations,0,'Session restore retains device identity');
authChange('TOKEN_REFRESHED',asUser('reporter'));
assert.equal(resets,1,'Token refresh must not erase drafts');
authChange('SIGNED_OUT',null);
assert.equal(resets,2);
assert.equal(rotations,1,'Sign-out retires the device identity immediately');
authChange('SIGNED_IN',asUser('admin'));
assert.equal(resets,3);
authChange('SIGNED_IN',asUser('another-account'));
assert.equal(rotations,2,'Direct account switches also retire identity');
assert.equal(refreshes,0,'Auth callbacks must not call RPCs while holding the auth lock');
for(const callback of timers.values()) callback();
assert.ok(refreshes>0);
cleanup();
assert.equal(timers.size,0);
assert.equal(unsubscribed,true);
console.log('Support auth tests passed: restore, sign-out, direct account switch, token refresh, deferred reads and cleanup.');
