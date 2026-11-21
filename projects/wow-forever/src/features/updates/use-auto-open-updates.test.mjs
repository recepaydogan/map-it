import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const releaseBundle=await build({entryPoints:[fileURLToPath(new URL("./updates-release.ts",import.meta.url))],bundle:true,write:false,format:"esm",platform:"node"});
const {UPDATES_VERSION:version}=await import(`data:text/javascript;base64,${Buffer.from(releaseBundle.outputFiles[0].text).toString("base64")}`);
const mocks={
  react:`export const useState=initial=>globalThis.__updates.state(initial);
    export const useRef=initial=>globalThis.__updates.ref(initial);
    export const useEffect=(effect,deps)=>globalThis.__updates.effect(effect,deps);`,
  "../onboarding/use-onboarding":`export const shouldAutoStartOnboarding=()=>!globalThis.__updates.onboarded;
    export const useOnboardingActive=()=>globalThis.__updates.touring;
    export const isOnboardingActive=()=>globalThis.__updates.touring;`,
  "./use-update-read-state":`export const lastReadUpdateVersion=()=>globalThis.__updates.lastRead;
    export const hasUnreadUpdateVersion=(read,current)=>read!==current;
    export const useUpdateReadState=current=>({unread:globalThis.__updates.lastRead!==current,markRead:globalThis.__updates.markRead});`,
};
const bundle=await build({entryPoints:[fileURLToPath(new URL("./use-auto-open-updates.ts",import.meta.url))],bundle:true,write:false,format:"esm",platform:"node",
  plugins:[{name:"updates-hook-mocks",setup(p){p.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:"mock"}:undefined);
    p.onLoad({filter:/.*/,namespace:"mock"},args=>({contents:mocks[args.path],loader:"js"}));}}]});
const {useAutoOpenUpdates}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function harness(t,{onboarded=true,touring=false,lastRead="4.4.7",active=false}={}){
  const h={onboarded,touring,lastRead,active,opens:0,reads:0,slots:[],effects:[],timers:new Map()};
  const prior=globalThis.window;globalThis.__updates=h;let nextId=0;
  globalThis.window={setTimeout:fn=>{h.timers.set(++nextId,fn);return nextId},clearTimeout:id=>h.timers.delete(id)};
  h.markRead=()=>{h.lastRead=version;h.reads++};
  h.open=()=>{h.opens++;h.active=true};
  h.state=initial=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]=typeof initial==="function"?initial():initial;return[h.slots[i],()=>{}]};
  h.ref=initial=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]={current:initial};return h.slots[i]};
  h.effect=(effect,deps)=>{
    const i=h.effectCursor++;const previous=h.effects[i];
    if(!previous||deps.some((value,index)=>!Object.is(value,previous.deps[index])))h.pending.push(()=>{
      previous?.cleanup?.();h.effects[i]={deps,cleanup:effect()};
    });
  };
  h.render=()=>{h.cursor=0;h.effectCursor=0;h.pending=[];useAutoOpenUpdates(h.active,h.open);for(const effect of h.pending)effect()};
  h.fire=()=>{for(const[id,fn]of [...h.timers]){h.timers.delete(id);fn()}};
  t.after(()=>{for(const effect of h.effects)effect?.cleanup?.();globalThis.window=prior;delete globalThis.__updates});
  return h;
}
test("a returning user opens unread notes once and the visible release becomes read",t=>{
  const h=harness(t);h.render();assert.equal(h.opens,0);h.fire();assert.equal(h.opens,1);
  h.render();assert.equal(h.lastRead,version);assert.equal(h.reads,1);
  h.active=false;h.render();h.fire();assert.equal(h.opens,1);
});
test("first launch never opens notes, even immediately after onboarding completes",t=>{
  const h=harness(t,{onboarded:false});h.render();h.fire();assert.equal(h.opens,0);
  h.touring=true;h.render();h.fire();assert.equal(h.opens,0);
  h.onboarded=true;h.touring=false;h.render();h.fire();assert.equal(h.opens,0);assert.equal(h.lastRead,"4.4.7");
});
test("a returning user replaying onboarding is not interrupted",t=>{
  const h=harness(t,{touring:true});h.render();h.fire();assert.equal(h.opens,0);
  h.touring=false;h.render();h.fire();assert.equal(h.opens,1);
});
test("a version already read never auto-opens",t=>{
  const h=harness(t,{lastRead:version});h.render();h.fire();assert.equal(h.opens,0);
});
test("another window reading the notes cancels an already queued opening",t=>{
  const h=harness(t);h.render();h.lastRead=version;h.fire();assert.equal(h.opens,0);
});
test("manually viewing the page marks it read without an automatic opening",t=>{
  const h=harness(t,{active:true});h.render();h.fire();assert.equal(h.reads,1);assert.equal(h.opens,0);
});
