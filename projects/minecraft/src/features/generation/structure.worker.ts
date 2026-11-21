import { runStructureWork } from "./run-structure-work.ts";
import { installSourceWorker } from "../terrain/install-source-worker.ts";

installSourceWorker(runStructureWork, 128 * 1024);
