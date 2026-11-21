import { createBiomeWorkRunner } from "./run-biome-work.ts";
import type { BiomeWork, BiomeWorkResult } from "./biome-work-types.ts";
import { installSourceWorker } from "../terrain/install-source-worker.ts";

// Keep the entry itself tied to the runner protocol. Worker entry caching must
// invalidate when the biome/refinement message contract changes.
const runner = createBiomeWorkRunner();
installSourceWorker<BiomeWork, BiomeWorkResult>(work => runner.run(work), 1024 * 1024);
