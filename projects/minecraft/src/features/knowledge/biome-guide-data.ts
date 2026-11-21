import { GAME_GUIDE_BIOME_FAMILIES } from "../../game-config.ts";
import type { KnowledgeCatalogs } from "./knowledge-catalogs.ts";
import type { KnowledgeSubjectRef } from "./mechanics-types.ts";

export interface BiomeGuideEntry {
  readonly id: string;
  readonly family: (typeof GAME_GUIDE_BIOME_FAMILIES)[number]["id"];
  readonly dimension: "overworld" | "nether" | "end";
  readonly temperature: number;
  readonly downfall: number;
  readonly precipitation?: boolean;
  readonly topMaterial?: string;
  readonly seaMaterial?: string;
  readonly spawns: readonly KnowledgeSubjectRef[];
}

const climatePattern = /^Temperature (-?\d+(?:\.\d+)?); downfall (-?\d+(?:\.\d+)?). Has (no )?precipitation\./;
const biomeFamily = (id: string) => GAME_GUIDE_BIOME_FAMILIES.find(group =>
  (group.biomeIds as readonly string[]).includes(id.slice(id.indexOf(":") + 1)));

export const createBiomeGuideIndex = (catalogs: KnowledgeCatalogs, edition: string) => {
  const entries = new Map<string, BiomeGuideEntry>();
  if (edition === "bedrock") {
    for (const biome of catalogs.biomes?.biomes.values() ?? []) {
      const family = biomeFamily(biome.id);
      if (!family) continue;
      entries.set(biome.id, { id: biome.id, family: family.id,
        dimension: family.id === "nether" ? "nether" : family.id === "end" ? "end" : "overworld",
        temperature: biome.temperature, downfall: biome.downfall,
        topMaterial: biome.topMaterial, seaMaterial: biome.seaMaterial,
        spawns: biome.spawns.map(spawn => ({ kind: "entity", id: spawn.id,
          spawn: { category: spawn.category, weight: spawn.weight,
            group: { min: spawn.min, max: spawn.max } } })) });
    }
    return entries;
  }
  for (const subject of catalogs.mechanics?.subjects ?? []) {
    if (subject.kind !== "biome") continue;
    const family = biomeFamily(subject.id);
    if (!family) continue;
    const climate = climatePattern.exec(subject.text.en?.description ?? "");
    if (!climate) throw new Error(`Biome climate is missing: ${subject.id}`);
    const generation = catalogs.mechanics?.mechanics.find(mechanic => mechanic.kind === "generation"
      && mechanic.subject.kind === "biome" && mechanic.subject.id === subject.id);
    entries.set(subject.id, { id: subject.id, family: family.id,
      dimension: family.id === "nether" ? "nether" : family.id === "end" ? "end" : "overworld",
      temperature: Number(climate[1]), downfall: Number(climate[2]), precipitation: climate[3] !== "no ",
      spawns: generation?.related.filter(ref => ref.kind === "entity" && ref.spawn) ?? [] });
  }
  return entries;
};
