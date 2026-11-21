import type { WorldRecord } from "../worlds/world-types.ts";

export interface SeededBiomePreviewConfig {
  kind: "seeded"; edition: string; revision: string; profiles: readonly string[]; versions: readonly string[];
  generationProfiles: Readonly<Record<string, string>>; url: string; sha256: string; bytes: number;
}
export interface UniformBiomePreviewConfig {
  kind: "uniform"; edition: string; versions: readonly string[]; preset: string;
  biomeIds: Readonly<Record<string, number>>; defaultBiomeId: number;
}
export type BiomePreviewConfig = SeededBiomePreviewConfig | UniformBiomePreviewConfig;
export const resolveBiomePreview = (world: Pick<WorldRecord, "edition" | "generation">, configs: readonly BiomePreviewConfig[]) =>
  configs.find(config => config.edition === world.edition && config.versions.includes(world.generation.version) && (config.kind === "uniform"
    ? config.preset === world.generation.preset && (world.generation.settings.biome === undefined
      || typeof world.generation.settings.biome === "string" && config.biomeIds[world.generation.settings.biome] !== undefined)
    : config.generationProfiles[JSON.stringify([world.generation.version, world.generation.preset])] !== undefined
      && Object.keys(world.generation.settings).length === 0)) ?? null;

/** Flat/fixed-biome settings affect the Overworld; their Nether and End retain the edition/version seed source. */
export const resolveDimensionBiomePreview = (world: Pick<WorldRecord, "edition" | "generation">, selected: BiomePreviewConfig,
  dimension: number, seededConfigs: readonly SeededBiomePreviewConfig[]) => {
  if (!Number.isSafeInteger(dimension) || ![-1, 0, 1].includes(dimension)) return null;
  if (selected.kind === "uniform" && dimension === 0) {
    const uniformBiomeId = selected.biomeIds[String(world.generation.settings.biome ?? "")] ?? selected.defaultBiomeId;
    return { config: selected, profile: `uniform:${uniformBiomeId}`, uniformBiomeId } as const;
  }
  const seeded = selected.kind === "seeded" ? selected : seededConfigs.find(candidate => candidate.edition === world.edition
    && candidate.versions.includes(world.generation.version));
  if (!seeded) return null;
  const profile = selected.kind === "seeded"
    ? seeded.generationProfiles[JSON.stringify([world.generation.version, world.generation.preset])]
    : seeded.generationProfiles[JSON.stringify([world.generation.version, "default"])];
  return profile && seeded.profiles.includes(profile) ? { config: seeded, profile, uniformBiomeId: null } as const : null;
};
