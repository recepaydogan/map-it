import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("language_changed sends only from/to custom properties, without app context", async t => {
  const captures = [];
  globalThis.__languageCaptures = captures;
  t.after(() => { delete globalThis.__languageCaptures; });
  const mocks = {
    "posthog-js": `export default {init(){},capture:(event,props)=>globalThis.__languageCaptures.push({event,props})};`,
    "./app-context": `export const readScreenContext=async()=>({screen_count:2});export const readAppVersion=async()=>"4.4.12";`,
  };
  const bundle = await build({ entryPoints: [fileURLToPath(new URL("./analytics.ts", import.meta.url))],
    bundle: true, write: false, format: "esm", platform: "node",
    define: { "import.meta.env": JSON.stringify({ VITE_POSTHOG_KEY: "test" }) },
    plugins: [{ name: "analytics-mocks", setup(p) {
      p.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
      p.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path] }));
    } }],
  });
  const analytics = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  analytics.initAnalytics("desktop");
  analytics.setAnalyticsContext({ app_version: "4.4.12", surface: "desktop", game_running: true });
  analytics.track("language_changed", { from: "en", to: "de", extra: "must not ship" });
  assert.deepEqual(captures, [{ event: "language_changed", props: { from: "en", to: "de" } }]);
});
