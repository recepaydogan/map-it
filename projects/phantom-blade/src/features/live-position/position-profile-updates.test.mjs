import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./position-profile-updates.ts", import.meta.url))],
  bundle: true, platform: "node", format: "esm", write: false,
});
const { startPositionProfileUpdates } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const bundled = JSON.parse(await readFile(new URL("../../../native/position-reader/profiles-v1.json", import.meta.url), "utf8"));

test("fetches on demand and preserves the last accepted catalog across failures and restarts", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  t.after(() => { delete globalThis.localStorage; });
  let response = new Response(null, { status: 503 });
  const fetch = t.mock.method(globalThis, "fetch", async () => response);
  const applied = [];
  const apply = (json, done) => {
    applied.push(JSON.parse(json));
    done({ success: true });
  };
  let updates = startPositionProfileUpdates(apply);
  t.after(() => updates.stop());
  const restart = async (next) => {
    updates.stop();
    response = next;
    updates = startPositionProfileUpdates(apply);
    await updates.refresh();
  };

  assert.deepEqual(applied, [bundled]);
  t.mock.timers.tick(24 * 60 * 60 * 1000);
  assert.equal(fetch.mock.callCount(), 0);
  const updated = { ...bundled, profiles: bundled.profiles.slice(1) };
  await restart(Response.json(updated));
  assert.deepEqual(applied.at(-1), updated);
  await restart(Response.json({ ...updated, profiles: [...updated.profiles, ...updated.profiles] }));
  assert.deepEqual(applied.at(-1), updated);
  await restart(new Response(null, { status: 503 }));
  assert.deepEqual(applied.at(-1), updated);
  const disabled = { schemaVersion: 1, profiles: [] };
  await restart(Response.json(disabled));
  assert.deepEqual(applied.at(-1), disabled);

  updates.stop();
  const requests = fetch.mock.callCount();
  await updates.refresh();
  assert.equal(fetch.mock.callCount(), requests);
});
