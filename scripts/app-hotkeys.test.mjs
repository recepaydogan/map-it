import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const window = {};
vm.runInNewContext(await fs.readFile(new URL("../public/map-it-hotkeys.js", import.meta.url), "utf8"), { window, console });
const {project,restoreMissing} = window.__MAP_IT_HOTKEYS__;
const app = { hotkeys: { toggle_overlay:"toggle_overlay",toggle_companion:"mi_valheim_toggle_companion" },manifest:{data:{game_targeting:{game_ids:[21668]},hotkeys:{toggle_overlay:{default:"Ctrl+Alt+V",title:"Minimap"},toggle_companion:{default:"Ctrl+Shift+C",title:"Companion"}}}} };
const key = (name,binding) => ({name,binding,IsUnassigned:!binding});

test("another game's empty binding never overwrites the current game's assigned keys", () => {
  const projected=project({success:true,globals:[],games:{21668:[key("toggle_overlay","Ctrl+Alt+V")],765:[key("toggle_overlay","")]}},app);
  assert.equal(projected.games[21668][0].binding,"Ctrl+Alt+V");
  assert.equal(projected.games[765],undefined);
  assert.equal(projected.globals.length,0);
});

test("a module without registered game IDs does not create game-scoped shortcuts", async () => {
  const noGame = { ...app, manifest: { data: { ...app.manifest.data, game_targeting: {} } } };
  const result = { success: true, globals: [], games: {} };
  const api = { assign() { assert.fail("There is no game ID to assign"); } };
  assert.equal(await restoreMissing(api, result, noGame), result);
  assert.equal(Object.keys(project(result, noGame).games).length, 0);
});

test("a claimed default stays unassigned and existing custom bindings are preserved", async () => {
  const calls=[];
  const result={success:true,globals:[],games:{21668:[key("toggle_overlay","Ctrl+F8"),key("mi_valheim_toggle_companion","")]}};
  const api={get(callback){callback(result);},getAllApps(callback){callback({success:true,apps:{solo:{globals:[],games:{21668:[key("solo","Ctrl+Shift+C")]}}},platform:[]});},assign(options,callback){calls.push(options);callback({success:true});}};
  const updated=await restoreMissing(api,result,app);
  assert.deepEqual(calls,[]);
  assert.equal(updated.games[21668][0].binding,"Ctrl+F8");
  assert.equal(updated.games[21668][1].IsUnassigned,true);
});

test("a native assignment rejection does not trigger an alternate shortcut", async () => {
  const result={success:true,globals:[],games:{21668:[key("toggle_overlay",""),key("mi_valheim_toggle_companion","Ctrl+Shift+C")]}};
  const calls=[];
  const api={get(callback){callback(result);},assign(options,callback){calls.push(options);callback({success:false});}};
  await restoreMissing(api,result,app);
  assert.equal(calls.length,1);
  assert.equal(calls[0].virtualKey,86);
  assert.equal(result.games[21668][0].IsUnassigned,true);
});

test("the original default is used when free and unavailable APIs never produce fake assignments",async()=>{
  const calls=[];
  const result={success:true,globals:[],games:{21668:[key("toggle_overlay",""),key("mi_valheim_toggle_companion","Ctrl+Shift+C")]}};
  const api={get(callback){callback(result);},assign(options,callback){calls.push(options);result.games[21668][0]=key(options.name,"Ctrl+Alt+V");callback({success:true});}};
  await restoreMissing(api,result,app);
  assert.equal(calls.length,1);assert.equal(calls[0].virtualKey,86);assert.equal(calls[0].modifiers.shift,false);
  const unavailable={success:false,error:"Unavailable"};
  assert.equal(await restoreMissing(api,unavailable,app),unavailable);
});
