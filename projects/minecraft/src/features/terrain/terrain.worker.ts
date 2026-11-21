import { runTerrainWork } from "./run-terrain-work.ts";
import { installSourceWorker } from "./install-source-worker.ts";

installSourceWorker(runTerrainWork, 64 * 1024 * 1024);
