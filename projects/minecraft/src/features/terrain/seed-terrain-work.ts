import { BlockState, Chunk, ChunkPos, DensityFunction, FixedBiomeSource, Identifier, NoiseChunkGenerator,
  NoiseGeneratorSettings, NoiseParameters, RandomState, WorldgenRegistries } from "deepslate";
import { requireNumericSeed } from "../worlds/seed-value.ts";
import { classifyPreviewTerrainPalette } from "./preview-terrain-materials.ts";
import type { PreviewMaterialRules } from "./preview-terrain-materials.ts";
import { meshVoxelSection } from "./mesh-voxel-section.ts";
import type { TerrainDrawEntry } from "./terrain-draw-data.ts";
import type { VoxelSection } from "./voxel-section.ts";
import { normalizeDensityData } from "./normalize-density-data.ts";

export interface SeedTerrainData {
  source: { edition: string; version: string; revision: string };
  registries: { noise: Record<string, unknown>; density_function: Record<string, unknown>; noise_settings: Record<string, unknown> };
}
export interface SeedTerrainWork {
  kind: "seed-terrain"; data: SeedTerrainData; settingsId: string; seed: string; biome: string;
  chunkX: number; chunkZ: number; radius?: number; materials: PreviewMaterialRules;
}
export interface SeedTerrainResult { kind: "seed-terrain"; entries: TerrainDrawEntry[]; surfaceY: number }
export type SeedTerrainRequest = Omit<SeedTerrainWork, "data"> & { data: Uint8Array };

export const runSeedTerrainRequest = (work: SeedTerrainRequest) => {
  if (!(work.data instanceof Uint8Array) || work.data.byteLength > 4 * 1024 * 1024) throw new Error("Invalid density artifact");
  return runSeedTerrainWork({ ...work, data: JSON.parse(new TextDecoder().decode(work.data)) as SeedTerrainData });
};

/** Base density and fluids only. Decorations, structures and saved edits are not generated. */
export const runSeedTerrainWork = async (work: SeedTerrainWork): Promise<SeedTerrainResult> => {
  if (work.kind !== "seed-terrain" || ![work.chunkX, work.chunkZ].every(value => Number.isSafeInteger(value) && Math.abs(value) < 1874998))
    throw new Error("Invalid seed terrain bounds");
  const seed = BigInt(requireNumericSeed(work.seed));
  for (const registry of [WorldgenRegistries.NOISE, WorldgenRegistries.DENSITY_FUNCTION]) registry.clear();
  for (const [id, data] of Object.entries(work.data.registries.noise)) WorldgenRegistries.NOISE.register(Identifier.parse(id), NoiseParameters.fromJson(data));
  for (const [id, data] of Object.entries(work.data.registries.density_function)) WorldgenRegistries.DENSITY_FUNCTION.register(Identifier.parse(id), () => DensityFunction.fromJson(normalizeDensityData(data)));
  const raw = work.data.registries.noise_settings[work.settingsId];
  if (!raw || typeof raw !== "object" || !("noise_router" in raw)) throw new Error("Unsupported density settings");
  const settings = NoiseGeneratorSettings.fromJson(normalizeDensityData(raw));
  if (settings.noise.height < 16 || settings.noise.height > 384 || settings.noise.minY % 16 || settings.noise.height % 16)
    throw new Error("Unsupported seed terrain height");
  const random = new RandomState(settings, seed), generator = new NoiseChunkGenerator(new FixedBiomeSource(Identifier.parse(work.biome)), settings);
  const chunks = new Map<string, Chunk>();
  const radius = work.radius ?? 1;
  if (radius !== 0 && radius !== 1) throw new Error("Invalid seed terrain radius");
  for (let z = -radius; z <= radius; z++) for (let x = -radius; x <= radius; x++) {
    const chunk = new Chunk(settings.noise.minY, settings.noise.height, ChunkPos.create(work.chunkX + x, work.chunkZ + z));
    generator.fill(random, chunk); chunks.set(`${work.chunkX + x}:${work.chunkZ + z}`, chunk);
  }
  const entries: TerrainDrawEntry[] = [];
  const shapeAt = (x: number, y: number, z: number) => {
    const chunk = chunks.get(`${Math.floor(x / 16)}:${Math.floor(z / 16)}`);
    if (!chunk) return "unknown" as const;
    return chunk.getBlockState([x, y, z]).equals(BlockState.AIR) ? "empty" as const : "opaque-cube" as const;
  };
  for (const chunk of chunks.values()) for (let sectionY = chunk.minSection; sectionY < chunk.maxSection; sectionY++) {
    const origin: [number, number, number] = [chunk.pos[0] * 16, sectionY * 16, chunk.pos[1] * 16];
    const section: VoxelSection = { palette: [], indices: new Uint16Array(4096) }, indices = new Map<string, number>();
    for (let i = 0; i < 4096; i++) {
      const state = chunk.getBlockState([origin[0] + (i & 15), origin[1] + (i >> 8), origin[2] + ((i >> 4) & 15)]), key = state.toString();
      if (!indices.has(key)) { indices.set(key, section.palette.length); section.palette.push({ id: String(state.getName()), properties: state.getProperties() }); }
      section.indices[i] = indices.get(key)!;
    }
    const { shapes, materials } = classifyPreviewTerrainPalette(section.palette, work.materials);
    if (shapes.every(shape => shape === "empty")) continue;
    const mesh = meshVoxelSection(section, { origin, shapes, neighbor: shapeAt });
    if (mesh.blockIndices.length) entries.push({ id: origin.join(":"), mesh, materials });
  }
  const center = chunks.get(`${work.chunkX}:${work.chunkZ}`)!;
  let surfaceY = settings.noise.minY;
  for (let y = center.maxY - 1; y >= center.minY; y--) if (!center.getBlockState([work.chunkX * 16 + 8, y, work.chunkZ * 16 + 8]).equals(BlockState.AIR)) { surfaceY = y + 1; break; }
  return { kind: "seed-terrain", entries, surfaceY };
};
