import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const bundle=await build({entryPoints:[fileURLToPath(new URL("./saved-character-merge.ts",import.meta.url))],bundle:true,write:false,format:"esm",platform:"node"});
const {mergeSavedCharacter,mergeSavedCharacterBatch}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const saved={id:"addon:3:Player-1-A",guid:"Player-1-A",name:"Hunter",realm:"Realm",classId:"hunter",raceId:"nightelf",faction:"alliance",level:2,
  updatedAt:1000,savedAt:1000,source:"addon",professions:[{id:"alchemy",skill:25,type:"primary"}],bags:{counts:{765:3}},bank:null,quests:{active:[{id:"456"}]}};
test("saved domains merge without replacing fresher GEP level/XP or other characters",()=>{
  const live={...saved,source:"gep",updatedAt:5000,savedAt:500,level:3,experience:12,bags:null};
  const merged=mergeSavedCharacter(live,saved);
  assert.equal(merged.level,3);assert.equal(merged.experience,12);assert.equal(merged.bags.counts[765],3);assert.equal(merged.savedAt,1000);
  const state={characters:{[live.id]:live,alt:{...saved,id:"alt",name:"Alt"}},currentId:live.id,liveConnected:true,phase:"synced"};
  const next=mergeSavedCharacterBatch(state,[saved],saved.id);assert.ok(next.characters.alt);assert.equal(next.liveConnected,true);
});
test("a delayed older saved record cannot replace a newer saved inventory",()=>{
  const newer={...saved,savedAt:2000,updatedAt:6000,bags:{counts:{765:9}},source:"gep"};
  assert.equal(mergeSavedCharacter(newer,saved),newer);
});

test("fresh completed IDs replace stale GEP copies without overwriting live basics", () => {
  const live = { ...saved, source: "gep", updatedAt: 5000, savedAt: 500, level: 4,
    completedQuests: { capturedAt: 500, ids: ["6"] } };
  const snapshot = { ...saved, completedQuests: { capturedAt: 1000, ids: ["6", "7"] } };
  const merged = mergeSavedCharacter(live, snapshot);
  assert.equal(merged.level, 4);
  assert.deepEqual(merged.completedQuests.ids, ["6", "7"]);
  assert.equal(mergeSavedCharacter(merged, { ...snapshot, updatedAt: 400 }), merged);
});
test("a differently named or ambiguous saved character cannot take over the live selection",()=>{
  const current={...saved,id:"gep:session",guid:"",realm:"",source:"gep",name:"Other",updatedAt:5000};
  const state={characters:{[current.id]:current},currentId:current.id,liveConnected:true};
  assert.equal(mergeSavedCharacterBatch(state,[saved],saved.id).currentId,current.id);
  const sameName={...current,name:"Hunter"};
  const ambiguous={...state,characters:{[sameName.id]:sameName,alt:{...saved,id:"alt",guid:"Player-2-B",realm:"Other realm"}}};
  assert.equal(mergeSavedCharacterBatch(ambiguous,[saved],saved.id).currentId,sameName.id);
});


test("a fresh reload root replaces the nameless live GEP identity",()=>{
  const anonymous={...saved,id:"gep:session",guid:"",name:"",realm:"",source:"gep",savedAt:undefined,updatedAt:5000,quests:null};
  const state={characters:{[anonymous.id]:anonymous},currentId:anonymous.id,liveConnected:true};
  const next=mergeSavedCharacterBatch(state,[saved],saved.id,6000);
  assert.equal(next.currentId,saved.id);assert.equal(next.savedCurrentId,saved.id);assert.equal(next.savedCurrentAt,6000);
  assert.equal(next.characters[anonymous.id],undefined);assert.equal(next.characters[saved.id].name,"Hunter");
});

test("a later reload switches a previously bound character to the new saved root.current",()=>{
  const first={...saved,source:"gep"};
  const second={...saved,id:"addon:second",guid:"Player-2-B",name:"Second",updatedAt:7000,savedAt:7000};
  const state={characters:{[first.id]:first},currentId:first.id,liveConnected:true,savedCurrentId:first.id,savedCurrentAt:5000};
  const next=mergeSavedCharacterBatch(state,[first,second],second.id,8000);
  assert.equal(next.currentId,second.id);assert.ok(next.characters[first.id]);
});
