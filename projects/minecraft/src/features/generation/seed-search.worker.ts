import { installSourceWorker } from "../terrain/install-source-worker.ts";
import { runSeedSearchWork } from "./run-seed-search-work.ts";

installSourceWorker(runSeedSearchWork, 32 * 1024);
