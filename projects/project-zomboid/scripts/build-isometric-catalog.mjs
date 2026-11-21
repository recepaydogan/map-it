import { resolve } from "node:path";
import { writeIsometricCatalog } from "./isometric-catalog.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const gameRoot = resolve(process.env.PZ_GAME_DIR || resolve(projectRoot, "..", "project-zomboid"));
const catalog = writeIsometricCatalog({
  publishedRoot: resolve(
    projectRoot,
    ".runtime-data",
    "map-data",
    "knox-country",
    "isometric-optimized",
  ),
  mapRoot: resolve(gameRoot, "media", "maps", "Muldraugh, KY"),
});

console.log(`Isometric catalog contains ${catalog.packs.length} packs covering ${catalog.renderedCells} of ${catalog.totalCells} cells.`);
