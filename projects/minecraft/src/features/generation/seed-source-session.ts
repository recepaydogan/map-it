import { requireNumericSeed } from "../worlds/seed-value.ts";
import { assertTerrainScope, sameTerrainScope, type TerrainScope } from "../terrain/terrain-scope.ts";
import { copyTerrainWorkData } from "../terrain/terrain-work-data.ts";
import { TerrainWorkError, type createTerrainWorkerPool } from "../terrain/terrain-worker-pool.ts";
import type { BiomeEngineConfig } from "./wasm-biome-engine.ts";

export interface SeedSourceSelection {
  worldId: string; edition: string; version: string; seed: string; dimension: -1 | 0 | 1;
  artifact: { bytes: Uint8Array; config: BiomeEngineConfig };
}
export type SeedSourcePool<Work extends { kind: string }, Result extends { kind: string }> =
  Pick<ReturnType<typeof createTerrainWorkerPool<Work, Result>>, "setScope" | "submit" | "dispose">;

/** Shared ownership and late-result rejection for every seeded data layer. */
export const createSeedSourceSession = <Work extends { kind: string }, Result extends { kind: string }>(
  pool: SeedSourcePool<Work, Result>, validate?: (selection: SeedSourceSelection) => void,
) => {
  let selected: SeedSourceSelection | null = null, scope: Readonly<TerrainScope> | null = null;
  let revision = 0, disposed = false;
  const requireOpen = () => { if (disposed) throw new TerrainWorkError("disposed", "Seed source is disposed"); };
  return {
    select(next: SeedSourceSelection | null): Readonly<TerrainScope> | null {
      requireOpen(); scope = null; selected = null; pool.setScope(null);
      if (!next) return null;
      const snapshot = copyTerrainWorkData(next, 5 * 1024 * 1024).value;
      if (![snapshot.worldId, snapshot.edition, snapshot.version].every(value => typeof value === "string" && value.length > 0 && value.length <= 128) ||
        ![-1, 0, 1].includes(snapshot.dimension) || !(snapshot.artifact.bytes instanceof Uint8Array) ||
        snapshot.artifact.bytes.byteLength < 1 || snapshot.artifact.bytes.byteLength > 4 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/.test(snapshot.artifact.config.sha256) || !snapshot.artifact.config.profiles.includes(snapshot.version))
        throw new Error("Unsupported seed source selection");
      snapshot.seed = requireNumericSeed(snapshot.seed); validate?.(snapshot);
      const nextScope = { worldId: snapshot.worldId, dimension: String(snapshot.dimension), sourceId: JSON.stringify([
        snapshot.edition, snapshot.version, snapshot.seed, snapshot.artifact.config.sha256, snapshot.artifact.config.structures ?? null,
      ]), revision: ++revision };
      assertTerrainScope(nextScope); pool.setScope(nextScope); selected = snapshot; scope = Object.freeze(nextScope); return scope;
    },
    getScope() { return scope; },
    async run(requestedScope: TerrainScope, makeWork: (selection: SeedSourceSelection) => Work, signal?: AbortSignal): Promise<Result> {
      requireOpen();
      if (!selected || !scope || !sameTerrainScope(scope, requestedScope)) throw new TerrainWorkError("stale", "Request belongs to another seed source");
      const requestScope = scope;
      const result = await pool.submit(requestScope, makeWork(selected), signal);
      if (disposed) throw new TerrainWorkError("disposed", "Seed source is disposed");
      if (!scope || !sameTerrainScope(scope, requestScope)) throw new TerrainWorkError("stale", "Obsolete seed source result");
      if (signal?.aborted) throw new TerrainWorkError("cancelled", "Seed source request cancelled");
      return result;
    },
    dispose() { if (disposed) return; disposed = true; scope = null; selected = null; pool.dispose(); },
  };
};
