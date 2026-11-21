import type { FaceMaterial, TerrainTextureArray } from "./terrain-draw-data.ts";
import type { VoxelShape } from "./mesh-voxel-section.ts";
import type { VoxelState } from "./voxel-section.ts";

export interface PreviewMaterialRules {
  emptyIds: readonly string[];
  deferredTokens: readonly string[];
  faceVariants?: boolean;
  groups: readonly { id: string; color: readonly [number, number, number]; tokens: readonly string[];
    pattern?: PreviewMaterialPattern; accent?: readonly [number, number, number] }[];
}

export type PreviewMaterialPattern = "neutral" | "mottle" | "granular" | "layered" | "grain" | "porous" | "crystalline" | "veined";
const patterns = new Set<PreviewMaterialPattern>(["neutral", "mottle", "granular", "layered", "grain", "porous", "crystalline", "veined"]);
const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const stringSeed = (value: string) => {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619) >>> 0;
  return result;
};
const pixelNoise = (seed: number, x: number, y: number) => {
  let value = seed ^ Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(y + 1, 0x27d4eb2d);
  value = Math.imul(value ^ value >>> 16, 0x45d9f3b); value = Math.imul(value ^ value >>> 16, 0x45d9f3b);
  return (value ^ value >>> 16) >>> 0;
};
const pixelDetail = (pattern: PreviewMaterialPattern, seed: number, x: number, y: number, variant: number) => {
  const noise = pixelNoise(seed, x, y), coarse = pixelNoise(seed, x >> 1, y >> 1);
  switch (pattern) {
    case "mottle": return (noise % 13) - 6 + (coarse % 11) - 5;
    case "granular": return noise % 17 === 0 ? 18 : noise % 11 === 0 ? -17 : (noise % 9) - 4;
    case "layered": return variant === 1 ? (y % 4 === 0 ? -13 : (noise % 7) - 2) : (coarse % 15) - 7;
    case "grain": return variant === 1 ? ((x + (y >> 2)) % 5 === 0 ? -15 : (noise % 9) - 3)
      : (Math.abs(x - 7) + Math.abs(y - 7)) % 4 === 0 ? -13 : (noise % 7) - 2;
    case "porous": return noise % 13 === 0 ? -25 : noise % 7 === 0 ? 11 : (coarse % 9) - 5;
    case "crystalline": return (x * 3 + y * 5 + seed) % 11 < 2 ? 20 : (noise % 9) - 5;
    case "veined": return (x * 5 + y * 3 + (seed & 15)) % 13 < 2 ? -19 : (coarse % 9) - 4;
    default: return ((x >> 2) + (y >> 2)) % 2 ? 4 : -4;
  }
};
const accentPixel = (pattern: PreviewMaterialPattern, seed: number, x: number, y: number) => {
  const noise = pixelNoise(seed ^ 0x9e3779b9, x, y);
  return pattern === "crystalline" ? (x * 3 + y * 5 + seed) % 11 === 0
    : pattern === "veined" ? (x * 5 + y * 3 + (seed & 15)) % 13 === 0
    : pattern === "granular" || pattern === "porous" ? noise % 29 === 0 : false;
};

export const createPreviewTerrainTextures = (rules: PreviewMaterialRules, size = 16): TerrainTextureArray => {
  if (!Number.isInteger(size) || size < 2 || size > 64 || !rules.groups.length) throw new Error("Invalid preview texture rules.");
  const variants = rules.faceVariants ? 3 : 1, rgba = new Uint8Array(size * size * rules.groups.length * variants * 4);
  rules.groups.forEach((group, groupIndex) => {
    const pattern = group.pattern ?? "neutral";
    if (group.color.length !== 3 || group.color.some(value => !Number.isInteger(value) || value < 0 || value > 255) ||
      !patterns.has(pattern) || group.accent && (group.accent.length !== 3 || group.accent.some(value => !Number.isInteger(value) || value < 0 || value > 255)))
      throw new Error("Invalid preview material color.");
    const seed = stringSeed(group.id);
    for (let variant = 0; variant < variants; variant++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const layer = groupIndex * variants + variant, faceShade = variant === 0 ? 7 : variant === 2 ? -11 : 0;
      const source = group.accent && accentPixel(pattern, seed, x, y) ? group.accent : group.color;
      const detail = pixelDetail(pattern, seed, x, y, variant);
      const offset = ((layer * size + y) * size + x) * 4;
      rgba.set([clampByte(source[0] + faceShade + detail), clampByte(source[1] + faceShade + detail),
        clampByte(source[2] + faceShade + detail), 255], offset);
    }
  });
  return { size, layers: rules.groups.length * variants, rgba };
};

export const classifyPreviewTerrainPalette = (palette: readonly VoxelState[], rules: PreviewMaterialRules): {
  shapes: VoxelShape[];
  materials: FaceMaterial[][];
} => {
  if (!rules.groups.length || new Set(rules.groups.map(group => group.id)).size !== rules.groups.length)
    throw new Error("Invalid preview material groups.");
  const fallback = rules.groups.length - 1, variants = rules.faceVariants ? 3 : 1;
  const shapes: VoxelShape[] = [], materials: FaceMaterial[][] = [];
  for (const state of palette) {
    const id = state.id.toLocaleLowerCase("en-US");
    const shape: VoxelShape = rules.emptyIds.includes(id) ? "empty"
      : rules.deferredTokens.some(token => id.includes(token)) ? "model" : "opaque-cube";
    const tile = rules.groups.findIndex(group => group.tokens.some(token => id.includes(token)));
    const resolvedTile = tile < 0 ? fallback : tile;
    shapes.push(shape);
    materials.push(Array.from({ length: 6 }, (_, face) => ({
      tile: resolvedTile * variants + (variants === 1 ? 0 : face === 3 ? 0 : face === 2 ? 2 : 1),
      tint: [1, 1, 1] as const,
    })));
  }
  return { shapes, materials };
};
