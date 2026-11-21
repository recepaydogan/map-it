import { createTerrainWorkerPool, type TerrainWorkerPoolOptions } from "../terrain/terrain-worker-pool.ts";
import { createSeedSearchSource } from "./seed-search-source.ts";
import type { SeedSearchWork, SeedSearchWorkResult } from "./seed-search-types.ts";

export const createBrowserSeedSearch = (options?: TerrainWorkerPoolOptions) => createSeedSearchSource(
  createTerrainWorkerPool<SeedSearchWork, SeedSearchWorkResult>(
    () => new Worker(new URL("./seed-search.worker.ts", import.meta.url), { type: "module", name: "seed-search" }),
    { maxWorkers: 1, maxJobs: 1, maxQueuedBytes: 8 * 1024 * 1024, timeoutMs: 60_000, ...options },
  ),
);
