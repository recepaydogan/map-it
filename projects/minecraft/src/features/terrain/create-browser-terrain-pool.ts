import { createTerrainWorkerPool } from "./terrain-worker-pool.ts";
import type { TerrainWorkerPoolOptions } from "./terrain-worker-pool.ts";

export const createBrowserTerrainPool = (options?: TerrainWorkerPoolOptions) => createTerrainWorkerPool(
  () => new Worker(new URL("./terrain.worker.ts", import.meta.url), { type: "module", name: "terrain" }), options,
);
