import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { startAppLaunchRouter } from "../src/features/app-library/app-launch-router.ts";

const apps = JSON.parse(await fs.readFile(new URL("../public/app-library.json", import.meta.url), "utf8"));
const signal = () => {
  const listeners = new Set();
  return { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener), emit: event => [...listeners].forEach(listener => listener(event)), listeners };
};
function harness({ game = null, selected = "phantom-blade", source = "gamelaunchevent", delayed = false } = {}) {
  const changed = signal(), launched = signal(), requests = [], activations = [];
  let shown = 0;
  const platform = { games: { getRunningGameInfo: callback => delayed ? requests.push(callback) : callback(game), onGameInfoUpdated: changed }, extensions: { onAppLaunchTriggered: launched } };
  const stop = startAppLaunchRouter({ platform, apps, current: () => selected, initial: { source },
    activate: (id, launch) => { activations.push({ id, launch }); if (id) selected = id; }, showLibrary: () => shown++ });
  return { changed, launched, requests, activations, stop, shown: () => shown };
}
test("all 12 game IDs boot the matching module with GameLaunch context and no host reveal", () => {
  for (const app of apps) for (const classId of app.gameIds) {
    const h = harness({ game: { classId, isRunning: true } });
    assert.deepEqual(h.activations, [{ id: app.id, launch: { source: "gamelaunchevent" } }]);
    assert.equal(h.shown(), 0); h.stop();
  }
});
test("delayed cold GameLaunch never boots the previously selected game", () => {
  const h = harness();
  assert.equal(h.activations[0].id, null); assert.equal(h.shown(), 0);
  h.changed.emit({ gameInfo: { classId: 8032, isRunning: true } });
  assert.equal(h.activations.at(-1).id, "minecraft");
  h.changed.emit({ gameInfo: { classId: 8032, isRunning: true } });
  assert.equal(h.activations.length, 2); h.stop();
});
test("ROB RUN's detected class ID is targeted and switches the active module", async () => {
  const classId = 28318;
  const manifest = JSON.parse(await fs.readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));
  assert.ok(manifest.data.game_targeting.game_ids.includes(classId));
  assert.ok(manifest.data.launch_events.some(event => event.event === "GameLaunch" && event.event_data.game_ids.includes(classId)));

  const h = harness({ source: "dock", selected: "valheim" });
  h.changed.emit({ gameInfo: { classId, id: 283181, isRunning: true } });
  assert.deepEqual(h.activations.at(-1), { id: "rob-run", launch: { source: "gamelaunchevent" } });
  h.stop();
});
test("game transition cancels an older asynchronous launch probe", () => {
  const h = harness({ delayed: true });
  h.changed.emit({ gameInfo: { classId: 21668, isRunning: true } });
  h.requests[0]({ classId: 28310, isRunning: true });
  assert.deepEqual(h.activations.map(item => item.id), ["valheim"]); h.stop();
});
test("manual launch opens the library only when there is no selection", () => {
  const empty = harness({ source: "dock", selected: null }); assert.equal(empty.shown(), 1); empty.stop();
  const saved = harness({ source: "dock" }); assert.equal(saved.shown(), 0);
  assert.deepEqual(saved.activations, [{ id: "phantom-blade", launch: { source: "dock" } }]); saved.stop();
});
test("warm launch preserves the source and parameter for a newly selected module", () => {
  const h = harness({ game: { classId: 25918, isRunning: true } });
  h.launched.emit({ origin: "overwolf-extension://example/background.html?source=urlscheme", parameter: "mapit://open" });
  assert.deepEqual(h.activations.at(-1), { id: "elden-ring", launch: { source: "urlscheme", parameter: "mapit://open" } }); h.stop();
});
test("unsupported games do not select a module and teardown cancels pending work", () => {
  const h = harness({ delayed: true });
  h.changed.emit({ gameInfo: { classId: 999999, isRunning: true } }); assert.equal(h.activations.length, 0);
  h.stop(); h.requests[0]({ classId: 28268, isRunning: true });
  assert.equal(h.activations.length, 0); assert.equal(h.changed.listeners.size, 0); assert.equal(h.launched.listeners.size, 0);
});
