import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeIsometricMap } from "./isometric-map-optimizer.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const runtimeMapRoot = resolve(projectRoot, ".runtime-data", "map-data", "knox-country");
const sourceRoot = resolve(runtimeMapRoot, "isometric");
const targetRoot = resolve(runtimeMapRoot, "isometric-optimized");
const droppedLevels = Number(process.env.PZ_ISOMETRIC_DROPPED_LEVELS || 2);

const catalog = optimizeIsometricMap({ sourceRoot, targetRoot, droppedLevels });
console.log(
  `Built Ground-only isometric map with ${catalog.packs.length} packs and ${droppedLevels} high-detail levels removed at ${targetRoot}.`,
);
