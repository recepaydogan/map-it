import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const mocks = {
  react: `export const useSyncExternalStore=(subscribe,get)=>{globalThis.__languageTest.subscribe=subscribe;return get()};`,
  "./index": `export default {changeLanguage:async language=>{globalThis.__languageTest.applied.push(language)}};`,
  "../services/optional-usage": `export const track=(event,props)=>globalThis.__languageTest.events.push({event,props});`,
};
const bundle = await build({ entryPoints: [fileURLToPath(new URL("./app-language.ts", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "language-mocks", setup(p) {
    p.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
    p.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path] }));
  } }],
});
let sequence = 0;
async function harness(t, initial = "en") {
  const h = globalThis.__languageTest = { events: [], applied: [] };
  const values = new Map([["gm:app-language", initial]]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  globalThis.window = new EventTarget();
  const module = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${++sequence}`);
  t.after(() => { delete globalThis.__languageTest; delete globalThis.localStorage; delete globalThis.window; });
  return { h, module };
}

test("explicit switches emit only from/to; startup and reselecting the same language emit nothing", async t => {
  const { h, module } = await harness(t);
  assert.equal(module.useAppLanguage(), "en");
  module.setAppLanguage("en");
  assert.deepEqual(h.events, []);
  module.setAppLanguage("fr");
  assert.equal(module.useAppLanguage(), "fr");
  module.setAppLanguage("fr");
  module.setAppLanguage("de");
  assert.deepEqual(h.events, [
    { event: "LANGUAGE_CHANGED", props: { from: "en", to: "fr" } },
    { event: "LANGUAGE_CHANGED", props: { from: "fr", to: "de" } },
  ]);
  assert.deepEqual(h.applied, ["fr", "de"]);
});

test("syncing another window never duplicates events and sets the next switch's source", async t => {
  const { h, module } = await harness(t);
  module.useAppLanguage();
  const unsubscribe = h.subscribe(() => {});
  const event = new Event("storage");
  Object.assign(event, { key: "gm:app-language", newValue: "es-MX" });
  localStorage.setItem("gm:app-language", "es-MX");
  window.dispatchEvent(event);
  assert.equal(module.useAppLanguage(), "es-MX");
  assert.deepEqual(h.events, []);
  module.setAppLanguage("zh-Hant");
  assert.deepEqual(h.events, [{ event: "LANGUAGE_CHANGED", props: { from: "es-MX", to: "zh-Hant" } }]);
  unsubscribe();
});

test("invalid selections are normalized before recording the effective transition", async t => {
  const { h, module } = await harness(t, "ko");
  module.setAppLanguage("unknown");
  assert.deepEqual(h.events, [{ event: "LANGUAGE_CHANGED", props: { from: "ko", to: "en" } }]);
});
