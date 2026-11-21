import type { TerrainScope } from "../terrain/terrain-scope.ts";
import { copyTerrainWorkData } from "../terrain/terrain-work-data.ts";
import { TerrainWorkError } from "../terrain/terrain-worker-pool.ts";
import type { BiomeWork, BiomeWorkResult } from "./biome-work-types.ts";
import type { BiomeRange } from "./wasm-biome-engine.ts";
import { createSeedSourceSession, type SeedSourcePool, type SeedSourceSelection } from "./seed-source-session.ts";

export type BiomeSourceSelection = SeedSourceSelection;
type BiomeTiles = Extract<BiomeWorkResult, { kind: "biomes" }>["tiles"];
type ReliefTiles = Extract<BiomeWorkResult, { kind: "biome-relief" }>["tiles"];
const rangeKeys = ["scale", "cellX", "cellZ", "width", "height", "blockY"] as const;

/** Owns its pool. Shared source identity prevents cross-world leakage across generated layers. */
export const createBiomeTileSource = (pool: SeedSourcePool<BiomeWork, BiomeWorkResult>) => {
  const session = createSeedSourceSession(pool);
  return {
    select: session.select, getScope: session.getScope, dispose: session.dispose,
    async generate(requestedScope: TerrainScope, ranges: readonly BiomeRange[], signal?: AbortSignal): Promise<BiomeTiles> {
      if (!Array.isArray(ranges) || ranges.length < 1 || ranges.length > 16) throw new Error("Invalid biome tile batch");
      const expected = copyTerrainWorkData(ranges, 16384).value;
      const result = await session.run(requestedScope, selected => ({ kind: "biomes", artifact: selected.artifact,
        profile: selected.version, seed: selected.seed, dimension: selected.dimension, ranges: expected }), signal);
      if (result.kind !== "biomes" || !Array.isArray(result.tiles) || result.tiles.length !== expected.length ||
        result.tiles.some((tile, index) => !tile || !tile.range || rangeKeys.some(key => tile.range[key] !== expected[index][key]) ||
          !(tile.biomes instanceof Uint16Array) || !(tile.biomes.buffer instanceof ArrayBuffer) || tile.biomes.length !== expected[index].width * expected[index].height))
        throw new TerrainWorkError("protocol", "Biome tile result does not match the requested coordinates");
      return result.tiles;
    },
    async generateRelief(requestedScope: TerrainScope, ranges: readonly BiomeRange[], signal?: AbortSignal): Promise<ReliefTiles> {
      if (!Array.isArray(ranges) || ranges.length < 1 || ranges.length > 16) throw new Error("Invalid biome relief batch");
      const expected = copyTerrainWorkData(ranges, 16384).value;
      const result = await session.run(requestedScope, selected => ({ kind: "biome-relief", artifact: selected.artifact,
        profile: selected.version, seed: selected.seed, dimension: selected.dimension, ranges: expected }), signal);
      if (result.kind !== "biome-relief" || !Array.isArray(result.tiles) || result.tiles.length !== expected.length ||
        result.tiles.some((tile, index) => !tile || !tile.range || rangeKeys.some(key => tile.range[key] !== expected[index][key]) ||
          tile.relief !== null && (!(tile.relief instanceof Int8Array) || !(tile.relief.buffer instanceof ArrayBuffer) ||
            tile.relief.length !== expected[index].width * expected[index].height)))
        throw new TerrainWorkError("protocol", "Biome relief result does not match the requested coordinates");
      return result.tiles;
    },
  };
};
export type BiomeTileSource = ReturnType<typeof createBiomeTileSource>;
