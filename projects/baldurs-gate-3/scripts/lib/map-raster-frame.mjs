/** Keep marker/view coordinates stable while storing a higher-resolution image. */
export const readRasterFrame = (args, imageWidth, imageHeight) => {
  if (args.has("logical-width") !== args.has("logical-height")) throw new Error("Logical width and height must be supplied together.");
  const width = Number(args.get("logical-width") ?? imageWidth);
  const height = Number(args.get("logical-height") ?? imageHeight);
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) throw new Error("Logical raster dimensions must be positive and finite.");
  return {
    width, height,
    ...(width !== imageWidth || height !== imageHeight ? { tileImageSize: { width: imageWidth, height: imageHeight } } : {}),
  };
};

export const readSourceCrop = (value, imageWidth, imageHeight) => {
  const crop = JSON.parse(value);
  if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger)
    || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
    || crop.x % 4 || crop.y % 4
    || crop.x + crop.width > imageWidth || crop.y + crop.height > imageHeight) {
    throw new Error("Source crop must start on a BC3 block boundary and stay inside the native image.");
  }
  return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
};

/** Extend or crop source imagery without moving any existing world-to-map point. */
export const preserveCoordinateFrame = (reference, previous, imageWidth, imageHeight) => {
  if (!previous) return null;
  const validRectangle = (rectangle) => rectangle
    && [rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite)
    && rectangle.width > 0 && rectangle.height > 0;
  if (!reference || !validRectangle(reference.worldBounds) || !validRectangle(previous.worldBounds)
    || !validRectangle(previous.imageBounds) || reference.flipY !== previous.flipY) {
    throw new Error("Cannot preserve an invalid or differently oriented coordinate frame.");
  }
  const world = reference.worldBounds;
  const oldWorld = previous.worldBounds;
  const oldImage = previous.imageBounds;
  const scaleX = oldImage.width / oldWorld.width;
  const scaleY = oldImage.height / oldWorld.height;
  const x = oldImage.x + (world.x - oldWorld.x) * scaleX;
  const y = oldImage.y + (reference.flipY
    ? oldWorld.y + oldWorld.height - world.y - world.height
    : world.y - oldWorld.y) * scaleY;
  const width = world.width * scaleX;
  const height = world.height * scaleY;
  return {
    bounds: { minX: x, minY: y, maxX: x + width, maxY: y + height },
    tileImageSize: { width: imageWidth, height: imageHeight },
    coordinateReference: { ...reference, imageBounds: { x, y, width, height } },
  };
};
