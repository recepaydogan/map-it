import { GAME_GUIDE_BLOCK_BIOMES, GAME_GUIDE_WOOD_BLOCK_PATTERNS } from "../../game-config.ts";
import type { BiomeGuideEntry } from "./biome-guide-data.ts";
import type { RecipeVisual } from "./recipe-types.ts";

export const woodBlockPattern = (id: string) => GAME_GUIDE_WOOD_BLOCK_PATTERNS[id];

/** Render a known family pattern only when the selected catalog lacks that exact recipe. */
export const createMissingWoodBlockRecipe = (id: string, hasRecipe: boolean,
  materialAvailable: boolean): RecipeVisual | null => {
  const pattern = woodBlockPattern(id);
  if (!pattern || hasRecipe || !materialAvailable) return null;
  const count = pattern.width * pattern.height;
  return { id: `guide:${id.slice(id.indexOf(":") + 1)}`, method: "shaped",
    ingredients: [{ choices: [{ kind: "item", id: pattern.material }], count }],
    outputs: [{ id, count: pattern.outputCount }],
    grid: { width: pattern.width, height: pattern.height, slots: Array(count).fill(0) } };
};

export const missingWoodBlockOutputs = (material: string, crafted: ReadonlySet<string>,
  available: (id: string) => boolean) => Object.entries(GAME_GUIDE_WOOD_BLOCK_PATTERNS)
  .filter(([id, pattern]) => pattern.material === material && !crafted.has(id) && available(id))
  .map(([id]) => id);

/** Keep one browsable block row when a legacy and current catalog ID display the same block. */
export const visibleBlockGuideIds = (available: ReadonlySet<string>, isBlock: (id: string) => boolean,
  canonicalId: (id: string) => string, name: (id: string) => string,
  crafted: ReadonlySet<string>): ReadonlySet<string> => {
  const visible = new Set([...available].filter(isBlock));
  for (const id of [...visible]) {
    const canonical = canonicalId(id);
    if (canonical === id || !visible.has(canonical) || name(id) !== name(canonical)) continue;
    if (crafted.has(id) && !crafted.has(canonical)) visible.delete(canonical);
    else visible.delete(id);
  }
  return visible;
};

export const BLOCK_GUIDE_FILTERS = ["all", "surface", "crafted", "redstone", "other"] as const;
export type BlockGuideFilter = (typeof BLOCK_GUIDE_FILTERS)[number];

export const createBlockSurfaceIndex = (biomes: ReadonlyMap<string, BiomeGuideEntry>) => {
  const ids = new Set<string>();
  for (const [id, paths] of Object.entries(GAME_GUIDE_BLOCK_BIOMES)) {
    if (paths.some(path => biomes.has(`minecraft:${path}`))) ids.add(id);
  }
  return ids;
};

export const matchesBlockGuideFilter = (id: string, filter: BlockGuideFilter,
  surface: ReadonlySet<string>, crafted: ReadonlySet<string>, redstone: ReadonlySet<string>) => {
  if (filter === "all") return true;
  if (filter === "surface") return surface.has(id);
  if (filter === "crafted") return crafted.has(id);
  if (filter === "redstone") return redstone.has(id);
  return !surface.has(id) && !crafted.has(id) && !redstone.has(id);
};
