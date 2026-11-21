import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("background analytics keeps game context without capturing lifecycle events", async t => {
  const calls = [];
  globalThis.__backgroundAnalyticsCalls = calls;
  const previousOverwolf = globalThis.overwolf;
  globalThis.overwolf = { windows: { onStateChanged: {
    addListener() { assert.fail("Visibility tracking must not be registered"); },
  } } };
  t.after(() => {
    delete globalThis.__backgroundAnalyticsCalls;
    if (previousOverwolf === undefined) delete globalThis.overwolf;
    else globalThis.overwolf = previousOverwolf;
  });
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./background-analytics.ts", import.meta.url))],
    bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{ name: "analytics-mock", setup(p) {
      p.onResolve({ filter: /services\/analytics\/analytics$/ }, args => ({ path: args.path, namespace: "mock" }));
      p.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `
        export const initAnalytics = surface => globalThis.__backgroundAnalyticsCalls.push(["init", surface]);
        export const setGameRunning = (running, title) => globalThis.__backgroundAnalyticsCalls.push(["context", running, title]);
        export const track = () => { throw new Error("Unexpected lifecycle event"); };
        export const trackImmediate = track;
      ` }));
    } }],
  });
  const analytics = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  analytics.startBackgroundAnalytics();
  analytics.reportGameRunning(true, "World of Warcraft: Forever");
  analytics.reportGameRunning(false);
  assert.deepEqual(calls, [
    ["init", "background"],
    ["context", true, "World of Warcraft: Forever"],
    ["context", false, undefined],
  ]);
});
