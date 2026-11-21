import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { resolveStartupSelection } from "../src/features/app-library/app-startup-selection.ts";

const apps = JSON.parse(await fs.readFile(new URL("../public/app-library.json", import.meta.url), "utf8"));
function harness(selected = null, timeoutMs = 1000) {
  const listeners = new Set(), probes = [], selectedIds = [];
  let completed = 0;
  const games = { getRunningGameInfo: callback => probes.push(callback), onGameInfoUpdated: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) } };
  const stop = resolveStartupSelection({ games, apps, current: () => selected, select: id => { selected = id; selectedIds.push(id); }, ready: () => completed++, timeoutMs });
  return { probes, listeners, selectedIds, stop, selected: () => selected, completed: () => completed, changeSelection: id => { selected = id; } };
}

test("every supported running game wins over an old selection before the first screen is ready", () => {
  for (const app of apps) for (const classId of app.gameIds) {
    const h = harness("phantom-blade");
    assert.equal(h.completed(), 0);
    h.probes[0]({ isRunning: true, classId });
    assert.equal(h.selected(), app.id);
    assert.equal(h.completed(), 1);
    assert.equal(h.listeners.size, 0);
    h.stop();
  }
});

test("first use without a supported running game opens home; a saved choice skips it", () => {
  for (const info of [null, {isRunning:false,classId:8032}, {isRunning:true,classId:999999}]) {
    const first = harness(); first.probes[0](info);
    assert.equal(first.selected(), null); assert.equal(first.completed(), 1); first.stop();
    const saved = harness("valheim"); saved.probes[0](info);
    assert.equal(saved.selected(),"valheim"); assert.deepEqual(saved.selectedIds,[]); saved.stop();
  }
});

test("a running-game event settles startup and a stale callback cannot overwrite it", () => {
  const h = harness();
  for (const listener of h.listeners) listener({gameInfo:{isRunning:true,classId:21668}});
  h.probes[0]({isRunning:true,classId:8032});
  assert.equal(h.selected(),"valheim"); assert.equal(h.completed(),1); h.stop();
});

test("another window's newer choice and an unmounted page are protected from late probes", () => {
  const newer = harness("valheim"); newer.changeSelection("peak"); newer.probes[0]({isRunning:true,classId:8032});
  assert.equal(newer.selected(),"peak"); newer.stop();
  const cancelled = harness(); cancelled.stop(); cancelled.probes[0]({isRunning:true,classId:8032});
  assert.equal(cancelled.completed(),0); assert.deepEqual(cancelled.selectedIds,[]);
});

test("a platform timeout unblocks startup and removes its temporary listener", async () => {
  const h = harness("minecraft", 1);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(h.completed(),1); assert.equal(h.selected(),"minecraft"); assert.equal(h.listeners.size,0);
  h.probes[0]({isRunning:true,classId:21668});
  assert.equal(h.selected(),"minecraft"); h.stop();
});
