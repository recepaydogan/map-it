import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_SEED_TERRAIN, GAME_TERRAIN_PREVIEW_MATERIALS } from "../src/game-config.ts";
import { runSeedTerrainRequest } from "../src/features/terrain/seed-terrain-work.ts";
import { copyTerrainWorkData } from "../src/features/terrain/terrain-work-data.ts";
import { normalizeDensityData } from "../src/features/terrain/normalize-density-data.ts";
import { DensityFunction } from "deepslate";

for (const input of [-2, -0.5, 0, 0.5, 2]) {
  const normalized = normalizeDensityData({ type: "interval_select", input, thresholds: [-0.5, 0, 0.5], functions: [1, 2, 3, 4] });
  const actual = DensityFunction.fromJson(normalized).compute({ x: 0, y: 0, z: 0 });
  assert.equal(actual, input < -0.5 ? 1 : input < 0 ? 2 : input < 0.5 ? 3 : 4);
}
assert.throws(() => normalizeDensityData({ type: "interval_select", input: 0, thresholds: [1, 0], functions: [1, 2, 3] }), /interval/);
console.log("PASS interval boundaries retain the final overflow branch");

for (const source of GAME_SEED_TERRAIN.sources) {
  const data = new Uint8Array(await readFile(`public/seed-terrain/${source.version}.json`));
  assert.equal(JSON.parse(new TextDecoder().decode(data)).source.revision, source.revision);
  for (const dimension of ["overworld", "nether", "end", "amplified", "large-biomes"]) {
    const request = { kind: "seed-terrain", data, settingsId: `${GAME_SEED_TERRAIN.namespace}:${GAME_SEED_TERRAIN.settings[dimension]}`,
      seed: "5", biome: GAME_SEED_TERRAIN.defaultBiome, chunkX: 0, chunkZ: 0, radius: 0, materials: GAME_TERRAIN_PREVIEW_MATERIALS };
    const start = performance.now();
    const result = await runSeedTerrainRequest(copyTerrainWorkData(request, 64 * 1024 * 1024).value);
    assert.equal(result.kind, "seed-terrain"); assert(Number.isFinite(result.surfaceY));
    assert(result.entries.length > 0); assert(result.entries.every(entry => entry.mesh.blockIndices.length > 0));
    copyTerrainWorkData(result, 64 * 1024 * 1024);
    console.log(`PASS ${source.version} ${dimension}: ${result.entries.length} sections, ${(performance.now() - start).toFixed(0)} ms`);
    await assert.rejects(async () => runSeedTerrainRequest({ ...request, radius: 20 }), /radius/);
  }
}
