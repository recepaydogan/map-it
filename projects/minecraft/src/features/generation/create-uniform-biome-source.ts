import { sameTerrainScope, type TerrainScope } from "../terrain/terrain-scope.ts";
import type { BiomeWork, BiomeWorkResult } from "./biome-work-types.ts";
import { createBiomeTileSource } from "./biome-tile-source.ts";

/** A bounded source for truthful Flat/Single Biome previews; it never emits structures or block terrain. */
export const createUniformBiomeTileSource = (biomeId: number) => {
  if (!Number.isSafeInteger(biomeId) || biomeId < 0 || biomeId > 65535) throw new Error("Invalid uniform biome identity.");
  let scope: Readonly<TerrainScope> | null = null, disposed = false;
  return createBiomeTileSource({
    setScope(next) { scope = next; },
    async submit(requested, work: BiomeWork, signal): Promise<BiomeWorkResult> {
      if (disposed) throw new Error("Uniform biome source is disposed.");
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (!scope || !sameTerrainScope(scope, requested) || !["biomes", "biome-relief"].includes(work.kind)) throw new Error("Stale uniform biome request.");
      return work.kind === "biomes" ? { kind: "biomes", tiles: work.ranges.map(range => ({ range: { ...range },
        biomes: new Uint16Array(range.width * range.height).fill(biomeId) })) }
        : { kind: "biome-relief", tiles: work.ranges.map(range => ({ range: { ...range }, relief: null })) };
    },
    dispose() { disposed = true; scope = null; },
  });
};
