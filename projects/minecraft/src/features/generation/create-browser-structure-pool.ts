import { createTerrainWorkerPool, type TerrainWorkerPoolOptions } from "../terrain/terrain-worker-pool.ts";
import type { StructureWork, StructureWorkResult } from "./structure-work-types.ts";

export const createBrowserStructurePool = (options?: TerrainWorkerPoolOptions) => createTerrainWorkerPool<StructureWork, StructureWorkResult>(
  () => new Worker(new URL("./structure.worker.ts", import.meta.url), { type: "module", name: "structure-generation" }), options,
);
