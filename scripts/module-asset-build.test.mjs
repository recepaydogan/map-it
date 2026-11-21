import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { rewriteModuleAssetPaths, workerNeedsContentAdapter } from "./module-asset-build.mjs";

test("compute-only WoW search workers do not duplicate the CDN inventory", () => {
  const name = "apps/wow-forever/assets/map-search-worker-abcdefgh.js";
  assert.equal(workerNeedsContentAdapter(name, "self.onmessage=e=>self.postMessage(e.data);"), false);
  for (const source of ["fetch(url)", 'globalThis["fetch"](url)', 'import("./catalog.js")', 'importScripts("catalog.js")', "new XMLHttpRequest()", "self[key](url)"]) {
    assert.equal(workerNeedsContentAdapter(name, source), true, source);
  }
  assert.equal(workerNeedsContentAdapter("apps/valheim/assets/world-worker-abcdefgh.js", "self.postMessage(1)"), true);
});

test("the WoW OCR worker uses its caller's bundled asset URLs without a CDN adapter", () => {
  const name = "apps/wow-forever/assets/position-ocr/worker.min.js";
  assert.equal(workerNeedsContentAdapter(name, "importScripts(corePath); fetch(langPath);"), false);
  assert.equal(workerNeedsContentAdapter("apps/other/assets/position-ocr/worker.min.js", "fetch(url)"), true);
});

test("Elden Ring tile names resolve from both solo and Map It paths", () => {
  const source = String.raw`const tileName = src => src.replace(/^\/maps\//, "").replace(/\.\w+$/, ""); globalThis.tileUrl = src => '/apps/elden-ring/maps/tiles/' + tileName(src) + '/-2/0/0.webp';`;
  const output = rewriteModuleAssetPaths("apps/elden-ring/assets/app.js", Buffer.from(source));
  const context = {}; vm.runInNewContext(output.toString(), context);
  for (const prefix of ["/maps/", "/apps/elden-ring/maps/"]) assert.equal(context.tileUrl(prefix + "er-overworld.webp"), "/apps/elden-ring/maps/tiles/er-overworld/-2/0/0.webp");
  assert.equal(rewriteModuleAssetPaths("assets/host.js", Buffer.from(source)).toString(), source);
});

test("only anchored path-normalizer regexes are rewritten, preserving other games and text", () => {
  const source = String.raw`const name = value => value.replace(/^\/maps\//, ''); const label = 'maps'; globalThis.normalize = name;`;
  const output = rewriteModuleAssetPaths("apps/elden-ring/assets/app.js", Buffer.from(source)).toString();
  const context = {}; vm.runInNewContext(output, context);
  assert.equal(context.normalize("/apps/minecraft/maps/example"), "/apps/minecraft/maps/example");
  assert(output.includes("const label = 'maps'"));
});
