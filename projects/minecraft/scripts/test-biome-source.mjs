import assert from "node:assert/strict";
import { createBiomeTileSource } from "../src/features/generation/biome-tile-source.ts";
import { createUniformBiomeTileSource } from "../src/features/generation/create-uniform-biome-source.ts";
import { GAME_BIOMES, GAME_BIOME_COLORS } from "../src/game-config.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const code = expected => error => error?.code === expected;
const range = { scale: 4, cellX: -32, cellZ: 16, width: 2, height: 3, blockY: -1 };
const selection = () => ({ worldId: "fixture-world", edition: "fixture-edition", version: "fixture-release", seed: "9007199254740993", dimension: 0,
  artifact: { bytes: new Uint8Array([0, 97, 115, 109]), config: { sha256: "a".repeat(64), profiles: ["fixture-release", "fixture-other"] } } });
const fixture = () => {
  const requests = [], scopes = [];
  let disposed = false;
  const pool = { setScope: scope => scopes.push(scope), dispose: () => { disposed = true; },
    submit: (scope, work) => new Promise((resolve, reject) => requests.push({ scope, work, resolve, reject })) };
  const source = createBiomeTileSource(pool);
  const complete = (index = requests.length - 1, patch) => {
    const request = requests[index];
    request.resolve(patch ?? (request.work.kind === "biomes"
      ? { kind: "biomes", tiles: request.work.ranges.map(range => ({ range: { ...range }, biomes: new Uint16Array(range.width * range.height).fill(14) })) }
      : { kind: "biome-relief", tiles: request.work.ranges.map(range => ({ range: { ...range }, relief: new Int8Array(range.width * range.height).fill(8) })) }));
  };
  return { source, scopes, requests, complete, isDisposed: () => disposed };
};

await check("named biome configuration has unique reviewed identities and an exact color lookup", async () => {
  assert.equal(new Set(GAME_BIOMES.map(biome => biome.id)).size, GAME_BIOMES.length);
  assert.equal(new Set(GAME_BIOMES.map(biome => biome.registryId)).size, GAME_BIOMES.length);
  assert.equal(Object.keys(GAME_BIOME_COLORS).length, GAME_BIOMES.length);
  for (const biome of GAME_BIOMES) {
    assert.match(biome.registryId, /^minecraft:[a-z0-9_]+$/);
    assert.match(biome.labelKey, /^biomeMap\.biomes\.[a-z][A-Za-z0-9]*$/);
    assert.match(biome.color, /^#[0-9a-f]{6}$/i);
    assert.equal(GAME_BIOME_COLORS[biome.id], biome.color);
  }
});

await check("uniform world types fill every requested tile without a worker artifact", async () => {
  const source = createUniformBiomeTileSource(185), input = selection();
  input.version = "uniform:185"; input.artifact.config.profiles = [input.version];
  const scope = source.select(input);
  const ranges = [range, { ...range, cellX: 12, cellZ: -7, width: 3, height: 2 }];
  const tiles = await source.generate(scope, ranges);
  assert.equal(tiles.length, ranges.length);
  assert.deepEqual(tiles.map(tile => [...tile.biomes]), [[185, 185, 185, 185, 185, 185], [185, 185, 185, 185, 185, 185]]);
  assert.deepEqual((await source.generateRelief(scope, ranges)).map(tile => tile.relief), [null, null]);
  source.dispose();
  await assert.rejects(source.generate(scope, [range]), code("disposed"));
  assert.throws(() => createUniformBiomeTileSource(-1), /Invalid uniform biome/);
});

await check("selection owns exact artifact, profiles and 64-bit seed independently of caller mutation", async () => {
  const f = fixture(), input = selection(); input.seed = "+009007199254740993";
  const scope = f.source.select(input); assert(Object.isFrozen(scope));
  input.artifact.bytes[0] = 99; input.artifact.config.profiles[0] = "changed"; input.seed = "1";
  const ranges = [{ ...range }], promise = f.source.generate(scope, ranges); ranges[0].cellX = 999;
  assert.equal(f.requests[0].work.seed, "9007199254740993");
  assert.equal(f.requests[0].work.artifact.bytes[0], 0); assert.equal(f.requests[0].work.profile, "fixture-release");
  assert.equal(f.requests[0].work.ranges[0].cellX, -32); f.complete(); assert.equal((await promise)[0].biomes.length, 6);
  f.source.dispose();
});
await check("relief refinement is opt-in and remains separate from fast base-tile work", async () => {
  const f = fixture(), scope = f.source.select(selection());
  const base = f.source.generate(scope, [range]);
  assert.equal(f.requests[0].work.kind, "biomes"); f.complete();
  assert.equal((await base)[0].biomes.length, 6);
  const refined = f.source.generateRelief(scope, [range]);
  assert.equal(f.requests[1].work.kind, "biome-relief"); f.complete();
  assert.deepEqual([...(await refined)[0].relief], [8, 8, 8, 8, 8, 8]);
  f.source.dispose();
});
await check("every world-source field changes scope and rejects late results even with an uncooperative port", async () => {
  for (const patch of [{ worldId: "other" }, { edition: "other" }, { version: "fixture-other" }, { seed: "1" }, { dimension: -1 },
    { artifact: { ...selection().artifact, config: { ...selection().artifact.config, sha256: "b".repeat(64) } } }]) {
    const f = fixture(), old = f.source.select(selection());
    const pending = assert.rejects(f.source.generate(old, [range]), code("stale"));
    const next = f.source.select({ ...selection(), ...patch }); assert.notDeepEqual(next, old);
    assert(f.scopes.includes(null)); f.complete(); await pending;
    await assert.rejects(f.source.generate(old, [range]), code("stale")); f.source.dispose();
  }
});
await check("returning to the identical world still cannot accept an older revision", async () => {
  const f = fixture(), first = f.source.select(selection());
  f.source.select(null); const second = f.source.select(selection());
  assert.equal(first.sourceId, second.sourceId); assert.notEqual(first.revision, second.revision);
  await assert.rejects(f.source.generate(first, [range]), code("stale")); f.source.dispose();
});
await check("unavailable versions, invalid identity, seed overflow and invalid artifacts clear the previous source", async () => {
  for (const patch of [{ version: "unadvertised" }, { seed: "9223372036854775808" }, { dimension: 2 }, { worldId: "" },
    { artifact: { ...selection().artifact, bytes: new Uint8Array() } }]) {
    const f = fixture(), scope = f.source.select(selection());
    assert.throws(() => f.source.select({ ...selection(), ...patch })); assert.equal(f.source.getScope(), null);
    await assert.rejects(f.source.generate(scope, [range]), code("stale")); f.source.dispose();
  }
});
await check("mismatched tile count, coordinates, altitude and output buffers fail closed", async () => {
  for (const result of [{ kind: "biomes", tiles: [] }, { kind: "mesh", tiles: [] },
    ...[{ ...range, cellX: 0 }, { ...range, blockY: 0 }].map(range => ({ kind: "biomes", tiles: [{ range, biomes: new Uint16Array(6) }] })),
    ...[new Uint16Array(5), new Uint8Array(6)].map(biomes => ({ kind: "biomes", tiles: [{ range, biomes }] }))]) {
    const f = fixture(), scope = f.source.select(selection());
    const pending = assert.rejects(f.source.generate(scope, [range]), code("protocol")); f.complete(0, result); await pending; f.source.dispose();
  }
});
await check("mismatched relief coordinates and buffers fail closed", async () => {
  for (const result of [{ kind: "biome-relief", tiles: [] }, { kind: "biomes", tiles: [] },
    { kind: "biome-relief", tiles: [{ range: { ...range, cellX: 0 }, relief: new Int8Array(6) }] },
    ...[new Int8Array(5), new Uint8Array(6)].map(relief => ({ kind: "biome-relief", tiles: [{ range, relief }] }))]) {
    const f = fixture(), scope = f.source.select(selection());
    const pending = assert.rejects(f.source.generateRelief(scope, [range]), code("protocol")); f.complete(0, result); await pending; f.source.dispose();
  }
});
await check("cancellation is rechecked after asynchronous completion, and worker errors remain visible", async () => {
  const f = fixture(), scope = f.source.select(selection()), abort = new AbortController();
  const pending = assert.rejects(f.source.generate(scope, [range], abort.signal), code("cancelled")); abort.abort(); f.complete(); await pending;
  const failure = assert.rejects(f.source.generate(scope, [range]), /fixture failure/); f.requests[1].reject(new Error("fixture failure")); await failure;
  f.source.dispose();
});
await check("batch limits reject before submission and disposal invalidates all remaining callers", async () => {
  const f = fixture(), scope = f.source.select(selection());
  for (const ranges of [[], Array(17).fill(range)]) await assert.rejects(f.source.generate(scope, ranges), /batch/);
  assert.equal(f.requests.length, 0);
  const pending = assert.rejects(f.source.generate(scope, [range]), code("disposed"));
  f.source.dispose(); f.complete(); await pending; assert(f.isDisposed());
  assert.throws(() => f.source.select(selection()), code("disposed"));
  await assert.rejects(f.source.generate(scope, [range]), code("disposed")); f.source.dispose();
});
console.log(`${checks} biome source checks passed.`);
