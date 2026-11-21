/**
 * Which pyramid level to draw for a zoom. Level 0 has one pixel per map unit; each
 * level up halves it. `targetScale` is the on-screen scale at which a tile is
 * swapped for the next finer level (below 1 so tiles are slightly downscaled
 * rather than blurred up).
 */
export const selectMapDetailLevel = (zoom: number, levels: number[], targetScale = 0.72) => {
  const target = Math.round(Math.log2(targetScale / zoom));
  return levels.reduce((nearest, level) =>
    Math.abs(level - target) < Math.abs(nearest - target) ? level : nearest, levels[0] ?? 0);
};

export const resolveMapTilePath = (pattern: string, level: number, x: number, y: number) => pattern
  .replace("{level}", String(level))
  .replace("{x}", String(x))
  .replace("{y}", String(y));
