import type { BiomeEngineConfig } from "./wasm-biome-engine.ts";

export interface SeedSearchStructureRequirement {
  readonly kind?: "structure";
  readonly type: string;
  readonly radius: number;
}

export interface SeedSearchBiomeRequirement {
  readonly kind: "biome";
  readonly type: string;
  readonly biomeIds: readonly number[];
  readonly radius: number;
  readonly innerRadius: number;
  readonly scale: 16 | 64 | 256;
  readonly blockY: number;
  /** Number of eight compass sectors that must contain the biome. */
  readonly minSectors: number;
}

export type SeedSearchRequirement = SeedSearchStructureRequirement | SeedSearchBiomeRequirement;

export interface SeedSearchWork {
  readonly kind: "seed-search";
  readonly artifact: { bytes: Uint8Array; config: BiomeEngineConfig & { structures: readonly string[] } };
  readonly profile: string;
  readonly candidates: readonly string[];
  readonly dimension: -1 | 0 | 1;
  readonly requirements: readonly SeedSearchRequirement[];
}

export interface SeedSearchPoint {
  readonly kind: "structure" | "biome";
  readonly type: string;
  readonly x: number;
  readonly y: null;
  readonly z: number;
  readonly biomeViable: true;
  readonly terrainVerified: false;
  readonly biomeId?: number;
  readonly matchedSectors?: number;
}

export interface SeedSearchWorkResult {
  readonly kind: "seed-search";
  readonly status: "match" | "none" | "unsupported";
  readonly evaluated: number;
  readonly unsupported: readonly string[];
  readonly match: { readonly seed: string; readonly points: readonly SeedSearchPoint[] } | null;
}
