export const BIOME_GUIDE_FILE_LIMIT = 128 * 1024;

export interface BiomeGuideRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly temperature: number;
  readonly downfall: number;
  readonly topMaterial?: string;
  readonly seaMaterial?: string;
  readonly spawns: readonly Readonly<{ id: string; category: string; weight: number; min: number; max: number }>[];
}

export interface ValidatedBiomeGuideCatalog {
  readonly source: Readonly<{ edition: string; version: string; revision: string; url: string }>;
  readonly biomes: ReadonlyMap<string, BiomeGuideRecord>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const resourceId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value);

export const parseBiomeGuideArtifact = (value: unknown, expected: { edition: string; version: string }) => {
  if (!record(value) || !record(value.source) || !Array.isArray(value.biomes)) {
    throw new Error("Invalid biome guide artifact.");
  }
  const source = value.source;
  if (source.edition !== expected.edition || source.version !== expected.version
    || typeof source.revision !== "string" || !/^[0-9a-f]{40}$/.test(source.revision)
    || typeof source.url !== "string" || !source.url.startsWith("https://")) {
    throw new Error("Biome guide source does not match the selected edition and version.");
  }
  const biomes = new Map<string, BiomeGuideRecord>();
  for (const entry of value.biomes) {
    if (!record(entry) || !resourceId(entry.id) || !resourceId(entry.sourceId)
      || !Number.isFinite(entry.temperature) || !Number.isFinite(entry.downfall)
      || entry.topMaterial !== undefined && !resourceId(entry.topMaterial)
      || entry.seaMaterial !== undefined && !resourceId(entry.seaMaterial)
      || !Array.isArray(entry.spawns) || entry.spawns.some((spawn: unknown) => !record(spawn)
        || !resourceId(spawn.id) || typeof spawn.category !== "string" || !/^[a-z_]+$/.test(spawn.category)
        || !Number.isFinite(spawn.weight) || Number(spawn.weight) <= 0
        || !Number.isInteger(spawn.min) || !Number.isInteger(spawn.max)
        || Number(spawn.min) < 0 || Number(spawn.max) < Number(spawn.min))
      || biomes.has(entry.id)) throw new Error("Invalid or duplicate biome guide record.");
    biomes.set(entry.id, entry as unknown as BiomeGuideRecord);
  }
  return { source: source as unknown as ValidatedBiomeGuideCatalog["source"], biomes } satisfies ValidatedBiomeGuideCatalog;
};
