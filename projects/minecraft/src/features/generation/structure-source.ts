import type { TerrainScope } from "../terrain/terrain-scope.ts";
import { copyTerrainWorkData } from "../terrain/terrain-work-data.ts";
import { TerrainWorkError } from "../terrain/terrain-worker-pool.ts";
import { createSeedSourceSession, type SeedSourcePool } from "./seed-source-session.ts";
import { validateStructureQueries } from "./run-structure-work.ts";
import type { StructureQuery, StructureWork, StructureWorkResult } from "./structure-work-types.ts";

export const createStructureSource = (pool: SeedSourcePool<StructureWork, StructureWorkResult>) => {
  const session = createSeedSourceSession(pool, selected => {
    const types = selected.artifact.config.structures;
    if (!Array.isArray(types) || !types.length || types.length > 256 || new Set(types).size !== types.length ||
      types.some(type => typeof type !== "string" || !type || type.length > 128)) throw new Error("Invalid structure registry");
  });
  return {
    select: session.select, getScope: session.getScope, dispose: session.dispose,
    async query(scope: TerrainScope, queries: readonly StructureQuery[] = [], signal?: AbortSignal): Promise<StructureWorkResult> {
      validateStructureQueries(queries);
      const expected = copyTerrainWorkData(queries, 32768).value;
      let types: readonly string[] = [];
      const result = await session.run(scope, selected => {
        types = selected.artifact.config.structures!;
        if (expected.some(query => !types.includes(query.type))) throw new Error("Unknown structure type");
        return { kind: "structures", artifact: { ...selected.artifact, config: { ...selected.artifact.config, structures: types } },
          profile: selected.version, seed: selected.seed, dimension: selected.dimension, queries: expected };
      }, signal);
      const valid = result?.kind === "structures" && Array.isArray(result.capabilities) && result.capabilities.length === types.length &&
        result.capabilities.every((cap, index) => cap?.type === types[index] && (cap.regionSize === null || Number.isSafeInteger(cap.regionSize) && cap.regionSize > 0 && cap.regionSize <= 1024)) &&
        Array.isArray(result.results) && result.results.length === expected.length && result.results.every((entry, index) => {
          if (!entry?.query || ["type", "regionX", "regionZ"].some(key => entry.query[key as keyof StructureQuery] !== expected[index][key as keyof StructureQuery])) return false;
          const size = result.capabilities.find(cap => cap.type === entry.query.type)?.regionSize;
          if (size === null) return entry.status === "unsupported" && entry.candidate === null;
          if (entry.status === "no-attempt") return entry.candidate === null;
          const point = entry.candidate;
          return entry.status === "candidate" && !!size && !!point && point.y === null && point.terrainVerified === false && typeof point.biomeViable === "boolean" &&
            [point.x, point.z].every(axis => Number.isSafeInteger(axis) && Math.abs(axis) <= 30000000) &&
            Math.floor(point.x / (size * 16)) === entry.query.regionX && Math.floor(point.z / (size * 16)) === entry.query.regionZ;
        });
      if (!valid) throw new TerrainWorkError("protocol", "Structure result does not match the requested source/regions");
      return result;
    },
  };
};
