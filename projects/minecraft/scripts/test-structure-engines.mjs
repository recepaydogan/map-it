import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_SEED_ENGINE_SOURCES, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
import { createWasmBiomeEngine } from "../src/features/generation/wasm-biome-engine.ts";
import { runStructureWork } from "../src/features/generation/run-structure-work.ts";

let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const fingerprints = [];
for (const source of GAME_SEED_ENGINE_SOURCES) {
  const manifest = JSON.parse(await readFile(`node_modules/.cache/seed-engines/${source.edition}.json`, "utf8"));
  const bytes = new Uint8Array(await readFile(`node_modules/.cache/seed-engines/${source.edition}.wasm`));
  assert.equal(manifest.revision, source.revision); assert.equal(manifest.archiveSha256, source.archiveSha256);
  assert.deepEqual(manifest.structureTypes, GAME_STRUCTURE_TYPES.map(type => type.id));
  const config = { sha256: manifest.wasmSha256, profiles: manifest.profiles, structures: manifest.structureTypes };
  const engine = await createWasmBiomeEngine(bytes, config);
  const profile = config.profiles.at(-1), job = { kind: "structures", artifact: { bytes, config }, profile, seed: "8675309", dimension: 0, queries: [] };
  try {
    await check(`${source.edition}: registry ABI and seeded capability boundaries are enforced`, async () => {
      assert.throws(() => engine.regionSize("village"), /selected seed/);
      await assert.rejects(createWasmBiomeEngine(bytes, { ...config, structures: ["village"] }), /ABI/);
      engine.seed(profile, "1", 0); assert.equal(engine.regionSize("village"), 34);
      assert.equal(engine.regionSize("fortress"), null); assert.throws(() => engine.structure("fortress", 0, 0), /unavailable/);
      assert.throws(() => engine.regionSize("not-a-type"), /Unknown/);
      engine.seed(config.profiles[0], "1", 0);
      assert.equal(engine.regionSize("trial-chambers"), source.edition === "java" ? null : 34);
    });
    await check(`${source.edition}: every exposed type/profile/dimension uses its own region span without fabricated Y`, () => {
      const seen = new Set();
      for (const version of config.profiles) for (const dimension of [-1, 0, 1]) {
        engine.seed(version, "-9223372036854775808", dimension);
        const before = engine.sample(1, -80, 63, 20);
        for (const type of config.structures) {
          const size = engine.regionSize(type); if (size === null) continue; seen.add(type);
          for (const [x, z] of [[-2, -1], [0, 0], [3, 5]]) {
            const candidate = engine.structure(type, x, z);
            if (candidate) {
              assert.equal(Math.floor(candidate.x / (size * 16)), x); assert.equal(Math.floor(candidate.z / (size * 16)), z);
              assert.equal(candidate.y, null); assert.equal(candidate.terrainVerified, false); assert.equal(typeof candidate.biomeViable, "boolean");
            }
          }
        }
        assert.equal(engine.sample(1, -80, 63, 20), before, "Structure checks mutated biome seed state");
      }
      assert.deepEqual([...seen].sort(), config.structures.filter(type => source.edition === "bedrock" || type !== "abandoned-camp").sort());
    });
    await check(`${source.edition}: abandoned camps are available only on the Bedrock 26.50 generation profile`, () => {
      engine.seed(config.profiles[0], "1", 0);
      assert.equal(engine.regionSize("abandoned-camp"), null);
      if (source.edition === "bedrock") {
        engine.seed("26.45", "1", 0);
        assert.equal(engine.regionSize("abandoned-camp"), null);
        engine.seed("26.51", "8675309", 0);
        assert.deepEqual(engine.structure("abandoned-camp", -10, -8), {
          x: -5808, y: null, z: -4576, biomeViable: true, terrainVerified: false,
        });
      }
      engine.seed(profile, "1", 0);
      assert.equal(engine.regionSize("abandoned-camp"), source.edition === "bedrock" ? 37 : null);
      engine.seed(profile, "1", -1);
      assert.equal(engine.regionSize("abandoned-camp"), null);
    });
    await check(`${source.edition}: mineshafts, buried treasure and strongholds produce seed-backed map candidates`, () => {
      engine.seed(profile, job.seed, 0);
      for (const type of ["mineshaft", "buried-treasure", "stronghold"]) {
        const size = engine.regionSize(type);
        assert(size, `${type} must be supported in the Overworld`);
        const radius = 12;
        let candidate = null;
        for (let regionX = -radius; regionX <= radius && !candidate; regionX++) {
          for (let regionZ = -radius; regionZ <= radius && !candidate; regionZ++) candidate = engine.structure(type, regionX, regionZ);
        }
        assert(candidate, `${type} must expose at least one candidate around the seed origin`);
        assert.equal(candidate.y, null); assert.equal(candidate.terrainVerified, false);
      }
    });
    await check(`${source.edition}: batched source results equal direct results, including unsupported versus absent`, async () => {
      const queries = [{ type: "village", regionX: -1, regionZ: -1 }, { type: "fortress", regionX: 0, regionZ: 0 }];
      const result = await runStructureWork({ ...job, queries }); engine.seed(profile, job.seed, 0);
      assert.deepEqual(result.results[0].candidate, engine.structure("village", -1, -1));
      assert.equal(result.results[1].status, "unsupported"); assert.equal(result.results[1].candidate, null);
      const end = await runStructureWork({ ...job, dimension: 1, queries: [{ type: "end-city", regionX: 0, regionZ: 0 }] });
      assert.equal(end.results[0].status, "no-attempt"); assert.equal(end.results[0].candidate, null);
      assert.equal((await runStructureWork(job)).capabilities.length, config.structures.length);
    });
    await check(`${source.edition}: rejected candidates remain distinct from biome-tested predictions`, () => {
      engine.seed(profile, job.seed, 0); const statuses = new Set();
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) statuses.add(engine.structure("village", x, z).biomeViable);
      assert.deepEqual(statuses, new Set([true, false]));
      fingerprints.push(engine.structure("village", 0, 0));
    });
    await check(`${source.edition}: bounds, duplicate jobs and malformed artifacts fail without stale output`, async () => {
      for (const [x, z] of [[NaN, 0], [0, Infinity], [2 ** 32, 0], [0.5, 0], [1000000, 0]])
        assert.throws(() => engine.structure("village", x, z), /Invalid/);
      const query = { type: "village", regionX: 0, regionZ: 0 };
      for (const queries of [[query, query], Array(65).fill(query), [{ ...query, type: "unknown" }]])
        await assert.rejects(runStructureWork({ ...job, queries }));
      await assert.rejects(runStructureWork({ ...job, profile: "unadvertised-release" }), /Unsupported/);
      for (const seed of ["-9223372036854775808", "9223372036854775807", "9007199254740993"]) {
        engine.seed(profile, seed, 0); const first = engine.structure("village", -10, 5);
        engine.seed(profile, seed, 0); assert.deepEqual(engine.structure("village", -10, 5), first);
      }
      assert.throws(() => engine.seed(profile, "9223372036854775808", 0));
      assert.throws(() => engine.structure("village", 0, 0), /selected seed/);
    });
    if (source.edition === "java") await check("java: village attempts match an independently implemented BigInt Java Random protocol", () => {
      // Position protocol only: independently implemented arithmetic, not an in-game viability golden.
      const reference = (seed, rx, rz) => {
        let state = (BigInt(seed) + BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n + 10387312n ^ 0x5deece66dn) & ((1n << 48n) - 1n);
        const next = () => { state = (state * 0x5deece66dn + 11n) & ((1n << 48n) - 1n); return Number(state >> 17n); };
        const bounded = () => { let bits, value; do { bits = next(); value = bits % 26; } while (bits - value + 25 >= 2147483648); return value; };
        return { x: (rx * 34 + bounded()) * 16, z: (rz * 34 + bounded()) * 16 };
      };
      for (const seed of ["0", "1", "-1", "9007199254740993", "-9223372036854775808"]) {
        engine.seed("1.20.6", seed, 0);
        for (const [rx, rz] of [[0, 0], [-1, -1], [3, -7], [-40, 20]]) {
          const point = engine.structure("village", rx, rz); assert.deepEqual({ x: point.x, z: point.z }, reference(seed, rx, rz));
        }
      }
    });
  } finally { engine.dispose(); }
  await check(`${source.edition}: disposed engines cannot return retained structure coordinates`, () => assert.throws(() => engine.structure("village", 0, 0), /disposed/));
}
assert.notDeepEqual(fingerprints[0], fingerprints[1], "Both editions accidentally used the same structure implementation");
console.log(`${checks} compiled structure engine checks passed; no in-game structure verification claimed.`);
