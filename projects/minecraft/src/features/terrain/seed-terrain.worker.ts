import { installSourceWorker } from "./install-source-worker.ts";
import { runSeedTerrainRequest } from "./seed-terrain-work.ts";

installSourceWorker(runSeedTerrainRequest, 64 * 1024 * 1024);
