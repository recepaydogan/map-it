import { assertTerrainScope, sameTerrainScope, type TerrainScope } from "../terrain/terrain-scope.ts";
import { copyTerrainWorkData } from "../terrain/terrain-work-data.ts";
import { TerrainWorkError, type createTerrainWorkerPool } from "../terrain/terrain-worker-pool.ts";
import type { BiomeEngineConfig } from "./wasm-biome-engine.ts";
import { validateSeedSearchRequest } from "./run-seed-search-work.ts";
import type { SeedSearchRequirement, SeedSearchWork, SeedSearchWorkResult } from "./seed-search-types.ts";

export interface SeedSearchSelection {
  worldId: string;
  edition: string;
  version: string;
  dimension: -1 | 0 | 1;
  artifact: { bytes: Uint8Array; config: BiomeEngineConfig & { structures: readonly string[] } };
}

type SearchPool = Pick<ReturnType<typeof createTerrainWorkerPool<SeedSearchWork, SeedSearchWorkResult>>, "setScope" | "submit" | "dispose">;

export const createSeedSearchSource = (pool: SearchPool) => {
  let selected: SeedSearchSelection | null = null, scope: Readonly<TerrainScope> | null = null, revision = 0, disposed = false;
  return {
    select(next: SeedSearchSelection | null): Readonly<TerrainScope> | null {
      if (disposed) throw new TerrainWorkError("disposed", "Seed search source is disposed");
      selected = null; scope = null; pool.setScope(null);
      if (!next) return null;
      const snapshot = copyTerrainWorkData(next, 5 * 1024 * 1024).value;
      if (![snapshot.worldId, snapshot.edition, snapshot.version].every(value => typeof value === "string" && value.length > 0 && value.length <= 128) ||
        ![-1, 0, 1].includes(snapshot.dimension) || !(snapshot.artifact.bytes instanceof Uint8Array) || snapshot.artifact.bytes.length < 1 ||
        snapshot.artifact.bytes.length > 4 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(snapshot.artifact.config.sha256) ||
        !snapshot.artifact.config.profiles.includes(snapshot.version) || !Array.isArray(snapshot.artifact.config.structures) ||
        !snapshot.artifact.config.structures.length || snapshot.artifact.config.structures.length > 256 ||
        snapshot.artifact.config.structures.some(type => typeof type !== "string" || !type || type.length > 128) ||
        new Set(snapshot.artifact.config.structures).size !== snapshot.artifact.config.structures.length)
        throw new Error("Invalid seed search selection");
      const nextScope = { worldId: snapshot.worldId, dimension: String(snapshot.dimension), sourceId: JSON.stringify([
        snapshot.edition, snapshot.version, snapshot.artifact.config.sha256, snapshot.artifact.config.structures,
      ]), revision: ++revision };
      assertTerrainScope(nextScope); selected = snapshot; scope = Object.freeze(nextScope); pool.setScope(scope); return scope;
    },
    async search(requestedScope: TerrainScope, candidates: readonly string[], requirements: readonly SeedSearchRequirement[], signal?: AbortSignal) {
      if (disposed) throw new TerrainWorkError("disposed", "Seed search source is disposed");
      if (!selected || !scope || !sameTerrainScope(scope, requestedScope)) throw new TerrainWorkError("stale", "Seed search belongs to another source");
      validateSeedSearchRequest(candidates, requirements);
      const expectedCandidates = [...candidates], expectedRequirements = requirements.map(entry => ({ ...entry }));
      const result = await pool.submit(scope, { kind: "seed-search", artifact: selected.artifact, profile: selected.version,
        candidates: expectedCandidates, dimension: selected.dimension, requirements: expectedRequirements }, signal);
      if (!scope || !sameTerrainScope(scope, requestedScope)) throw new TerrainWorkError("stale", "Obsolete seed search result");
      const valid = result?.kind === "seed-search" && ["match", "none", "unsupported"].includes(result.status) &&
        Number.isSafeInteger(result.evaluated) && result.evaluated >= 0 && result.evaluated <= expectedCandidates.length && Array.isArray(result.unsupported) &&
        result.unsupported.every(type => expectedRequirements.some(entry => entry.kind !== "biome" && entry.type === type)) && new Set(result.unsupported).size === result.unsupported.length &&
        (result.status === "match" ? !result.unsupported.length && !!result.match && result.evaluated > 0 && result.match.seed === expectedCandidates[result.evaluated - 1] &&
          Array.isArray(result.match.points) && result.match.points.length === expectedRequirements.length && result.match.points.every((point, index) => {
            const requirement = expectedRequirements[index], kind = requirement.kind ?? "structure";
            return point?.kind === kind && point.type === requirement.type && point.y === null && point.biomeViable === true && point.terrainVerified === false &&
              [point.x, point.z].every(value => Number.isSafeInteger(value)) &&
              point.x * point.x + point.z * point.z <= requirement.radius * requirement.radius &&
              (kind === "structure" || (requirement.kind === "biome" && Number.isSafeInteger(point.biomeId)
                && requirement.biomeIds.includes(point.biomeId!) && Number.isSafeInteger(point.matchedSectors)
                && point.matchedSectors! >= requirement.minSectors && point.matchedSectors! <= 8
                && point.x * point.x + point.z * point.z >= requirement.innerRadius * requirement.innerRadius));
          })
          : result.match === null && (result.status === "none" ? result.evaluated === expectedCandidates.length && !result.unsupported.length
            : result.evaluated === 0 && result.unsupported.length > 0));
      if (!valid) throw new TerrainWorkError("protocol", "Seed search result does not match the request");
      return result;
    },
    dispose() { if (disposed) return; disposed = true; selected = null; scope = null; pool.dispose(); },
  };
};
