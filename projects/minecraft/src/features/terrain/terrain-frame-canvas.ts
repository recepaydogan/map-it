export interface TerrainFrame { width: number; height: number; pixels: Uint8Array }

export const flipTerrainFrameRows = (frame: TerrainFrame): Uint8ClampedArray => {
  if (!Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height) || frame.width < 1 || frame.height < 1
    || frame.width * frame.height > 16_777_216 || frame.pixels.length !== frame.width * frame.height * 4)
    throw new Error("Invalid terrain frame");
  const output = new Uint8ClampedArray(frame.pixels.length), stride = frame.width * 4;
  for (let row = 0; row < frame.height; row++) output.set(
    frame.pixels.subarray((frame.height - row - 1) * stride, (frame.height - row) * stride), row * stride);
  return output;
};

/** Convert WebGL's bottom-up RGBA readback into a top-down canvas without reading DOM overlays. */
export const terrainFrameCanvas = (frame: TerrainFrame): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width; canvas.height = frame.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Terrain snapshot drawing is unavailable");
  const image = new ImageData(frame.width, frame.height);
  image.data.set(flipTerrainFrameRows(frame));
  context.putImageData(image, 0, 0);
  return canvas;
};
