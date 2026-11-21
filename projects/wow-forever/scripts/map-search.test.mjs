import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundle = await build({ stdin: { contents: 'export * from "./src/features/map/map-global-search.ts"; export * from "./src/features/map/map-search-rows.ts";',
  resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env": "{}" } });
const { prepareGlobalSearch, searchGlobalCatalog, sortSearchSources, buildMapSearchRows, groupSearchSources, moreRowId } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const read = async path => JSON.parse(await readFile(new URL(`../public/${path}`, import.meta.url), "utf8"));
const catalog = await read("data/map-search/index.json");
const prepared = prepareGlobalSearch(catalog);
const chunks = await Promise.all(Array.from({ length: 64 }, (_, shard) => read(`data/map-search/items-${shard}.json`)));
const sourceRecords = Object.assign({}, ...chunks.map(chunk => chunk.sources));

test("partial, full and mistyped item names find Delicate Insect Wing and Rex Ashil", () => {
  for (const query of ["delicate", "Delicate Insect Wing", "delicateinsectwing", "delciate insect wing"]) {
    const result = searchGlobalCatalog(prepared, query, "azeroth");
    assert(result.items.some(item => item.id === "6302"), query);
  }
  const sources = sortSearchSources(sourceRecords["6302"], catalog.locations, "azeroth");
  assert.equal(catalog.locations[sources[0].location].point.name, "Rex Ashil");
  assert.equal(sources[0].rates[0].percent, 26.3);
  assert.equal(sources[0].kind, "loot");
});

test("quest titles return the named quest and its actual giver, separately from places", () => {
  const result = searchGlobalCatalog(prepared, "Delicate Instruments", "azeroth");
  const quest = result.quests.find(entry => entry.quest.id === "91724");
  assert(quest);
  assert.equal(quest.location.point.name, "Hamish Bergwort");
  assert.equal(quest.location.point.region, "Elwynn Forest");
  assert(!result.locations.some(entry => entry.point.name === "Hamish Bergwort"));
  assert(searchGlobalCatalog(prepared, "Hamish Bergwort", "azeroth").locations.some(entry => entry.point.name === "Hamish Bergwort"));
});

test("all item routes address real pins; vendor and gathering searches contain usable routes", () => {
  assert(catalog.items.length > 5000);
  for (const item of catalog.items) {
    const sources = sourceRecords[item.id];
    assert.equal(sources.length, item.sourceCount, item.id);
    assert(sources.length > 0);
    for (const source of sources) assert(catalog.locations[source.location], `${item.id}:${source.location}`);
  }
  assert(sourceRecords["4470"].some(source => source.kind === "purchase"));
  assert(sourceRecords["2589"].some(source => source.kind === "gather"));
  assert(Object.values(sourceRecords).some(sources => sources.some(source => source.kind === "quest" && source.via?.[0]?.category === "quests")));
});

test("each acquisition category has an independent preview and keyboard expansion", () => {
  const item = { ...catalog.items.find(item => item.id === "6302"), sources: [
    ...sourceRecords["6302"], { ...sourceRecords["6302"][0], kind: "purchase" },
  ] };
  const groups = groupSearchSources(item);
  assert.deepEqual(groups.map(group => group.kind), ["loot", "purchase"]);
  const quest = searchGlobalCatalog(prepared, "Delicate Instruments", "azeroth").quests[0];
  const rows = buildMapSearchRows([], [item], catalog.locations, {}, [quest]);
  assert.equal(rows.length, 6); // three drops, expand drops, one vendor, one quest
  assert(rows.some(row => row.id === moreRowId("6302-loot")));
  assert.equal(rows.at(-1).target.point.name, "Hamish Bergwort");
  const expanded = buildMapSearchRows([], [item], catalog.locations, { "6302-loot": 33 });
  assert.equal(expanded.length, 10);
  assert(!expanded.some(row => "itemId" in row));
  assert.equal(new Set(expanded.map(row => row.id)).size, expanded.length);
});

test("localized item and quest searches retain their English aliases", () => {
  const localized = prepareGlobalSearch(catalog, (name, key) => key === "ItemSparse:6302:4" ? "Testflügel"
    : key === "Quest:91724:0" ? "Testinstrumente" : name);
  assert(searchGlobalCatalog(localized, "Testflügel", "azeroth").items.some(item => item.id === "6302"));
  assert(searchGlobalCatalog(localized, "Testinstrumente", "azeroth").quests.some(entry => entry.quest.id === "91724"));
  assert(searchGlobalCatalog(localized, "Delicate Insect Wing", "azeroth").items.some(item => item.id === "6302"));
  assert.deepEqual(searchGlobalCatalog(localized, "", "azeroth"), { locations: [], items: [], quests: [] });
});
