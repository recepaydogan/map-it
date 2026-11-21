export type BiomeRgb = readonly [number, number, number];
export type BiomeRasterDetail = "overview" | "close";

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export const coordinateNoise = (biomeId: number, x: number, z: number) => {
  let value = Math.imul(biomeId + 1, 0x45d9f3b) ^ Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(z + 1, 0x165667b1);
  value = Math.imul(value ^ value >>> 16, 0x45d9f3b);
  value = Math.imul(value ^ value >>> 16, 0x45d9f3b);
  return (value ^ value >>> 16) >>> 0;
};

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const smoothStep = (value: number) => value * value * (3 - 2 * value);

const signedNoise = (biomeId: number, x: number, z: number) =>
  coordinateNoise(biomeId, x, z) / 0xffffffff * 2 - 1;

/** Continuous value noise avoids exposing the square sampling lattice in broad, single-biome areas. */
const smoothCoordinateNoise = (biomeId: number, worldX: number, worldZ: number, wavelength: number) => {
  const sampleX = worldX / wavelength, sampleZ = worldZ / wavelength;
  const x0 = Math.floor(sampleX), z0 = Math.floor(sampleZ);
  const mixX = smoothStep(sampleX - x0), mixZ = smoothStep(sampleZ - z0);
  const top = lerp(signedNoise(biomeId, x0, z0), signedNoise(biomeId, x0 + 1, z0), mixX);
  const bottom = lerp(signedNoise(biomeId, x0, z0 + 1), signedNoise(biomeId, x0 + 1, z0 + 1), mixX);
  return lerp(top, bottom, mixZ);
};

export const createBiomeRasterPalette = (colors: Readonly<Record<number, string>>): ReadonlyMap<number, BiomeRgb> =>
  new Map(Object.entries(colors).map(([id, color]) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Invalid biome color");
    const rgb = Number.parseInt(color.slice(1), 16);
    return [Number(id), [rgb >> 16, (rgb >> 8) & 255, rgb & 255] as const];
  }));

/** Subtle decorative variation only; it is continuous in world space and never claims to encode terrain height. */
export const biomeRasterColor = (base: BiomeRgb, biomeId: number, worldX: number, worldZ: number,
  detail: BiomeRasterDetail = "overview"): BiomeRgb => {
  const broad = smoothCoordinateNoise(biomeId, worldX, worldZ, 128);
  const medium = smoothCoordinateNoise(biomeId ^ 0x5bd1e995, worldX, worldZ, 32);
  // At block-detail zoom the broad approximate height field can look soft. Fine,
  // low-amplitude world-space grain restores scale without inventing terrain edges.
  const close = detail === "close"
    ? smoothCoordinateNoise(biomeId ^ 0x27d4eb2d, worldX, worldZ, 8) * 1.35
      + smoothCoordinateNoise(biomeId ^ 0x165667b1, worldX, worldZ, 3) * 1.15
      + smoothCoordinateNoise(biomeId ^ 0x7feb352d, worldX, worldZ, 1.5) * 0.75
    : 0;
  const shade = broad * 2.25 + medium * 0.75 + close;
  return [clampByte(base[0] + shade), clampByte(base[1] + shade), clampByte(base[2] + shade)];
};

/** Apply signed hillshade as luminance so biome hue remains recognizable. */
export const shadeBiomeRasterColor = (color: BiomeRgb, shade: number): BiomeRgb => {
  if (!Number.isInteger(shade) || shade < -128 || shade > 127) throw new Error("Invalid biome relief shade");
  const factor = 1 + shade / 100;
  return [clampByte(color[0] * factor), clampByte(color[1] * factor), clampByte(color[2] * factor)];
};
