import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const compiled = (await build({ entryPoints: [fileURLToPath(new URL("runtime/app-content-runtime.ts", import.meta.url))], bundle: true, platform: "browser", format: "cjs", write: false, conditions: ["browser"] })).outputFiles[0].text;
const body = JSON.stringify({ name: "Verified catalog", translated: "İçerik" });
const hash = value => createHash("sha256").update(value).digest("hex");
function harness({ shared = new Map(), download = async () => new Response(body), baseUrl = "https://cdn.example/map-it/v1/game/releases/aaaaaaaaaaaaaaaaaaaaaaaa", subtle = true, appId = "game", virtualLocales = null } = {}) {
  const requests = [];
  const config = { appId, baseUrl, files: { "data/catalog.json": [Buffer.byteLength(body), hash(body)] }, redirects: { "assets/font.woff2": "/shared/fonts/font.woff2" }, aliases: [{ origin: "https://old.example", releasePrefix: true }], prefetch: [], virtualLocales };
  const store = { async match(url) { return shared.get(url)?.clone(); }, async put(url, response) { shared.set(url, response.clone()); }, async delete(url) { return shared.delete(url); } };
  const context = { module: { exports: {} }, TextEncoder, TextDecoder, URL, URLSearchParams, Request, Response, Headers, AbortSignal, DOMException, setTimeout, clearTimeout, Uint8Array, ArrayBuffer, crypto: subtle ? webcrypto : undefined, location: { href: `http://local/apps/${appId}/index.html`, origin: "http://local", search: "" }, caches: { open: async () => store }, fetch: async (...args) => { requests.push(args); return download(...args); } };
  vm.runInNewContext(compiled, context);
  return { runtime: context.module.exports.createRuntime(config), shared, requests, config };
}
test("verified content persists across sessions and remains usable offline", async () => {
  const shared = new Map(); const online = harness({ shared });
  assert.equal(await (await online.runtime.fetchContent("http://local/apps/game/data/catalog.json")).text(), body);
  const offline = harness({ shared, download: async () => { throw new Error("offline"); } });
  assert.equal(await (await offline.runtime.fetchContent("http://local/apps/game/data/catalog.json")).text(), body);
  assert.equal(offline.requests.length, 0);
});
test("corrupt disk content is discarded and downloaded again", async () => {
  const app = harness(); app.shared.set(app.config.baseUrl + "/data/catalog.json", new Response("broken"));
  assert.equal(await (await app.runtime.loadJson("data/catalog.json")).name, "Verified catalog");
  assert.equal(app.requests.length, 1);
});
test("changed releases do not reuse a different release's cache", async () => {
  const shared = new Map(); await harness({ shared }).runtime.loadJson("data/catalog.json");
  const changed = harness({ shared, baseUrl: "https://cdn.example/map-it/v1/game/releases/bbbbbbbbbbbbbbbbbbbbbbbb" });
  await changed.runtime.loadJson("data/catalog.json"); assert.equal(changed.requests.length, 1);
});
test("simultaneous consumers share a download and can cancel independently", async () => {
  let finish; const app = harness({ download: () => new Promise(resolve => { finish = resolve; }) });
  const controller = new AbortController();
  const cancelled = app.runtime.fetchContent("http://local/apps/game/data/catalog.json", { signal: controller.signal });
  const other = app.runtime.loadJson("data/catalog.json");
  const check = assert.rejects(cancelled, { name: "AbortError" }); controller.abort();
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  finish(new Response(body)); await check;
  assert.equal((await other).name, "Verified catalog"); assert.equal(app.requests.length, 1);
});
test("decoded response integrity works without WebCrypto and rejects wrong bytes", async () => {
  const app = harness({ subtle: false }); assert.equal((await app.runtime.loadJson("data/catalog.json")).name, "Verified catalog");
  const broken = harness({ download: async () => new Response("invalid") });
  await assert.rejects(broken.runtime.loadJson("data/catalog.json"), /does not match/);
  assert.equal(broken.shared.size, 0); assert.equal(broken.requests.length, 2);
});
test("original CDN release aliases pin content while fonts stay bundled", async () => {
  const app = harness();
  const url = "https://old.example/releases/cccccccccccccccccccccccc/data/catalog.json";
  assert.equal(app.runtime.resolveAsset(url), app.config.baseUrl + "/data/catalog.json");
  await app.runtime.fetchContent(url); assert.equal(app.requests[0][0], app.config.baseUrl + "/data/catalog.json");
  assert.equal(app.runtime.resolveAsset("http://local/apps/game/assets/font.woff2"), "http://local/shared/fonts/font.woff2");
});
test("WoW locale channel stays pinned without an extra channel download", async () => {
  const app = harness({ appId: "wow-forever" });
  const channel = await (await app.runtime.fetchContent("https://old.example/locales/wow-forever/current.json")).json();
  assert.equal(channel.fingerprint, app.config.baseUrl.split("/").at(-1)); assert.equal(app.requests.length, 0);
});
