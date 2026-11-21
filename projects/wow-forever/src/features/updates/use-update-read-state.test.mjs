import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("./use-update-read-state.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false });
const { hasUnreadUpdateVersion, lastReadUpdateVersion, markUpdateVersionRead, subscribeUpdateReadState, UPDATE_READ_KEY } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("unread compares numeric release versions and does not reopen older notes on a downgrade", () => {
  assert.equal(hasUnreadUpdateVersion(null, "4.4.8"), true);
  assert.equal(hasUnreadUpdateVersion("invalid", "4.4.8"), true);
  assert.equal(hasUnreadUpdateVersion("4.4.7", "4.4.8"), true);
  assert.equal(hasUnreadUpdateVersion("4.4.8", "4.4.8"), false);
  assert.equal(hasUnreadUpdateVersion("4.4.10", "4.4.8"), false);
  assert.equal(hasUnreadUpdateVersion("4.4.9", "4.4.10"), true);
});

test("marking the visible release read notifies every same-window subscriber and keeps newer read versions", t => {
  const priorWindow=globalThis.window, priorStorageEvent=globalThis.StorageEvent;
  const values=new Map();const events=new EventTarget();
  globalThis.StorageEvent=class extends Event {};
  globalThis.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},
    addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
  t.after(()=>{globalThis.window=priorWindow;globalThis.StorageEvent=priorStorageEvent});
  let control=0,page=0;
  const stopControl=subscribeUpdateReadState(()=>control++),stopPage=subscribeUpdateReadState(()=>page++);
  markUpdateVersionRead("4.4.8");
  assert.equal(lastReadUpdateVersion(),"4.4.8");assert.equal(control,1);assert.equal(page,1);
  markUpdateVersionRead("4.4.8");assert.equal(control,1);
  values.set(UPDATE_READ_KEY,"4.4.10");markUpdateVersionRead("4.4.8");
  assert.equal(lastReadUpdateVersion(),"4.4.10");assert.equal(page,1);
  stopControl();stopPage();
});
