const clampShade = (value: number) => Math.max(-30, Math.min(24, Math.round(value)));

/**
 * Convert a padded surface-height grid into a seam-free cartographic hillshade.
 * The light comes from the north-west, the convention most readers perceive as raised terrain.
 */
export const createBiomeRelief = (heights: Float32Array, width: number, height: number, scale: number): Int8Array => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 65536 ||
    ![1, 4, 16, 64, 256].includes(scale) || heights.length !== (width + 2) * (height + 2) ||
    heights.some(value => !Number.isFinite(value) || Math.abs(value) > 4096)) throw new Error("Invalid biome relief grid");
  const output = new Int8Array(width * height), stride = width + 2;
  const lightX = -0.46, lightY = 0.76, lightZ = -0.46;
  const flatLight = lightY / Math.hypot(lightX, lightY, lightZ);
  // A Sobel gradient suppresses the 1:4 source lattice while retaining broad ridges and valleys.
  const verticalExaggeration = 1.45;
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const center = (z + 1) * stride + x + 1;
    const slopeX = (heights[center - stride + 1] + 2 * heights[center + 1] + heights[center + stride + 1]
      - heights[center - stride - 1] - 2 * heights[center - 1] - heights[center + stride - 1]) / (8 * scale) * verticalExaggeration;
    const slopeZ = (heights[center + stride - 1] + 2 * heights[center + stride] + heights[center + stride + 1]
      - heights[center - stride - 1] - 2 * heights[center - stride] - heights[center - stride + 1]) / (8 * scale) * verticalExaggeration;
    const normalLength = Math.hypot(slopeX, 1, slopeZ);
    const light = (-slopeX * lightX + lightY - slopeZ * lightZ) /
      (normalLength * Math.hypot(lightX, lightY, lightZ));
    output[z * width + x] = clampShade((light - flatLight) * 92);
  }
  return output;
};
