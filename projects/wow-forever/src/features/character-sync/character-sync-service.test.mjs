import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const mocks = {
  "../live-position/position-addon-installer": `
    export const findPositionClientDirectory = async () => { globalThis.__saved.finds++; return globalThis.__saved.directory; };
    export const readInstalledPositionAddonVersion = async () => globalThis.__saved.installedVersion;
    export const ensurePositionAddonInstalled = async (_info, upgrade) => {
      const h=globalThis.__saved; h.installs++;
      if (upgrade) h.upgrades.push(upgrade);
      const result=h.delayInstall ? await new Promise(resolve=>h.finishInstall=resolve) : h.installResult;
      if(result.state==='installed')h.installedVersion=result.version;
      return result;
    };
  `,
  "./addon-sync-store": `
    export const ADDON_SYNC_REQUEST='test-request';
    export const getAddonSyncState=()=>globalThis.__saved.addon;
    export const updateAddonSync=patch=>Object.assign(globalThis.__saved.addon,patch);
  `,
  "./character-sync-store": `
    export const getCharacterSyncState=()=>globalThis.__saved.state;
    export const writeCharacterSyncState=state=>{globalThis.__saved.state=state;globalThis.__saved.writes++};
  `,
  "../map/map-character-profiles": "export const importAddonCharacters=(...args)=>globalThis.__saved.imports.push(args);",
};
const bundle = await build({ entryPoints: [fileURLToPath(new URL("./character-sync-service.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false,
  plugins: [{name:"saved-file-mocks",setup(p){
    p.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:"mock"}:undefined);
    p.onLoad({filter:/.*/,namespace:"mock"},args=>({contents:mocks[args.path],loader:"js"}));
  }}] });
const { startCharacterSync } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const flush = async () => { for(let i=0;i<40;i++) await Promise.resolve(); };
const lua = value => value === null ? "nil" : typeof value !== "object" ? JSON.stringify(value)
  : `{${Object.entries(value).map(([key,v])=>`[${JSON.stringify(key)}]=${lua(v)}`).join(",")}}`;
const capture = (count=3,delta=0) => {
  const stamp=Math.floor(Date.now()/1000)+delta;
  return `WFM_CharacterDB = ${lua({schemaVersion:1,current:"Player-1-A",savedAt:stamp,characters:{"Player-1-A":{
    guid:"Player-1-A",name:"Hunter",realm:"Realm",region:3,classId:3,raceId:4,faction:"Alliance",level:2,updatedAt:stamp,
    professions:{entries:{1:{skillLineId:171,skill:25,maxSkill:75}}},
    recipes:{171:{skillLineId:171,capturedAt:stamp,learned:{123:true}}},
    bags:{capturedAt:stamp,counts:{765:count}},quests:{capturedAt:stamp,active:{456:{id:456,title:"Quest",objectives:{1:{text:"Target",have:count,need:10}}}}},
  }}})}`;
};
function harness(t,options={}){
  const h=globalThis.__saved={addon:{version:1,savedAt:null,installedAt:null},state:{version:1,characters:{},currentId:null,phase:"waiting"},
    finds:0,installs:0,upgrades:[],reads:[],writes:0,imports:[],timers:new Map(),pending:[],text:capture(),
    directory:'D:\\WoW\\_forever_',installedVersion:'0.1.8',installResult:{state:'installed',changed:true,version:'0.1.8'},...options};
  let serial=0;
  globalThis.StorageEvent=class extends Event { constructor(type,init){super(type);Object.assign(this,init)} };
  globalThis.window=Object.assign(new EventTarget(),{setInterval:(fn,ms)=>{h.timers.set(++serial,{fn,ms});return serial},clearInterval:id=>h.timers.delete(id)});
  globalThis.overwolf={get extensions(){throw new Error("A saved-file reader must not use native objects")},io:{
    dir:(_path,done)=>done({success:true,data:[{name:"ACCOUNT",type:"dir"},{name:"..",type:"dir"},{name:"escape/path",type:"dir"}]}),
    readTextFile:(path,options,done)=>{
      h.reads.push(path);assert.match(path,/\\ACCOUNT\\SavedVariables\\wfm-position-bridge\.lua$/);
      assert.equal(options.maxBytesToRead,4*1024*1024+1);
      const reply=()=>done({success:true,content:h.text});
      if(h.delay)h.pending.push(reply);else reply();
    },
  }};
  h.stop=startCharacterSync();
  h.poll=async()=>{[...h.timers.values()].find(timer=>timer.ms===5000).fn();await flush()};
  h.request=async()=>{window.dispatchEvent(new Event('test-request'));await flush()};
  h.storageRequest=async(key='test-request',newValue='unique-click')=>{
    window.dispatchEvent(new StorageEvent('storage',{key,newValue}));await flush();
  };
  t.after(()=>{h.stop();delete globalThis.__saved;delete globalThis.window;delete globalThis.overwolf;delete globalThis.StorageEvent});
  return h;
}

test("startup and repeated polling leave an up-to-date addon alone",async t=>{
  const h=harness(t);await flush();
  assert.ok(h.finds>0);assert.equal(h.installs,0);assert.ok(h.reads.length>0);assert.equal(h.timers.size,1);
  assert.equal(h.addon.status,'ready',"detect an existing addon without reinstalling");
  for(let i=0;i<15;i++)await h.poll();
  assert.equal(h.installs,0,"there is no automatic minute-based updater");
});

test("startup upgrades an old addon once and marks it for a game reload",async t=>{
  const h=harness(t,{installedVersion:'0.1.7'});
  await flush();
  assert.deepEqual(h.upgrades,[{directory:h.directory,version:'0.1.7'}]);
  assert.equal(h.addon.addonVersion,'0.1.8');
  assert.ok(h.addon.installedAt);
  await h.poll();
  assert.equal(h.installs,1);
});

test("stale state from an earlier automatic install cannot authorize a new installation",async t=>{
  const h=harness(t,{installedVersion:null,addon:{version:1,status:'ready',addonVersion:'0.1.5',installedAt:123,enabled:true}});
  await flush();await h.poll();
  assert.equal(h.installs,0);assert.equal(h.addon.status,'waiting');assert.equal(h.addon.addonVersion,null);
  assert.equal(h.addon.needsReload,true);
});

test("only explicit clicks request installation, including clicks from another app window",async t=>{
  const h=harness(t,{installedVersion:null});await flush();
  await h.storageRequest('unrelated','value');await h.storageRequest('test-request',null);
  assert.equal(h.installs,0);
  await h.request();assert.equal(h.installs,1);assert.equal(h.addon.status,'ready');assert.ok(h.addon.installedAt);
  await h.poll();assert.equal(h.installs,1);
  await h.storageRequest();assert.equal(h.installs,2);
});

test("failed downloads stay retryable and never retry automatically, even with an old addon installed",async t=>{
  const h=harness(t,{installResult:{state:'error'}});await flush();
  await h.request();assert.equal(h.installs,1);assert.equal(h.addon.status,'error');
  for(let i=0;i<15;i++)await h.poll();
  assert.equal(h.installs,1);assert.equal(h.addon.status,'error');
  h.installResult={state:'installed',changed:true,version:'0.1.8'};
  await h.request();assert.equal(h.installs,2);assert.equal(h.addon.status,'ready');assert.equal(h.addon.addonVersion,'0.1.8');
});

test("a missing game waits for a new user click after discovery",async t=>{
  const h=harness(t,{directory:null,installedVersion:null,installResult:{state:'not-found'}});await flush();
  assert.equal(h.addon.status,'game-missing');assert.equal(h.installs,0);
  await h.request();assert.equal(h.installs,1);assert.equal(h.addon.status,'game-missing');
  h.directory='D:\\WoW\\_forever_';await h.poll();assert.equal(h.installs,1);
  h.installResult={state:'installed',changed:true,version:'0.1.8'};await h.request();assert.equal(h.installs,2);assert.equal(h.addon.status,'ready');
});

test("install progress suppresses duplicate clicks and teardown ignores late results",async t=>{
  const h=harness(t,{installedVersion:null,delayInstall:true});await flush();
  await h.request();assert.equal(h.addon.status,'installing');assert.equal(h.installs,1);
  await h.request();await h.storageRequest();await h.poll();
  assert.equal(h.installs,1);assert.equal(h.addon.status,'installing');
  h.stop();h.finishInstall(h.installResult);await flush();
  assert.equal(h.addon.status,'installing');assert.equal(h.timers.size,0);
  window.dispatchEvent(new Event('test-request'));assert.equal(h.installs,1);
});
test("reload-saved files update recipes, inventory and quests without a memory object",async t=>{
  const h=harness(t);await flush();
  let c=h.state.characters[h.state.currentId];assert.equal(c.bags.counts[765],3);assert.equal(c.professions[0].skill,25);
  assert.equal(h.imports.at(-1)[3], c.id, "the profile import receives the confirmed WoW character");
  assert.deepEqual(c.professions[0].learned,["123"]);assert.equal(c.quests.active[0].objectives[0].have,3);
  const writes=h.writes;await h.poll();assert.equal(h.writes,writes,"unchanged files do not churn character storage");
  h.text=capture(7,1);await h.poll();c=h.state.characters[h.state.currentId];
  assert.equal(c.bags.counts[765],7);assert.equal(c.quests.active[0].objectives[0].have,7);assert.ok(c.savedAt);
  assert.equal(h.state.liveConnected,undefined,"a file read does not claim a live connection");
});
test("malformed Lua is rejected as data and preserves the last good character",async t=>{
  const h=harness(t);await flush();const previous=h.state;
  h.text='WFM_CharacterDB = os.execute("never")';await h.poll();
  assert.equal(h.state,previous);assert.equal(h.addon.readError,true);
});
test("teardown rejects late file callbacks and removes polling",async t=>{
  const h=harness(t);await flush();h.delay=true;h.text=capture(9,2);
  await h.poll();assert.equal(h.pending.length,1);const writes=h.writes;
  h.stop();h.pending.shift()();await flush();assert.equal(h.writes,writes);assert.equal(h.timers.size,0);
});
