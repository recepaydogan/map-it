import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSearchWorker, loadSearchFunctions, queryWorker } from "./lib/map-search-worker-harness.mjs";

const catalog = JSON.parse(await readFile(new URL("../public/data/map-search/index.json", import.meta.url), "utf8"));
const search = await loadSearchFunctions();

test("worker preserves item, quest and localized results on the real catalog", { timeout: 10000 }, async t => {
  const worker = createSearchWorker();
  t.after(() => worker.terminate());
  const translations = { "ItemSparse:6302:4": "Testflügel", "Quest:91724:0": "Testinstrumente" };
  worker.postMessage({ type: "global-init", catalog, translations });
  const expected = search.prepareGlobalSearch(catalog, (name, key) => translations[key] ?? name);
  let id = 0;
  for (const query of ["delicate", "Delicate Insect Wing", "delciate insect wing", "Delicate Instruments", "Testflügel", "Testinstrumente", "zzzzzzzz", ""]) {
    const result = await queryWorker(worker, { type: "global-query", id: ++id, query, mapId: "azeroth" });
    assert.deepEqual(result.results, search.searchGlobalCatalog(expected, query, "azeroth"), query);
  }
});

test("local worker preserves every matching pin and distance ranking using transferable buffers", { timeout: 10000 }, async t => {
  const worker = createSearchWorker();
  t.after(() => worker.terminate());
  const prepare = search.createSearchTextPreparer();
  const documents = catalog.locations.map(({ point }) => search.createMapSearchDocument(point,
    [point.name, point.label, ...(point.questOffers ?? []).map(quest => quest.name)],
    [point.region, point.label, point.subtype, point.x, point.y].join(" "), prepare));
  worker.postMessage({ type: "local-init", documents });
  let id = 0;
  for (const query of ["r", "rot hide", "Delicate Instruments", "hamish", "zzzzzzzz", ""]) {
    const origin = { x: 5000, y: 5000 };
    const result = await queryWorker(worker, { type: "local-query", id: ++id, query, origin });
    const expected = search.searchMapDocuments(documents, query, origin).map(({ point, score }) => ({ id: point.id, score }));
    const actual = Array.from(result.indices, (documentIndex, index) => ({ id: documents[documentIndex].point.id, score: result.scores[index] }));
    assert.deepEqual(actual, expected, query);
    assert(result.indices instanceof Uint32Array);
    assert(result.scores instanceof Float32Array);
  }
});

test("search indexing and a query burst leave the main event loop available", { timeout: 10000 }, async t => {
  const worker = createSearchWorker();
  t.after(() => worker.terminate());
  let timerRan = false;
  const timer = setTimeout(() => { timerRan = true; }, 0);
  t.after(() => clearTimeout(timer));
  worker.postMessage({ type: "global-init", catalog, translations: {} });
  for (let id = 1; id < 30; id++) worker.postMessage({ type: "global-query", id, query: "zzzzzzzz", mapId: "azeroth" });
  const result = await queryWorker(worker, { type: "global-query", id: 30, query: "Delicate Insect Wing", mapId: "azeroth" });
  assert(timerRan, "the UI event loop must run while the search is pending");
  assert.equal(result.id, 30);
  assert(result.results.items.some(item => item.id === "6302"));
});
