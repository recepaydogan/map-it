import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSourceCollector, expandContainerSources, isSearchableRewardSource, REWARD_KINDS, resolveAcquisitionTargets } from "./map-search-sources.mjs";
import { prepareGlobalSearch, searchGlobalCatalog } from "../src/features/map/map-global-search.ts";
import { buildMapSearchRows, moreRowId } from "../src/features/map/map-search-rows.ts";
import { resolveMapFocusPoint } from "../src/features/map/map-focus-request.ts";

const read = path => JSON.parse(readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8"));
const catalog = read("data/map-search/index.json");
const artwork = read("data/reference/entity-artwork.json");
const prepared = prepareGlobalSearch(catalog);
const mapCache = new Map();
assert.ok(catalog.regions?.length > 0, "Regions must be present in global search");
for (const { mapId, region } of catalog.regions) {
  let map = mapCache.get(mapId);
  if (!map) {
    map = read(`maps/${mapId}/metadata.json`);
    mapCache.set(mapId, map);
  }
  assert.ok(map.regions.some(candidate => candidate.id === region.id && candidate.name === region.name),
    `Stale search region: ${mapId}/${region.id}`);
  assert.ok(resolveMapFocusPoint({ mapId, pointId: `region:${region.id}` }, { ...map, id: mapId }, map.locations),
    `Unreachable search region: ${mapId}/${region.id}`);
}
const distantRegion = catalog.regions.find(region => region.mapId !== catalog.regions[0].mapId);
assert.ok(searchGlobalCatalog(prepared, distantRegion.region.name, catalog.regions[0].mapId).locations.some(location =>
  location.mapId === distantRegion.mapId && location.point.id === `region:${distantRegion.region.id}`),
"Region searches must span maps");
const merchantLocations = read("data/map-search/merchant-locations.json").npcs;
const expectedMerchantLocations = {};
for (const location of catalog.locations.filter(({ point }) => ["merchant", "event-npc"].includes(point.category) && point.reference?.id)) {
  const id = location.point.reference.id;
  expectedMerchantLocations[id] ??= [];
  if (!expectedMerchantLocations[id].includes(location.mapId)) expectedMerchantLocations[id].push(location.mapId);
}
assert.deepEqual(merchantLocations, Object.fromEntries(Object.entries(expectedMerchantLocations)
  .map(([id, maps]) => [id, maps.sort()])), "Merchant navigation must use published map pins");
let artworkLocations = 0;
for (const location of catalog.locations) {
  let map = mapCache.get(location.mapId);
  if (!map) {
    map = read(`maps/${location.mapId}/metadata.json`);
    mapCache.set(location.mapId, map);
  }
  assert.ok(location.count > 0);
  // Additional gatherable layers are validated below if the point is absent from metadata.
  let points = map.locations;
  if (!points.some(point => point.id === location.point.id)) {
    for (const layer of ["gatherables", "collectables"]) {
      try { points = [...points, ...read(`maps/${location.mapId}/${layer}.json`).locations]; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
  const resolved = resolveMapFocusPoint({ mapId: location.mapId, pointId: location.point.id }, { ...map, id: location.mapId }, points);
  assert.ok(resolved && !resolved.hiddenFromMap, `Unreachable search marker: ${location.mapId}/${location.point.id}`);
  assert.equal(location.point.category, resolved.category,
    `Search category differs from map marker: ${location.mapId}/${location.point.id}`);
  const expectedArtwork = resolved.iconPath
    ?? (location.point.itemId ? artwork.items[location.point.itemId] : undefined)
    ?? (location.point.reference ? artwork.icons[location.point.reference.id] : undefined);
  assert.equal(location.point.iconPath, expectedArtwork, `Search artwork differs from map artwork: ${location.mapId}/${location.point.id}`);
  if (expectedArtwork) artworkLocations++;
}
assert.ok(artworkLocations > 0, "Search locations must retain available artwork");

const eventEntrances = read("data/event-entrances.json").npcs;
const referenceNames = new Map(read("data/reference/index.json").entries.map(entry => [entry.id, entry.name]));
let eventAliases = 0;
let searchedEvent = false;
for (const location of catalog.locations.filter(row => row.point.category === "event-entrance")) {
  const point = mapCache.get(location.mapId).locations.find(row => row.id === location.point.id);
  const event = eventEntrances[point?.entityId];
  if (!event) continue;
  for (const id of [event.eventId, event.destinationId].filter(Boolean)) {
    const name = referenceNames.get(id);
    assert.ok(location.names.includes(name), `Missing event search name: ${location.mapId}/${point.id}`);
    if (!searchedEvent && id === event.destinationId) {
      assert.ok(searchGlobalCatalog(prepared, name, location.mapId).locations.some(result =>
        result.mapId === location.mapId && result.point.id === location.point.id));
      searchedEvent = true;
    }
    eventAliases++;
  }
}
assert.ok(eventAliases > 0, "Field event destinations must be searchable by name");
assert.ok(searchedEvent, "Field event destination searches must reach a marker");

const distantBoss = catalog.locations.find(location => location.point.category === "boss" && location.mapId !== catalog.locations[0].mapId);
const bossResults = searchGlobalCatalog(prepared, distantBoss.point.name, catalog.locations[0].mapId).locations;
assert.ok(bossResults.some(location => location.mapId === distantBoss.mapId), "Boss searches must span maps");
assert.equal(resolveMapFocusPoint({ mapId: distantBoss.mapId, pointId: distantBoss.point.id },
  { id: "another-map", bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } }, [distantBoss.point]), undefined);

const shardCache = new Map();
const kinds = new Set();
for (const item of catalog.items) {
  if (!shardCache.has(item.chunk)) shardCache.set(item.chunk, read(`data/map-search/${item.chunk}.json`).sources);
  const sources = shardCache.get(item.chunk)[item.id];
  assert.equal(sources.length, item.sourceCount);
  for (const source of sources) {
    assert.ok(catalog.locations[source.location], `Invalid target for ${item.id}`);
    kinds.add(source.kind);
    for (const step of source.via ?? []) {
      assert.ok(step.category, `Missing navigable category for ${step.id}`);
      assert.ok(!/^[?\s]+$/.test(step.name), `Placeholder route for ${item.id}`);
      assert.notEqual(step.id, "Quest:2203060", "Unlisted quest must not invent Belkan's skin reward route");
    }
    if (source.kind === "container") assert.ok(source.via?.length && source.originKind);
  }
}
for (const kind of ["loot", "purchase", "gather", "craft", "pickup", "quest", "reward", "container"]) assert.ok(kinds.has(kind), `Missing source kind: ${kind}`);

assert.equal(isSearchableRewardSource({ name: "???", category: "quests", unnamed: true }), false);
assert.equal(isSearchableRewardSource({ name: "Hidden quest", category: "quests", adventure: { listed: false } }), false);
assert.equal(isSearchableRewardSource({ name: "Published quest", category: "quests", adventure: { listed: true } }), true);
assert.equal(isSearchableRewardSource({ name: "Creature", category: "creatures" }), true);

// Same-named variants keep separate IDs, even after an item has a container route.
const fixture = { version: 1, locations: [], items: [
  { id: "1", name: "Crystal (Bound)", sourceCount: 1 },
  { id: "2", name: "Crystal", sourceCount: 1 },
] };
assert.deepEqual(new Set(searchGlobalCatalog(prepareGlobalSearch(fixture), "crystal", "any").items.map(item => item.id)), new Set(["1", "2"]));
assert.equal(searchGlobalCatalog(prepareGlobalSearch(fixture), "crytal", "any").items.length, 2);
assert.equal(REWARD_KINDS.has("reference.labels.objectives"), false, "Quest requirements are not item rewards");
const byMarker = new Map([["first:pin", 0]]);
const byEntity = new Map([["NpcData:42", [{ mapId: "first", index: 0 }, { mapId: "second", index: 1 }]], ["EnvObjData:42", [{ mapId: "first", index: 2 }]]]);
assert.deepEqual(resolveAcquisitionTargets({ kind: "boss-drop", entityId: "42", mapId: "second" }, byMarker, byEntity), [1]);
assert.deepEqual(resolveAcquisitionTargets({ kind: "gather", entityId: "42" }, byMarker, byEntity), [2]);
assert.deepEqual(resolveAcquisitionTargets({ kind: "merchant", name: "42" }, byMarker, byEntity), [], "Never guess identity from a display name");
const collector = createSourceCollector();
collector.add("box", { location: 0, kind: "loot" });
expandContainerSources(collector, new Map([["box", new Set(["bound"])], ["bound", new Set(["box"])]]), new Map([["box", { name: "Reward Chest" }]]));
assert.equal(collector.sources.get("bound").size, 1);
assert.equal([...collector.sources.get("bound").values()][0].kind, "container");
assert.equal(collector.sources.get("unbound"), undefined);
assert.equal(collector.sources.get("box").size, 1, "A container cycle cannot invent new acquisition paths");
const itemResult = { id: "bound", name: "Crystal (Bound)", icon: "crystal.png", sources: Array.from({ length: 4 }, () => ({
  location: 0, kind: "container", originKind: "quest",
  via: [{ id: "quest", category: "quests", name: "Published quest" }, { id: "box", category: "items", name: "Reward Chest (Bound)" }],
})) };
const rows = buildMapSearchRows([distantBoss], [itemResult], [distantBoss], {});
assert.equal(rows.length, 5);
assert.equal(rows[0].context, undefined, "A location-only result must not inherit an item route");
const context = JSON.parse(JSON.stringify(rows[1].context));
assert.equal(context.item.id, "bound");
assert.equal(context.item.name, "Crystal (Bound)");
assert.deepEqual(context.source.via.map(step => [step.category, step.id]), [["quests", "quest"], ["items", "box"]]);
assert.equal(context.source.originKind, "quest");
assert.equal(context.source.location, undefined, "Navigation must not depend on catalog array indices");
assert.equal(rows.at(-1).id, moreRowId("bound"));
assert.equal(buildMapSearchRows([], [itemResult], [distantBoss], { bound: 33 }).length, 4);
console.log(`Global map search verified: ${catalog.locations.length} location groups, ${catalog.items.length} items, cross-map navigation, source identity, container provenance and keyboard rows.`);
