import assert from "node:assert/strict";
import { GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
import { createStructureSource } from "../src/features/generation/structure-source.ts";
import { planStructureRegions } from "../src/features/generation/structure-regions.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const code = expected => error => error?.code === expected;
const selection = () => ({ worldId: "fixture", edition: "fixture-edition", version: "v1", seed: "9007199254740993", dimension: 0,
  artifact: { bytes: new Uint8Array([0, 97, 115, 109]), config: { sha256: "a".repeat(64), profiles: ["v1", "v2"], structures: ["site", "other"] } } });
const query = { type: "site", regionX: -1, regionZ: 0 };
const fixture = () => {
  const requests = [], source = createStructureSource({ setScope() {}, dispose() {},
    submit: (scope, work) => new Promise((resolve, reject) => requests.push({ scope, work, resolve, reject })) });
  const response = (index = requests.length - 1) => ({ kind: "structures", capabilities: [{ type: "site", regionSize: 32 }, { type: "other", regionSize: null }],
    results: requests[index].work.queries.map(query => ({ query: { ...query }, status: "candidate", candidate: {
      x: query.regionX * 512 + 16, y: null, z: query.regionZ * 512 + 16, biomeViable: true, terrainVerified: false,
    } })) });
  return { source, requests, response };
};
await check("every configured structure owns valid artwork without unrelated identity collisions", () => {
  assert.equal(GAME_STRUCTURE_TYPES.length, 22);
  const owners = new Map();
  for (const type of GAME_STRUCTURE_TYPES) {
    const identity = typeof type.artwork === "string" ? type.artwork : JSON.stringify([type.artwork.src, type.artwork.columns,
      type.artwork.rows, type.artwork.column, type.artwork.row]);
    const owner = owners.get(identity);
    if (owner) assert.equal(owner.knowledgeId, type.knowledgeId, `Unrelated structures share artwork: ${owner.id}, ${type.id}`);
    else owners.set(identity, type);
    if (typeof type.artwork === "string") assert.match(type.artwork,
      /^\/(?:guide-(?:artwork|entities)\/.+\.png|guide-structure-markers\/.+\.svg)$/);
    else {
      assert(Number.isSafeInteger(type.artwork.columns) && type.artwork.columns > 0);
      assert(Number.isSafeInteger(type.artwork.rows) && type.artwork.rows > 0);
      assert(type.artwork.column >= 0 && type.artwork.column < type.artwork.columns);
      assert(type.artwork.row >= 0 && type.artwork.row < type.artwork.rows);
    }
  }
});
await check("capability discovery and candidate queries preserve caller ownership and exact seed identity", async () => {
  const f = fixture(), input = selection(), scope = f.source.select(input);
  input.artifact.config.structures[0] = "mutated"; input.artifact.bytes[0] = 99;
  const queries = [{ ...query }], task = f.source.query(scope, queries); queries[0].regionX = 20;
  assert.equal(f.requests[0].work.queries[0].regionX, -1); assert.equal(f.requests[0].work.seed, "9007199254740993");
  assert.equal(f.requests[0].work.artifact.bytes[0], 0); assert.equal(f.requests[0].work.artifact.config.structures[0], "site");
  f.requests[0].resolve(f.response()); assert.equal((await task).results[0].candidate.x, -496);
  const metadata = f.source.query(scope); f.requests[1].resolve(f.response()); assert.equal((await metadata).results.length, 0); f.source.dispose();
});
await check("world, edition, version, seed, dimension, digest and registry changes reject stale structure output", async () => {
  for (const patch of [{ worldId: "different" }, { edition: "other" }, { version: "v2" }, { seed: "1" }, { dimension: -1 },
    { artifact: { ...selection().artifact, config: { ...selection().artifact.config, sha256: "b".repeat(64) } } },
    { artifact: { ...selection().artifact, config: { ...selection().artifact.config, structures: ["other", "site"] } } }]) {
    const f = fixture(), scope = f.source.select(selection());
    const pending = assert.rejects(f.source.query(scope, [query]), code("stale")); f.source.select({ ...selection(), ...patch });
    f.requests[0].resolve(f.response()); await pending; await assert.rejects(f.source.query(scope), code("stale")); f.source.dispose();
  }
});
await check("invalid selection clears previous source and same-world reselection increments revision", async () => {
  const f = fixture(), first = f.source.select(selection());
  assert.throws(() => f.source.select({ ...selection(), artifact: { ...selection().artifact, config: { ...selection().artifact.config, structures: [] } } }));
  assert.equal(f.source.getScope(), null); await assert.rejects(f.source.query(first), code("stale"));
  const second = f.source.select(selection()); assert.notEqual(first.revision, second.revision); f.source.dispose();
});
await check("cancellation, disposal and worker failures cannot return cached candidate success", async () => {
  for (const mode of ["cancelled", "disposed", "worker"]) {
    const f = fixture(), scope = f.source.select(selection()), abort = new AbortController();
    const pending = assert.rejects(f.source.query(scope, [query], abort.signal), mode === "worker" ? /broken worker/ : code(mode));
    if (mode === "cancelled") abort.abort(); if (mode === "disposed") f.source.dispose();
    if (mode === "worker") f.requests[0].reject(new Error("broken worker")); else f.requests[0].resolve(f.response());
    await pending; f.source.dispose();
  }
});
await check("wrong regions, invented heights, unverified-status upgrades and malformed capabilities fail closed", async () => {
  const patches = [r => { r.kind = "biomes"; }, r => { r.results = []; }, r => { r.capabilities.reverse(); },
    r => { r.capabilities[0].regionSize = 0; }, r => { r.results[0].query.regionX = 0; },
    r => { r.results[0].candidate.x = 16; }, r => { r.results[0].candidate.y = 64; },
    r => { r.results[0].candidate.terrainVerified = true; }, r => { r.results[0].candidate.biomeViable = 1; },
    r => { r.results[0].status = "unsupported"; }, r => { r.results[0].candidate.x = NaN; }];
  for (const patch of patches) {
    const f = fixture(), scope = f.source.select(selection()), pending = assert.rejects(f.source.query(scope, [query]), code("protocol"));
    const result = f.response(); patch(result); f.requests[0].resolve(result); await pending; f.source.dispose();
  }
});
await check("unsupported capabilities, no attempt and biome-rejected candidates stay distinct", async () => {
  for (const status of ["unsupported", "no-attempt", "candidate"]) {
    const f = fixture(), scope = f.source.select(selection()), pending = f.source.query(scope, [query]), result = f.response();
    result.results[0].status = status;
    if (status === "unsupported") result.capabilities[0].regionSize = null;
    if (status !== "candidate") result.results[0].candidate = null; else result.results[0].candidate.biomeViable = false;
    f.requests[0].resolve(result); assert.equal((await pending).results[0].status, status); f.source.dispose();
  }
});
await check("oversized, duplicate, fractional and unknown queries fail before worker submission", async () => {
  const f = fixture(), scope = f.source.select(selection());
  for (const queries of [Array(65).fill(query), [query, query], [{ ...query, regionX: .5 }], [{ ...query, type: "unknown" }]])
    await assert.rejects(f.source.query(scope, queries));
  assert.equal(f.requests.length, 0); f.source.dispose();
});
await check("region planning covers negative boundaries exactly once using per-type spans", () => {
  const plan = planStructureRegions({ minX: -513, minZ: -1, maxX: 0, maxZ: 0 }, [{ type: "site", regionSize: 32 }, { type: "other", regionSize: null }]);
  assert.equal(plan.queries.length, 6); assert.deepEqual(plan.unsupported, ["other"]);
  assert.deepEqual(new Set(plan.queries.map(q => `${q.regionX},${q.regionZ}`)), new Set(["-2,-1", "-1,-1", "0,-1", "-2,0", "-1,0", "0,0"]));
  const point = planStructureRegions({ minX: -30000000, minZ: 30000000, maxX: -30000000, maxZ: 30000000 }, [{ type: "site", regionSize: 34 }]);
  assert.equal(point.queries.length, 1); assert.equal(point.queries[0].regionX, Math.floor(-30000000 / 544));
});
await check("region planning gives each category an early center-first slot", () => {
  const plan = planStructureRegions({ minX: 0, minZ: 0, maxX: 63, maxZ: 15 },
    [{ type: "dense", regionSize: 1 }, { type: "broad", regionSize: 4 }]);
  assert.deepEqual(plan.queries.slice(0, 2).map(query => query.type), ["dense", "broad"]);
  assert.equal(plan.queries[0].regionX, 1); assert.equal(plan.queries[1].regionX, 0);
});
await check("oversized coverage is never silently truncated and invalid capabilities never become empty worlds", () => {
  const bounds = { minX: -10000, minZ: -10000, maxX: 10000, maxZ: 10000 }, cap = [{ type: "site", regionSize: 32 }];
  assert.throws(() => planStructureRegions(bounds, cap, 64), /budget/);
  for (const patch of [{ minX: NaN }, { maxZ: 30000001 }, { minX: 10001 }]) assert.throws(() => planStructureRegions({ ...bounds, ...patch }, cap));
  for (const capabilities of [[...cap, ...cap], [{ type: "site", regionSize: -1 }], [{ type: "site", regionSize: 1.5 }]])
    assert.throws(() => planStructureRegions(bounds, capabilities));
});
console.log(`${checks} structure source and viewport checks passed.`);
