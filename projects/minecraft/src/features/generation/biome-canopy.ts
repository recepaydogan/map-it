import { coordinateNoise, type BiomeRgb } from "./biome-raster-color.ts";

export interface BiomeCanopyStyle { density: number; spacing: number; radius: number }

const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

interface CanopyCrown { x: number; z: number; radius: number; seed: number }

const crownsAround = (biomeId: number, cellX: number, cellZ: number, style: BiomeCanopyStyle): CanopyCrown[] => {
  const crowns: CanopyCrown[] = [];
  for (let offsetZ = -1; offsetZ <= 1; offsetZ++) for (let offsetX = -1; offsetX <= 1; offsetX++) {
    const gridX = cellX + offsetX, gridZ = cellZ + offsetZ;
    const seed = coordinateNoise(biomeId, gridX, gridZ);
    if ((seed & 0xffff) / 0xffff > style.density) continue;
    crowns.push({
      x: (gridX + 0.18 + ((seed >>> 16) & 255) / 255 * 0.64) * style.spacing,
      z: (gridZ + 0.18 + ((seed >>> 24) & 255) / 255 * 0.64) * style.spacing,
      radius: style.radius * (0.78 + ((seed >>> 8) & 255) / 255 * 0.42),
      seed,
    });
  }
  return crowns;
};

const shadeWithCrowns = (base: BiomeRgb, x: number, z: number, crowns: readonly CanopyCrown[]): BiomeRgb => {
  let nearest = Number.POSITIVE_INFINITY, lighting = 0;
  for (const crown of crowns) {
    const dx = x - crown.x, dz = z - crown.z;
    if (Math.abs(dx) > crown.radius * 1.2 || Math.abs(dz) > crown.radius * 1.2) continue;
    // A few shallow lobes keep the crowns from looking like stamped circles.
    const shape = 1 + Math.sin(Math.atan2(dz, dx) * 5 + crown.seed * 0.000001) * 0.08;
    const distance = Math.hypot(dx, dz) / (crown.radius * shape);
    if (distance < nearest) {
      nearest = distance;
      lighting = (-dx - dz) / (crown.radius * 2);
    }
  }
  if (nearest >= 1.2) return base;
  const factor = nearest < 1
    ? 0.57 + (1 - nearest) * 0.25 + lighting * 0.11
    : 0.83;
  return [byte(base[0] * factor + 4), byte(base[1] * factor + 5), byte(base[2] * factor + 3)];
};

/** Decorative canopy texture anchored to world coordinates, with no claim of actual tree positions. */
export const shadeBiomeCanopy = (base: BiomeRgb, biomeId: number, x: number, z: number,
  style: BiomeCanopyStyle): BiomeRgb =>
  shadeWithCrowns(base, x, z, crownsAround(biomeId, Math.floor(x / style.spacing), Math.floor(z / style.spacing), style));

/** Reuse the nine nearby crown candidates for pixels in one tile cell. */
export const createBiomeCanopySampler = () => {
  const cells = new Map<string, readonly CanopyCrown[]>();
  let lastBiomeId = Number.NaN, lastCellX = Number.NaN, lastCellZ = Number.NaN;
  let lastCrowns: readonly CanopyCrown[] = [];
  return (base: BiomeRgb, biomeId: number, x: number, z: number, style: BiomeCanopyStyle): BiomeRgb => {
    const cellX = Math.floor(x / style.spacing), cellZ = Math.floor(z / style.spacing);
    if (biomeId !== lastBiomeId || cellX !== lastCellX || cellZ !== lastCellZ) {
      const key = `${biomeId}:${cellX}:${cellZ}`;
      let crowns = cells.get(key);
      if (!crowns) {
        crowns = crownsAround(biomeId, cellX, cellZ, style);
        cells.set(key, crowns);
      }
      lastBiomeId = biomeId; lastCellX = cellX; lastCellZ = cellZ; lastCrowns = crowns;
    }
    return shadeWithCrowns(base, x, z, lastCrowns);
  };
};
