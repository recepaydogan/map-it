import type { BiomeRange } from "./wasm-biome-engine.ts";

export interface BiomeCamera { x: number; z: number; zoom: number }
export interface BiomeViewport { width: number; height: number; camera: BiomeCamera; blockY: number }
export const tileKey = (range: BiomeRange) => [range.scale, range.cellX, range.cellZ, range.width, range.height, range.blockY].join(":");
export const BIOME_TILE_LIMIT = 1024;
export const BIOME_DEFAULT_ZOOM = 0.25;
const limit = 30000000;
export const clampBiomeCamera = (camera: BiomeCamera): BiomeCamera => {
  if (![camera.x, camera.z, camera.zoom].every(Number.isFinite)) throw new Error("Invalid biome camera");
  return { x: Math.max(-limit, Math.min(limit, camera.x)), z: Math.max(-limit, Math.min(limit, camera.z)), zoom: Math.max(1 / 64, Math.min(8, camera.zoom)) };
};
export const planBiomeTiles = ({ width, height, camera, blockY }: BiomeViewport, minimumScale = 1): BiomeRange[] => {
  if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 8192) || !Number.isInteger(blockY) || Math.abs(blockY) > 2048)
    throw new Error("Invalid biome viewport");
  const view = clampBiomeCamera(camera);
  // Prefer at least one sample per CSS pixel. At large fractional-zoom views, report a coarser native scale to stay within budget.
  const scales = [1, 4, 16, 64] as const;
  let scale = [...scales].reverse().find(value => value * view.zoom <= 1) ?? 1;
  scale = scales.find(value => value >= Math.max(scale, minimumScale)) ?? 64;
  // Small independently published tiles bound first-paint latency and stale work after a pan.
  const tileSize = 128;
  const bounds = (scale: number) => {
    const span = scale * tileSize;
    const left = Math.floor(Math.max(-limit, view.x - width / view.zoom / 2) / span);
    const right = Math.floor(Math.min(limit, view.x + width / view.zoom / 2) / span);
    const top = Math.floor(Math.max(-limit, view.z - height / view.zoom / 2) / span);
    const bottom = Math.floor(Math.min(limit, view.z + height / view.zoom / 2) / span);
    return { left, right, top, bottom, count: (right - left + 1) * (bottom - top + 1) };
  };
  while (bounds(scale).count > BIOME_TILE_LIMIT) {
    const next = scales[scales.indexOf(scale) + 1];
    if (!next) throw new Error("Biome viewport exceeds tile budget");
    scale = next;
  }
  const { left, right, top, bottom } = bounds(scale);
  const tiles: BiomeRange[] = [];
  for (let z = top; z <= bottom; z++) for (let x = left; x <= right; x++) {
    const cellX = Math.max(Math.ceil(-limit / scale), x * tileSize), cellZ = Math.max(Math.ceil(-limit / scale), z * tileSize);
    const width = Math.min((x + 1) * tileSize, Math.floor(limit / scale) + 1) - cellX;
    const height = Math.min((z + 1) * tileSize, Math.floor(limit / scale) + 1) - cellZ;
    if (width > 0 && height > 0) tiles.push({ scale, cellX, cellZ, width, height, blockY });
  }
  return tiles.sort((a, b) => Math.hypot(a.cellX * scale - view.x, a.cellZ * scale - view.z) - Math.hypot(b.cellX * scale - view.x, b.cellZ * scale - view.z));
};
