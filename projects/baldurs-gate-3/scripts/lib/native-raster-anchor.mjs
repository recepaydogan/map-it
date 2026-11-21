import assert from "node:assert/strict";
import path from "node:path";
import sharp from "sharp";

/** Refine only sub-two-native-pixel edges; never relocate or discard an object. */
export const refineNativeRasterAnchors = async (candidates, metadata, metadataPath) => {
  assert(metadata?.detailLevels?.includes(0), "Native anchor review requires level-zero tiles");
  const width = metadata.tileImageSize?.width ?? metadata.bounds.maxX - metadata.bounds.minX;
  const height = metadata.tileImageSize?.height ?? metadata.bounds.maxY - metadata.bounds.minY;
  const tileSize = metadata.tileSize;
  assert([width, height, tileSize].every((value) => Number.isInteger(value) && value > 0));
  assert.equal(metadata.tilePattern, "tiles/{level}/tile{x}x{y}.webp");
  const bounds = metadata.bounds, cache = new Map();
  const alphaAt = async (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const column = Math.floor(x / tileSize), row = Math.floor(y / tileSize), key = `${column}x${row}`;
    if (!cache.has(key)) {
      const file = path.join(path.dirname(metadataPath), "tiles", "0", `tile${key}.webp`);
      const decoded = await sharp(file).ensureAlpha().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
      assert(decoded.info.width === tileSize && decoded.info.height === tileSize && decoded.info.channels === 1, `Invalid native tile: ${file}`);
      cache.set(key, decoded.data);
    }
    return cache.get(key)[(y % tileSize) * tileSize + x % tileSize];
  };
  const nativePoint = (point) => ({
    x: (point.x - bounds.minX) / (bounds.maxX - bounds.minX) * width,
    y: (point.y - bounds.minY) / (bounds.maxY - bounds.minY) * height,
  });
  const refined = [];
  for (const candidate of candidates) {
    assert(candidate.mapPosition, `Missing display coordinate: ${candidate.id}`);
    const point = nativePoint(candidate.mapPosition);
    assert(Number.isFinite(point.x) && Number.isFinite(point.y), `Invalid display coordinate: ${candidate.id}`);
    if (await alphaAt(Math.floor(point.x), Math.floor(point.y)) > 16) {
      refined.push(candidate);
      continue;
    }
    let nearest = null;
    for (let y = Math.floor(point.y) - 2; y <= Math.floor(point.y) + 2; y++) {
      for (let x = Math.floor(point.x) - 2; x <= Math.floor(point.x) + 2; x++) {
        const distance = Math.hypot(x + 0.5 - point.x, y + 0.5 - point.y);
        if (distance > 2 || (nearest && distance >= nearest.distance)) continue;
        if (await alphaAt(x, y) > 16) nearest = { x, y, distance };
      }
    }
    assert(nearest, `Native raster anchor requires source review, not automatic snapping: ${candidate.id}`);
    const round = (value) => Math.round(value * 1000) / 1000;
    const mapPosition = {
      x: round(bounds.minX + (nearest.x + 0.5) / width * (bounds.maxX - bounds.minX)),
      y: round(bounds.minY + (nearest.y + 0.5) / height * (bounds.maxY - bounds.minY)),
    };
    const rounded = nativePoint(mapPosition);
    assert(await alphaAt(Math.floor(rounded.x), Math.floor(rounded.y)) > 16, `Rounded anchor is not visible: ${candidate.id}`);
    assert(Math.hypot(rounded.x - point.x, rounded.y - point.y) <= 2, `Rounded anchor exceeds the native edge limit: ${candidate.id}`);
    refined.push({ ...candidate, mapPosition, mapPositionAdjustment: {
      kind: "native-raster-edge", distance: nearest.distance, pixelSpace: "native-level-zero",
      original: candidate.mapPosition,
      ...(candidate.mapPositionAdjustment ? { previousAdjustment: candidate.mapPositionAdjustment } : {}),
      reviewReason: "Full-resolution alpha confirms a raster edge within two original pixels; only the icon center changes, never the authored world coordinate.",
    } });
  }
  return refined;
};
