import assert from "node:assert/strict";
import { createStructureViewportStream } from "../src/features/generation/structure-viewport-stream.ts";
import { applyStructureFilter, readStructureFilter, toggleStructureCategory, visibleStructurePoints } from "../src/features/worlds/world-structure-filter-state.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const flush = () => new Promise(resolve => setImmediate(resolve));
const scope = () => ({ worldId: "world-a", dimension: "0", sourceId: "exact-generation", revision: 1 });
const bounds = (minX = 0, maxX = 63) => ({ minX, maxX, minZ: 0, maxZ: 15 });
const caps = [{ type: "site", regionSize: 1 }, { type: "unavailable", regionSize: null }];
const fixture = (options = {}, identity = scope(), capabilities = caps) => {
  const requests = [], states = [];
  const stream = createStructureViewportStream({ query: (scope, queries, signal) => new Promise((resolve, reject) => {
    requests.push({ scope, queries, signal, resolve, reject });
  }) }, identity, state => states.push(state), { batchSize: 2, maxQueries: 8, cacheLimit: 8, ...options });
  const finish = async (index = requests.length - 1, transform = value => value) => {
    const request = requests[index];
    request.resolve(transform({ kind: "structures", capabilities: capabilities.map(cap => ({ ...cap })),
      results: request.queries.map(query => ({ query, status: "candidate", candidate: {
        x: query.regionX * 16 + 1, y: null, z: query.regionZ * 16 + 1, biomeViable: true, terrainVerified: false,
      } })) }));
    await flush();
  };
  return { stream, requests, states, finish };
};
await check("capabilities precede bounded center-first batches, partial counts and stable point identities", async () => {
  const f = fixture();
  assert.equal(f.stream.getState().phase, "idle"); f.stream.setViewport(bounds());
  assert.equal(f.requests.length, 1); assert.deepEqual(f.requests[0].queries, []);
  assert.equal(f.stream.getState().phase, "loading"); await f.finish();
  assert.deepEqual(f.requests[1].queries.map(q => q.regionX), [1, 2]);
  assert.equal(f.stream.getState().total, 4); assert.deepEqual(f.stream.getState().unsupported, ["unavailable"]);
  await f.finish(); assert.equal(f.stream.getState().completed, 2); assert.equal(f.requests[2].queries.length, 2);
  await f.finish(); const state = f.stream.getState();
  assert.equal(state.phase, "ready"); assert.equal(state.completed, 4); assert.equal(state.points.length, 4);
  assert.equal(state.points[0].id, '["site",17,1]'); assert.equal(state.points[0].y, null); assert.equal(state.points[0].terrainVerified, false);
  assert.equal(f.requests.length, 3); f.stream.dispose();
});
await check("continuous pan cancels stale batches and starts the latest viewport immediately", async () => {
  const f = fixture(); f.stream.setViewport(bounds()); await f.finish();
  f.stream.setViewport(bounds(160, 191)); f.stream.setViewport(bounds(320, 351));
  assert.equal(f.requests.length, 4);
  assert.equal(f.requests[1].signal.aborted, true); assert.equal(f.requests[2].signal.aborted, true);
  assert.deepEqual(f.requests[3].queries.map(q => q.regionX), [20, 21]);
  assert.equal(f.stream.getState().points.length, 0); assert.equal(f.stream.getState().completed, 0);
  await f.finish(1); await f.finish(2); assert.equal(f.stream.getState().completed, 0);
  await f.finish(3); assert.equal(f.stream.getState().phase, "ready"); assert.equal(f.stream.getState().points[0].x, 321);
  f.stream.dispose();
});
await check("deferred categories never delay the final quick marker batch", async () => {
  const capabilities = [{ type: "fast", regionSize: 1 }, { type: "slow", regionSize: 1 }];
  const f = fixture({ batchSize: 3, maxQueries: 8, cacheLimit: 8, deferredTypes: ["slow"] }, scope(), capabilities);
  f.stream.setViewport(bounds(0, 31)); await f.finish();
  assert.deepEqual(f.requests[1].queries.map(query => query.type), ["fast", "fast"]);
  await f.finish(); assert.deepEqual(f.requests[2].queries.map(query => query.type), ["slow", "slow"]);
  await f.finish(); assert.equal(f.stream.getState().phase, "ready"); f.stream.dispose();
});
await check("hidden maps abort and ignore late completion, then resume only current coverage", async () => {
  const f = fixture(); f.stream.setViewport(bounds()); await f.finish();
  f.stream.setActive(false); assert.equal(f.requests[1].signal.aborted, true);
  f.stream.setViewport(bounds(160, 191)); assert.equal(f.stream.getState().phase, "paused");
  await f.finish(1); assert.equal(f.requests.length, 2); assert.equal(f.stream.getState().points.length, 0);
  f.stream.setActive(true); assert.equal(f.requests.length, 3); await f.finish(2);
  assert.equal(f.stream.getState().phase, "ready"); assert.equal(f.stream.getState().points[0].x, 161); f.stream.dispose();
});
await check("late discovery after pause or disposal cannot enqueue work or republish state", async () => {
  for (const mode of ["pause", "dispose"]) {
    const f = fixture(); f.stream.setViewport(bounds());
    if (mode === "pause") f.stream.setActive(false); else f.stream.dispose();
    const count = f.states.length; await f.finish(0);
    assert.equal(f.states.length, count); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].signal.aborted, true);
    if (mode === "pause") { f.stream.setActive(true); assert.equal(f.requests.length, 2); assert.deepEqual(f.requests[1].queries, []); }
    f.stream.dispose(); assert.throws(() => f.stream.setViewport(bounds()), /disposed/);
  }
});
await check("worker errors retain honest partial coverage and explicit retry requests only missing regions", async () => {
  const f = fixture(); f.stream.setViewport(bounds()); await f.finish(); await f.finish();
  f.requests[2].reject(new Error("fixture failure")); await flush();
  const failed = f.stream.getState(); assert.equal(failed.phase, "error"); assert.equal(failed.completed, 2); assert.match(failed.error, /fixture failure/);
  f.stream.setViewport(bounds()); assert.equal(f.requests.length, 3);
  f.stream.retry(); assert.equal(f.requests.length, 4); assert.deepEqual(f.requests[3].queries, f.requests[2].queries);
  await f.finish(3); assert.equal(f.stream.getState().phase, "ready"); assert.equal(f.stream.getState().error, null); f.stream.dispose();
});
await check("discovery errors recover and changing capabilities cannot contaminate cached results", async () => {
  const f = fixture(); f.stream.setViewport(bounds()); f.requests[0].reject(new Error("offline")); await flush();
  assert.equal(f.stream.getState().phase, "error"); f.stream.retry(); await f.finish(1);
  await f.finish(2, result => ({ ...result, capabilities: [{ type: "site", regionSize: 2 }, caps[1]] }));
  assert.equal(f.stream.getState().phase, "error"); assert.match(f.stream.getState().error, /capabilities changed/);
  assert.equal(f.stream.getState().completed, 0); f.stream.dispose();
});
await check("bounded cache reuses visited coverage and evicts old regions instead of growing forever", async () => {
  const f = fixture({ batchSize: 2, maxQueries: 2, cacheLimit: 2 });
  f.stream.setViewport(bounds(0, 31)); await f.finish(); await f.finish();
  f.stream.setViewport(bounds(1, 31)); assert.equal(f.requests.length, 2);
  f.stream.setViewport(bounds(32, 63)); await f.finish();
  f.stream.setViewport(bounds(0, 31)); assert.equal(f.requests.length, 4); assert.equal(f.stream.getState().completed, 0);
  await f.finish(); assert.equal(f.stream.getState().phase, "ready"); f.stream.dispose();
});
await check("coverage budget is explicit, cancels pending work and recovers by narrowing the view", async () => {
  const f = fixture(); f.stream.setViewport(bounds()); await f.finish();
  f.stream.setViewport(bounds(-30000000, 30000000));
  assert.equal(f.stream.getState().phase, "limited"); assert.equal(f.stream.getState().points.length, 0); assert.equal(f.requests[1].signal.aborted, true);
  await f.finish(1); assert.equal(f.requests.length, 2);
  f.stream.setViewport(bounds(0, 15)); await f.finish(2); assert.equal(f.stream.getState().phase, "ready"); f.stream.dispose();
});
await check("counts cover queried regions but only biome-viable candidates inside exact bounds become points", async () => {
  const f = fixture({ batchSize: 4 }); f.stream.setViewport(bounds(2, 63)); await f.finish();
  await f.finish(1, result => {
    for (const entry of result.results) {
      if (entry.query.regionX === 1) entry.candidate.biomeViable = false;
      if (entry.query.regionX === 2) { entry.status = "no-attempt"; entry.candidate = null; }
    }
    return result;
  });
  assert.equal(f.stream.getState().completed, 4); assert.equal(f.stream.getState().points.length, 1); assert.equal(f.stream.getState().points[0].x, 49);
  f.stream.setViewport(bounds(), ["unavailable"]); assert.equal(f.stream.getState().phase, "ready"); assert.deepEqual(f.stream.getState().unsupported, ["unavailable"]);
  f.stream.setViewport(bounds(), []); assert.equal(f.stream.getState().points.length, 0); assert.deepEqual(f.stream.getState().unsupported, []);
  assert.equal(f.requests.length, 2); f.stream.dispose();
});
await check("scope, view and public snapshots cannot be mutated across source identities", async () => {
  const identity = scope(), input = bounds(0, 15), types = ["site"], f = fixture({}, identity);
  f.stream.setViewport(input, types); identity.worldId = "changed"; input.maxX = 100000; types[0] = "changed";
  assert.equal(f.requests[0].scope.worldId, "world-a"); await f.finish(); await f.finish();
  const state = f.stream.getState(); assert.equal(state.total, 1);
  assert.throws(() => { state.points[0].x = 999; }); assert.throws(() => { state.points.push({}); });
  const other = fixture({}, { ...scope(), worldId: "world-b", dimension: "-1" }); other.stream.setViewport(bounds(0, 15));
  assert.equal(other.stream.getState().completed, 0); assert.equal(other.stream.getState().points.length, 0);
  f.stream.dispose(); other.stream.dispose();
});
await check("duplicate camera events do not enqueue queries and invalid inputs preserve the last valid view", async () => {
  const f = fixture(); f.stream.setViewport(bounds()); f.stream.setViewport(bounds()); assert.equal(f.requests.length, 1);
  assert.throws(() => f.stream.setViewport({ ...bounds(), minX: NaN })); assert.throws(() => f.stream.setViewport(bounds(), ["site", "site"]));
  await f.finish(); await f.finish(); await f.finish(); assert.equal(f.stream.getState().total, 4);
  f.stream.setViewport(bounds(), ["unknown"]); assert.equal(f.stream.getState().phase, "error"); assert.match(f.stream.getState().error, /Unknown/); f.stream.dispose();
  for (const options of [{ batchSize: 65 }, { maxQueries: 0 }, { cacheLimit: 1 }]) assert.throws(() => fixture(options), /limits/);
});
await check("stored structure filters restore only known ordered categories and groups", () => {
  const view = { mode: "2d", camera2d: { x: 5, z: 6, zoom: .5 }, camera3d: null,
    visibleCategories: ["other", "b", "b", "a"], expandedGroup: "old", filterSearch: "x".repeat(600), hideFound: true, favoritesOnly: false };
  const filter = readStructureFilter(view, ["a", "b", "c"], ["main"]);
  assert.deepEqual(filter.visibleCategories, ["a", "b"]); assert.equal(filter.expandedGroup, null); assert.equal(filter.search.length, 512);
  const next = applyStructureFilter(view, { ...filter, visibleCategories: ["c"], expandedGroup: "main", search: "ships" });
  assert.deepEqual(next.camera2d, view.camera2d); assert.deepEqual(next.visibleCategories, ["c"]); assert.equal(next.expandedGroup, "main");
  assert.deepEqual(view.visibleCategories, ["other", "b", "b", "a"]);
  const migrated = readStructureFilter({ ...view, visibleCategories: ["a"] }, ["a", "b", "c"], ["main"], 1,
    [{ revision: 1, added: ["c"] }]);
  assert.deepEqual(migrated.visibleCategories, ["a", "c"]);
  const persisted = applyStructureFilter(view, { ...migrated, visibleCategories: ["a"] });
  assert.equal(persisted.structureFilterRevision, 1);
  assert.deepEqual(readStructureFilter(persisted, ["a", "b", "c"], ["main"], 1,
    [{ revision: 1, added: ["c"] }]).visibleCategories, ["a"]);
});
await check("category visibility, found and favorite filters use dimension-qualified point identities", () => {
  const point = (id, type) => ({ id, type, x: 1, y: null, z: 2, biomeViable: true, terrainVerified: false });
  const points = [point("one", "a"), point("two", "a"), point("three", "b")];
  const personal = { found: ['["overworld","one"]'], favorites: ['["overworld","one"]', '["overworld","two"]'] };
  const base = { visibleCategories: ["a"], expandedGroup: null, search: "", hideFound: false, favoritesOnly: false };
  assert.deepEqual(visibleStructurePoints(points, "overworld", personal, base).map(item => item.id), ["one", "two"]);
  assert.deepEqual(visibleStructurePoints(points, "overworld", personal, { ...base, hideFound: true, favoritesOnly: true }).map(item => item.id), ["two"]);
  assert.deepEqual(visibleStructurePoints(points, "nether", personal, { ...base, hideFound: true, favoritesOnly: true }), []);
});
await check("category toggles retain canonical order and reject unknown ids", () => {
  const base = { visibleCategories: ["b"], expandedGroup: null, search: "", hideFound: false, favoritesOnly: false };
  assert.deepEqual(toggleStructureCategory(base, "a", ["a", "b", "c"]).visibleCategories, ["a", "b"]);
  assert.deepEqual(toggleStructureCategory(base, "b", ["a", "b", "c"]).visibleCategories, []);
  assert.throws(() => toggleStructureCategory(base, "missing", ["a", "b", "c"]), /Unknown/);
});
console.log(`${checks} structure viewport stream checks passed.`);
