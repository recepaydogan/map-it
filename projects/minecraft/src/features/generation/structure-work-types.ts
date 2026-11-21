import type { BiomeEngineConfig } from "./wasm-biome-engine.ts";

export interface StructureQuery { type: string; regionX: number; regionZ: number }
export interface StructureWork {
  kind: "structures";
  artifact: { bytes: Uint8Array; config: BiomeEngineConfig & { structures: readonly string[] } };
  profile: string; seed: string; dimension: -1 | 0 | 1;
  /** Empty queries request only the seeded profile/dimension capabilities. */
  queries: readonly StructureQuery[];
}
export interface StructureCapability { type: string; regionSize: number | null }
export interface StructureCandidate { x: number; y: null; z: number; biomeViable: boolean; terrainVerified: false }
export interface StructureQueryResult {
  query: StructureQuery; status: "unsupported" | "no-attempt" | "candidate"; candidate: StructureCandidate | null;
}
export interface StructureWorkResult { kind: "structures"; capabilities: StructureCapability[]; results: StructureQueryResult[] }
