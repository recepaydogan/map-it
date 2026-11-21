import type { BiomeEngineConfig, BiomeRange } from "./wasm-biome-engine.ts";

interface BiomeWorkBase {
  artifact: { bytes: Uint8Array; config: BiomeEngineConfig };
  profile: string;
  seed: string;
  dimension: -1 | 0 | 1;
  ranges: readonly BiomeRange[];
}
export type BiomeWork = BiomeWorkBase & { kind: "biomes" | "biome-relief" };

/** Numeric biome IDs and approximate hillshade stay separate so relief never delays or repeats the base tile. */
export type BiomeWorkResult =
  | { kind: "biomes"; tiles: { range: BiomeRange; biomes: Uint16Array }[] }
  | { kind: "biome-relief"; tiles: { range: BiomeRange; relief: Int8Array | null }[] };
