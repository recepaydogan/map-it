import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createSearchWorker, loadSearchFunctions, queryWorker } from "./lib/map-search-worker-harness.mjs";

const catalog = JSON.parse(await readFile(new URL("../public/data/map-search/index.json", import.meta.url), "utf8"));
const search = await loadSearchFunctions();
const start = performance.now();
const prepared = search.prepareGlobalSearch(catalog);
const prepare = search.createSearchTextPreparer();
const documents = catalog.locations.map(({ point }) => search.createMapSearchDocument(point,
  [point.name, point.label, ...(point.questOffers ?? []).map(quest => quest.name)],
  [point.region, point.label, point.subtype, point.x, point.y].join(" "), prepare));
const setupMs = +(performance.now() - start).toFixed(1);
const queries = ["r", "ro", "rot", "rot hide", "Delicate Insect Wing", "delciate insect wing", "zzzzzzzz"];
const measurements = queries.map(query => {
  let time = performance.now();
  search.searchGlobalCatalog(prepared, query, "azeroth");
  const globalMs = performance.now() - time;
  time = performance.now();
  search.searchMapDocuments(documents, query, null);
  return { query, globalMs: +globalMs.toFixed(1), localMs: +(performance.now() - time).toFixed(1) };
});
const globalWorker = createSearchWorker(), localWorker = createSearchWorker();
try {
  globalWorker.postMessage({ type: "global-init", catalog, translations: {} });
  localWorker.postMessage({ type: "local-init", documents });
  await Promise.all([
    queryWorker(globalWorker, { type: "global-query", id: 0, query: "", mapId: "azeroth" }),
    queryWorker(localWorker, { type: "local-query", id: 0, query: "", origin: null }),
  ]);
  let previous = performance.now(), worstDelay = 0;
  const heartbeat = setInterval(() => {
    const now = performance.now();
    worstDelay = Math.max(worstDelay, now - previous - 5);
    previous = now;
  }, 5);
  try {
    for (let i = 0; i < queries.length; i++) await Promise.all([
      queryWorker(globalWorker, { type: "global-query", id: i + 1, query: queries[i], mapId: "azeroth" }),
      queryWorker(localWorker, { type: "local-query", id: i + 1, query: queries[i], origin: null }),
    ]);
    const report = { locations: catalog.locations.length, setupMs, measurements, workerMainEventLoopDelayMs: +worstDelay.toFixed(1) };
    await writeFile(new URL("../data/map-search-performance-after.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
  } finally { clearInterval(heartbeat); }
} finally { await Promise.all([globalWorker.terminate(), localWorker.terminate()]); }
