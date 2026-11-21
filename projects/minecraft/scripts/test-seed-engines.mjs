import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { GAME_SEED_ENGINE_SOURCES } from "../src/game-config.ts";
import { createWasmBiomeEngine } from "../src/features/generation/wasm-biome-engine.ts";
import { runBiomeWork, createBiomeWorkRunner } from "../src/features/generation/run-biome-work.ts";
import { createBiomeRelief } from "../src/features/generation/biome-relief.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const hash32 = value => {
  value ^= value >>> 15; value = Math.imul(value, 0xd168aaad);
  value ^= value >>> 15; value = Math.imul(value, 0xaf723597); value ^= value >>> 15;
  return value >>> 0;
};
const hash = data => createHash("sha256").update(data).digest("hex");
const range = { scale: 4, cellX: -128, cellZ: -96, width: 32, height: 32, blockY: 64 };
for (const source of GAME_SEED_ENGINE_SOURCES) {
  const manifest = JSON.parse(await readFile(`node_modules/.cache/seed-engines/${source.edition}.json`, "utf8"));
  assert.equal(manifest.revision, source.revision); assert.equal(manifest.archiveSha256, source.archiveSha256);
  const wasm = await readFile(`node_modules/.cache/seed-engines/${source.edition}.wasm`);
  const config = { sha256: manifest.wasmSha256, profiles: source.profiles.map(item => item.id) };
  const engine = await createWasmBiomeEngine(wasm, config);
  try {
    await check(`${source.edition}: retained worker state preserves results, changes seeds and rejects changed bytes`, async () => {
      const runner = createBiomeWorkRunner();
      const job = { kind: "biomes", artifact: { bytes: wasm, config }, profile: config.profiles[0], seed: "5", dimension: 0, ranges: [range] };
      try {
        for (const seed of ["5", "5", "6", "5"]) {
          const request = { ...job, seed };
          assert.deepEqual(await runner.run(request), await runBiomeWork(request));
        }
        const corrupt = new Uint8Array(wasm); corrupt[100] ^= 1;
        await assert.rejects(runner.run({ ...job, artifact: { bytes: corrupt, config } }), /integrity/);
        assert.deepEqual(await runner.run(job), await runBiomeWork(job));
      } finally { runner.dispose(); }
    });
    await check(`${source.edition}: bounded worker batches match direct generation and fail on any invalid tile`, async () => {
      const job = { kind: "biomes", artifact: { bytes: wasm, config }, profile: config.profiles[0], seed: "-9223372036854775808", dimension: 0,
        ranges: [range, { ...range, cellX: range.cellX + range.width }] };
      const batch = await runBiomeWork(job), reference = await createWasmBiomeEngine(wasm, config);
      try {
        reference.seed(job.profile, job.seed, job.dimension); assert.equal(batch.tiles.length, 2);
        for (const tile of batch.tiles) assert.deepEqual(tile.biomes, reference.generate(tile.range));
        assert.equal(reference.generate({ ...range, scale: 1, cellX: 0, cellZ: 0, width: 256, height: 256 }).length, 256 * 256);
      } finally { reference.dispose(); }
      for (const ranges of [[], Array(17).fill(range), [range, { ...range, width: 257 }]])
        await assert.rejects(runBiomeWork({ ...job, ranges }), /Invalid/);
      const afterFailure = await runBiomeWork({ ...job, seed: "262", ranges: [{ scale: 1, cellX: 0, cellZ: 0, width: 1, height: 1, blockY: 63 }] });
      assert.equal(afterFailure.tiles[0].biomes[0], 14);
    });
    await check(`${source.edition}: approximate Overworld heights produce deterministic seamless relief`, async () => {
      engine.seed(config.profiles.at(-1), "123456789", 0);
      const wholeRange = { ...range, scale: 4, cellX: -32, cellZ: -16, width: 32, height: 16 };
      const leftRange = { ...wholeRange, width: 16 }, rightRange = { ...wholeRange, cellX: -16, width: 16 };
      const whole = createBiomeRelief(engine.generateHeights(wholeRange), wholeRange.width, wholeRange.height, wholeRange.scale);
      const left = createBiomeRelief(engine.generateHeights(leftRange), leftRange.width, leftRange.height, leftRange.scale);
      const right = createBiomeRelief(engine.generateHeights(rightRange), rightRange.width, rightRange.height, rightRange.scale);
      for (let z = 0; z < wholeRange.height; z++) {
        assert.deepEqual([...left.subarray(z * 16, z * 16 + 16)], [...whole.subarray(z * 32, z * 32 + 16)]);
        assert.deepEqual([...right.subarray(z * 16, z * 16 + 16)], [...whole.subarray(z * 32 + 16, z * 32 + 32)]);
      }
      assert(whole.some(value => value !== 0));
      const job = { kind: "biome-relief", artifact: { bytes: wasm, config }, profile: config.profiles.at(-1), seed: "123456789", dimension: 0, ranges: [wholeRange] };
      const tile = (await runBiomeWork(job)).tiles[0];
      assert.deepEqual(tile.relief, whole);
      engine.seed(config.profiles.at(-1), "123456789", -1);
      assert.equal(engine.generateHeights(wholeRange), null);
      assert.throws(() => engine.seed("unadvertised-version", "1", 0), /Unsupported/);
    });
    await check(`${source.edition}: pinned binary integrity and ABI are enforced`, async () => {
      await assert.rejects(createWasmBiomeEngine(wasm, { ...config, sha256: "0".repeat(64) }), /integrity/);
      await assert.rejects(createWasmBiomeEngine(wasm, { ...config, profiles: [config.profiles[0]] }), /profile count/);
      assert.throws(() => engine.generate(range), /no selected seed/);
    });
    await check(`${source.edition}: documented seed example returns its biome`, () => {
      engine.seed(config.profiles[0], "262", 0);
      assert.equal(engine.sample(1, 0, 63, 0), 14);
    });
    await check(`${source.edition}: each explicit profile and dimension produces deterministic owned tiles`, () => {
      for (const profile of config.profiles) for (const dim of [-1, 0, 1]) {
        engine.seed(profile, "-9223372036854775808", dim);
        const first = engine.generate(range), expected = new Uint16Array(first);
        engine.generate({ ...range, cellX: 64 }); assert.deepEqual(first, expected);
        engine.seed(profile, "-9223372036854775808", dim); assert.deepEqual(engine.generate(range), expected);
        assert(first.every(id => id >= 0 && id <= 187));
      }
    });
    if (source.edition === "bedrock") await check("bedrock: 26.52 hotfix profile reuses 26.50 seed generation", () => {
      for (const seed of ["0", "8675309", "-9223372036854775808"]) for (const dimension of [-1, 0, 1]) {
        engine.seed("26.51", seed, dimension);
        const previous = engine.generate(range);
        engine.seed("26.52", seed, dimension);
        assert.deepEqual(engine.generate(range), previous);
      }
    });
    await check(`${source.edition}: single samples agree with row-major tiles at negative coordinates`, () => {
      engine.seed(config.profiles[0], "-8675309", 0);
      for (const scale of [1, 4]) {
        const request = { ...range, scale, width: 8, height: 7, blockY: -1 };
        const tile = engine.generate(request);
        for (let z = 0; z < request.height; z++) for (let x = 0; x < request.width; x++)
          assert.equal(tile[x + z * request.width], engine.sample(scale, request.cellX + x, Math.floor(request.blockY / scale), request.cellZ + z));
      }
    });
    await check(`${source.edition}: all 64 seed bits affect generation and invalid seed clears the previous world`, () => {
      engine.seed(config.profiles[0], "1", 0); const low = engine.generate(range);
      engine.seed(config.profiles[0], "4294967297", 0); assert.notDeepEqual(engine.generate(range), low);
      for (const seed of ["9223372036854775807", "-9223372036854775808", "9007199254740993"])
        { engine.seed(config.profiles[0], seed, 0); assert.equal(engine.generate(range).length, 1024); }
      assert.throws(() => engine.seed(config.profiles[0], "9223372036854775808", 0), /Unresolved seed/);
      assert.throws(() => engine.generate(range), /no selected seed/);
      assert.throws(() => engine.seed("unadvertised-version", "1", 0), /Unsupported/);
    });
    await check(`${source.edition}: bounds, scaling and dimension errors never wrap into another location`, () => {
      engine.seed(config.profiles[0], "1", 0);
      for (const patch of [{ width: 257 }, { height: 0 }, { scale: 2 }, { cellX: 2 ** 32 }, { blockY: NaN }, { cellZ: 7500000 }])
        assert.throws(() => engine.generate({ ...range, ...patch }), /Invalid/);
      assert.throws(() => engine.sample(1, Infinity, 0, 0), /Invalid/);
      for (const scale of [1, 4, 16, 64, 256]) assert.equal(engine.generate({ ...range, scale }).length, 1024);
      engine.seed(config.profiles[0], "1", -1);
      assert.throws(() => engine.generate({ ...range, scale: 256 }), /Invalid/);
    });
    if (source.edition === "java") await check("java: 4096-point upstream reference checksums match two profiles", () => {
      // Independently execute the input/hash protocol in pinned tests.c; expected values come from that source.
      for (const [profile, expected] of [["1.18.2", 0xade7f891], ["1.20.6", 0x0f8888ab]]) {
        let result = 0;
        for (let x = -32; x < 32; x++) for (let z = -32; z < 32; z++) {
          const seed = (z << 6) ^ x, y = (((hash32(seed) & 0x7fffffff) % 384) - 64) >> 2;
          engine.seed(profile, String(seed), 0);
          const biome = engine.sample(4, x, y, z); result ^= hash32(seed ^ (biome << 12));
        }
        assert.equal(result >>> 0, expected, `${profile} upstream reference differs`);
      }
    });
    engine.seed(config.profiles.at(-1), "8675309", 0);
    console.log(JSON.stringify({ edition: source.edition, profile: config.profiles.at(-1), tileSha256: hash(engine.generate(range)),
      note: "Reproducibility fingerprint, not an independent in-game fixture" }));
  } finally { engine.dispose(); }
  await check(`${source.edition}: disposed instances cannot retain usable world state`, () => {
    assert.throws(() => engine.sample(1, 0, 64, 0), /disposed/); engine.dispose();
  });
}
console.log(`${checks} compiled seed engine checks passed.`);
