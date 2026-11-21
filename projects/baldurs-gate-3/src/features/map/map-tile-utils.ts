/**
 * Which pyramid level to draw for a zoom. Level 0 is full resolution; each
 * level up halves it. `targetScale` is the on-screen scale at which a tile is
 * swapped for the next finer level (below 1 so tiles are slightly downscaled
 * rather than blurred up).
 */
export const selectMapDetailLevel = (zoom: number, levels: number[], targetScale = 0.72, pixelRatio = 1) => {
  const scale = zoom * Math.max(1, pixelRatio);
  const suitable = levels.filter((level) => scale * 2 ** level <= targetScale);
  return suitable.length > 0 ? Math.max(...suitable) : levels.length > 0 ? Math.min(...levels) : 0;
};

export interface MapScreenRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Tile selection in screen space also supports non-square atlas scaling. */
export const getVisibleMapTiles = (
  raster: { bounds: { minX: number; minY: number; maxX: number; maxY: number }; tileSize: number;
    tileImageSize?: { width: number; height: number }; detailLevels: number[] },
  rectangle: MapScreenRectangle,
  viewport: { width: number; height: number },
  pixelRatio = 1,
  overscan = 0,
) => {
  if (rectangle.width <= 0 || rectangle.height <= 0 || viewport.width <= 0 || viewport.height <= 0
    || rectangle.left >= viewport.width + overscan || rectangle.top >= viewport.height + overscan
    || rectangle.left + rectangle.width <= -overscan || rectangle.top + rectangle.height <= -overscan) return [];
  const sourceWidth = raster.tileImageSize?.width ?? raster.bounds.maxX - raster.bounds.minX;
  const sourceHeight = raster.tileImageSize?.height ?? raster.bounds.maxY - raster.bounds.minY;
  const scaleX = rectangle.width / sourceWidth;
  const scaleY = rectangle.height / sourceHeight;
  const level = selectMapDetailLevel(Math.max(scaleX, scaleY), raster.detailLevels, 0.72, pixelRatio);
  const tileSpan = raster.tileSize * 2 ** level;
  const width = tileSpan * scaleX;
  const height = tileSpan * scaleY;
  const minColumn = Math.max(0, Math.floor((-overscan - rectangle.left) / width));
  const maxColumn = Math.min(Math.ceil(sourceWidth / tileSpan) - 1,
    Math.ceil((viewport.width + overscan - rectangle.left) / width) - 1);
  const minRow = Math.max(0, Math.floor((-overscan - rectangle.top) / height));
  const maxRow = Math.min(Math.ceil(sourceHeight / tileSpan) - 1,
    Math.ceil((viewport.height + overscan - rectangle.top) / height) - 1);
  const tiles = [];
  for (let column = minColumn; column <= maxColumn; column += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      tiles.push({ column, row, level, left: column * width, top: row * height, width, height });
    }
  }
  return tiles;
};

export const resolveMapTilePath = (pattern: string, level: number, x: number, y: number) => pattern
  .replace("{level}", String(level))
  .replace("{x}", String(x))
  .replace("{y}", String(y));
