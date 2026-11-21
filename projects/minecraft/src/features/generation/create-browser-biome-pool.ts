import { createTerrainWorkerPool } from "../terrain/terrain-worker-pool.ts";
import type { TerrainWorkerPoolOptions } from "../terrain/terrain-worker-pool.ts";
import type { BiomeWork, BiomeWorkResult } from "./biome-work-types.ts";

/** Reuse the source-scoped queue, hard cancellation, deadline and owned-buffer policy. */
export const createBrowserBiomePool = (options?: TerrainWorkerPoolOptions) => createTerrainWorkerPool<BiomeWork, BiomeWorkResult>(
  () => new Worker(new URL("./biome.worker.ts", import.meta.url), { type: "module", name: "biome-generation" }),
  { maxWorkers: Math.min(2, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 4) - 2)), ...options },
);
