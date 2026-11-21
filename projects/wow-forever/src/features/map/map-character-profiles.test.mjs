import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("./map-character-profiles.ts", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "esm" });
const { importAddonCharacters, removeMapCharacter } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const profile = (id, name, source = "addon") => ({id,name,source,classId:"hunter",raceId:"nightelf",faction:"alliance",level:2,professions:[]});

function storage(t, profiles, selected) {
  const priorStorage=globalThis.localStorage, priorWindow=globalThis.window;
  const map=new Map([["gm:map-characters:v1",JSON.stringify(profiles)],["gm:map-selected-character:v1",selected]]);
  globalThis.localStorage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),
    removeItem:key=>map.delete(key),key:index=>[...map.keys()][index]??null,get length(){return map.size}};
  globalThis.window={dispatchEvent(){}};
  t.after(()=>{globalThis.localStorage=priorStorage;globalThis.window=priorWindow});
  return map;
}
test("reload removes the cached nameless GEP profile and selects the saved current character",t=>{
  const anonymous=profile("gep:session","","gep"), first=profile("addon:first","Kimyon"), current=profile("addon:current","Kekiko");
  const map=storage(t,[anonymous,first,current],anonymous.id);
  importAddonCharacters([anonymous,first,current],current.id,anonymous.id);
  assert.deepEqual(JSON.parse(map.get("gm:map-characters:v1")).map(p=>p.name),["Kimyon","Kekiko"]);
  assert.equal(map.get("gm:map-selected-character:v1"),current.id);
});
test("a real character selected by the user is preserved while the nameless profile is removed",t=>{
  const anonymous=profile("gep:session","","gep"), manual={...profile("manual","My character"),source:undefined}, current=profile("addon:current","Kekiko");
  const map=storage(t,[anonymous,manual],manual.id);
  importAddonCharacters([anonymous,current],current.id,anonymous.id,current.id);
  assert.equal(map.get("gm:map-selected-character:v1"),manual.id);
  assert.deepEqual(JSON.parse(map.get("gm:map-characters:v1")).map(p=>p.id),[manual.id,current.id]);
});

test("a newly confirmed WoW character replaces a stale synced selection once", t => {
  const selected = profile("addon:selected", "Kimyon");
  const previous = profile("addon:previous", "Kekiko");
  const current = profile("addon:current", "New");
  const selectedKey = "gm:map-selected-character:v1";
  const map = storage(t, [selected, previous], selected.id);
  importAddonCharacters([selected, previous, current], current.id, previous.id, current.id);
  assert.equal(map.get(selectedKey), current.id);

  map.set(selectedKey, selected.id);
  importAddonCharacters([selected, previous, current], current.id, current.id, current.id);
  assert.equal(map.get(selectedKey), selected.id);

  importAddonCharacters([selected, previous, current], previous.id, current.id, previous.id);
  assert.equal(map.get(selectedKey), previous.id);
});

test("removing the selected character selects a replacement and clears only its filters", t => {
  const removed = { ...profile("manual", "Manual"), source: undefined };
  const other = profile("addon:other", "Other");
  const map = storage(t, [removed, other], removed.id);
  map.set(`gm:character-filters:v1:${removed.id}:categories`, "removed filters");
  map.set(`gm:filter-rail:open-group:${removed.id}`, "quests");
  map.set(`gm:character-filters:v1:${other.id}:categories`, "other filters");
  map.set("unrelated", "keep");
  let notifications = 0;
  globalThis.window.dispatchEvent = () => { notifications++; };
  removeMapCharacter(removed.id);
  assert.deepEqual(JSON.parse(map.get("gm:map-characters:v1")), [other]);
  assert.equal(map.get("gm:map-selected-character:v1"), other.id);
  assert.equal(map.has(`gm:character-filters:v1:${removed.id}:categories`), false);
  assert.equal(map.has(`gm:filter-rail:open-group:${removed.id}`), false);
  assert.equal(map.get(`gm:character-filters:v1:${other.id}:categories`), "other filters");
  assert.equal(map.get("unrelated"), "keep");
  assert.equal(notifications, 1);
});

test("replacement selection prefers an addon character over earlier manual and GEP profiles", t => {
  const removed = profile("addon:removed", "Removed");
  const manual = { ...profile("manual", "Manual"), source: undefined };
  const gep = profile("gep:other", "Live", "gep");
  const addon = profile("addon:other", "Synced");
  const map = storage(t, [removed, manual, gep, addon], removed.id);
  removeMapCharacter(removed.id);
  assert.equal(map.get("gm:map-selected-character:v1"), addon.id);
});

test("replacement selection uses the first remaining character when no addon profile exists", t => {
  const removed = profile("addon:removed", "Removed");
  const first = { ...profile("manual:first", "First"), source: undefined };
  const second = { ...profile("manual:second", "Second"), source: undefined };
  const map = storage(t, [removed, first, second], removed.id);
  removeMapCharacter(removed.id);
  assert.equal(map.get("gm:map-selected-character:v1"), first.id);
});

test("removing an unselected character preserves the selection even when an addon profile remains", t => {
  const removed = profile("addon:removed", "Removed");
  const selected = { ...profile("manual", "Selected"), source: undefined };
  const addon = profile("addon:other", "Synced");
  const map = storage(t, [removed, selected, addon], selected.id);
  removeMapCharacter(removed.id);
  assert.equal(map.get("gm:map-selected-character:v1"), selected.id);
});

test("deleted imported profiles stay removed across cached and fresh syncs", t => {
  const removed = profile("addon:removed", "Same name");
  const other = profile("addon:other", "Same name");
  const map = storage(t, [removed, other], other.id);
  removeMapCharacter(removed.id);
  for (const stamp of [100, 200]) {
    importAddonCharacters([removed, other], removed.id, other.id, removed.id, stamp);
    assert.deepEqual(JSON.parse(map.get("gm:map-characters:v1")), [other]);
    assert.equal(map.get("gm:map-selected-character:v1"), other.id);
  }
});

test("removing the last GEP character stays empty when live updates arrive", t => {
  const removed = profile("gep:removed", "Current", "gep");
  const map = storage(t, [removed], removed.id);
  removeMapCharacter(removed.id);
  importAddonCharacters([{ ...removed, level: 3 }], removed.id, removed.id);
  assert.deepEqual(JSON.parse(map.get("gm:map-characters:v1")), []);
  assert.equal(map.has("gm:map-selected-character:v1"), false);
});
