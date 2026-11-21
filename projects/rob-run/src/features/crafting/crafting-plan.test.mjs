import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const b = await build({entryPoints:[fileURLToPath(new URL('crafting-plan.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {craftingPlan}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const recipe={s:123,n:'Test',req:1,make:[456,2],r:[[1,2],[1,1],[2,1]]};
const character={level:20,bags:{counts:{1:8,2:3}},bank:{counts:{1:4}}};
const profession={skill:25,learned:['123'],unlearned:[],complete:false};
test('batch quantities aggregate repeated materials and multiply output',()=>{
  const p=craftingPlan(recipe,character,profession,3,false);
  assert.equal(p.output,6);assert.deepEqual(p.materials,[{id:1,have:8,need:9,missing:1},{id:2,have:3,need:3,missing:0}]);assert.equal(p.craftable,false);
});
test('saved bank is opt-in and never implies known inventory without bags',()=>{
  assert.equal(craftingPlan(recipe,character,profession,3,true).craftable,true);
  assert.equal(craftingPlan(recipe,{...character,bags:null},profession,1,true).materials[0].have,null);
  assert.equal(craftingPlan(recipe,{...character,bank:null},profession,1,true).inventoryKnown,false);
});
test('unknown inventory and unknown recipe knowledge never claim craftability',()=>{
  const p=craftingPlan(recipe,undefined,undefined,1,false);assert.equal(p.materials[0].have,null);assert.equal(p.materials[0].missing,null);assert.equal(p.craftable,false);
  const knownMaterials=craftingPlan(recipe,character,undefined,1,false);assert.equal(knownMaterials.materialsReady,true);assert.equal(knownMaterials.craftable,false);
});
test('invalid batch input is bounded and absent material data stays unknown',()=>{
  assert.equal(craftingPlan(recipe,character,profession,NaN,false).crafts,1);
  assert.equal(craftingPlan(recipe,character,profession,99999,false).crafts,999);
  assert.equal(craftingPlan({...recipe,r:undefined},character,profession,1,false).materialsReady,false);
});
test('material availability recomputes after a live inventory change',()=>{
  assert.equal(craftingPlan(recipe,character,profession,1,false).craftable,true);
  assert.equal(craftingPlan(recipe,{...character,bags:{counts:{1:0,2:3}}},profession,1,false).craftable,false);
});
