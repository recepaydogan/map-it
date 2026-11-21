import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = (await readFile(new URL("../src/features/map/map-data.ts", import.meta.url), "utf8"))
  .replaceAll("import.meta.env.VITE_PEAK_CDN_BASE_URL", '"https://cdn.example.test"');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let requests = 0;
let fail = false;
let status = 200;
let legacyRequests = 0;
let response = { schemaVersion: 4, rotation: { levelCount: 208 }, items: [],
  levels: [{ index: 79, mapImage: './data/peak/maps/level-79.webp' }], specialLevels: [] };
const exports = {};
runInNewContext(`${compiled}\nexports.loadCatalog = loadCatalog; exports.cached = () => cachedCatalog;`, {
  exports,
  require: () => ({}),
  fetch: async (url, options) => {
    requests++;
    assert.ok(["https://cdn.example.test/catalog-v4.json", "https://cdn.example.test/catalog.json"].includes(url));
    assert.equal(options.cache, "no-store", "even initial requests bypass the stale HTTP catalog cache");
    if (fail) throw new Error("offline");
    if (url.endsWith('/catalog.json')) {
      legacyRequests++;
      return { ok: true, status: 200, json: async () => ({ ...response, schemaVersion: 3 }) };
    }
    return { ok: status === 200, status, json: async () => response };
  },
});
const first = exports.loadCatalog();
assert.equal(exports.loadCatalog(), first, "concurrent mounts share the in-flight request");
const oldCatalog = await first;
assert.equal(requests, 1);
response = { ...response, specialLevels: [{ scene: "Level_5", mapImage: "./data/peak/maps/final.webp" }] };
const refreshed = await exports.loadCatalog();
assert.equal(requests, 2, "a settled promise cannot pin the initial catalog forever");
assert.notEqual(refreshed, oldCatalog);
assert.equal(exports.cached(), refreshed, "remounts start from the last successful refresh");
assert.equal(refreshed.specialLevels[0].mapImage, "https://cdn.example.test/maps/final.webp");
fail = true;
await assert.rejects(exports.loadCatalog(), /offline/);
assert.equal(exports.cached(), refreshed, "failed refreshes preserve working data");
fail = false;
assert.equal((await exports.loadCatalog()).specialLevels.length, 1, "failed requests can retry");
status = 404;
assert.equal((await exports.loadCatalog()).schemaVersion, 3, 'old CDN falls back only when v4 is absent');
assert.equal(legacyRequests, 1);
status = 500;
await assert.rejects(exports.loadCatalog(), /500/);
assert.equal(legacyRequests, 1, 'server failures must not downgrade a working v4 catalog');
status = 200;
response = { ...response, schemaVersion: 99 };
await assert.rejects(exports.loadCatalog(), /Unsupported/);
console.log("Map catalog cache regressions passed.");
