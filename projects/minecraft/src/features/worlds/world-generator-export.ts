import { GAME_CUSTOM_FLAT_BLOCKS, GAME_CUSTOM_FLAT_LIMITS, GAME_CUSTOM_WORLD_BIOMES, GAME_CUSTOM_WORLD_EXPORTS,
  gameFlatWorldPreset, gameSingleBiomeWorldPreset } from "../../game-config.ts";
import { createStoredZip } from "../../lib/stored-zip.ts";
import type { WorldRecord } from "./world-types.ts";

export interface WorldGeneratorExportCopy {
  packDescription: string;
  instructions: string;
}

const safeName = (value: string): string => value.normalize("NFKC").trim().replace(/[^\p{L}\p{N}]+/gu, "-")
  .replace(/^-+|-+$/g, "").slice(0, 64).toLocaleLowerCase() || "world";

const hasExactKeys = (settings: Record<string, string | number | boolean>, expected: readonly string[]) => {
  const keys = Object.keys(settings).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

const isLayerHeight = (value: unknown): value is number => Number.isInteger(value)
  && Number(value) >= GAME_CUSTOM_FLAT_LIMITS.minLayerHeight && Number(value) <= GAME_CUSTOM_FLAT_LIMITS.maxLayerHeight;

export const resolveWorldGeneratorExport = (world: Pick<WorldRecord, "edition" | "generation">) => {
  const profile = GAME_CUSTOM_WORLD_EXPORTS.find(candidate => candidate.edition === world.edition
    && candidate.version === world.generation.version && candidate.preset === world.generation.preset) ?? null;
  if (!profile) return null;
  const settings = world.generation.settings;
  if (profile.preset === "single-biome") {
    if (!hasExactKeys(settings, ["biome"]) || typeof settings.biome !== "string") return null;
    const biome = GAME_CUSTOM_WORLD_BIOMES.find(candidate => candidate.id === settings.biome) ?? null;
    return biome ? { kind: "single-biome" as const, profile, biome } : null;
  }
  if (!hasExactKeys(settings, ["baseBlock", "baseHeight", "biome", "features", "lakes", "structures", "surfaceBlock", "surfaceHeight"])) return null;
  if (typeof settings.biome !== "string" || typeof settings.baseBlock !== "string" || typeof settings.surfaceBlock !== "string"
    || typeof settings.structures !== "boolean" || typeof settings.features !== "boolean" || typeof settings.lakes !== "boolean"
    || !isLayerHeight(settings.baseHeight) || !isLayerHeight(settings.surfaceHeight)
    || settings.baseHeight + settings.surfaceHeight > GAME_CUSTOM_FLAT_LIMITS.maxConfiguredHeight) return null;
  const biome = GAME_CUSTOM_WORLD_BIOMES.find(candidate => candidate.id === world.generation.settings.biome) ?? null;
  const baseBlock = GAME_CUSTOM_FLAT_BLOCKS.find(candidate => candidate.id === settings.baseBlock) ?? null;
  const surfaceBlock = GAME_CUSTOM_FLAT_BLOCKS.find(candidate => candidate.id === settings.surfaceBlock) ?? null;
  return biome && baseBlock && surfaceBlock ? { kind: "flat" as const, profile, biome, baseBlock, surfaceBlock,
    options: { biome: biome.id, baseBlock: baseBlock.id, baseHeight: settings.baseHeight,
      surfaceBlock: surfaceBlock.id, surfaceHeight: settings.surfaceHeight,
      structures: settings.structures, features: settings.features, lakes: settings.lakes } } : null;
};

/** Creates a local generator datapack. It does not create chunks, open saves, or embed the seed as terrain. */
export const createWorldGeneratorExport = (world: Pick<WorldRecord, "name" | "edition" | "generation">,
  copy: WorldGeneratorExportCopy) => {
  const resolved = resolveWorldGeneratorExport(world);
  if (!resolved || !copy.packDescription.trim() || !copy.instructions.trim())
    throw new Error("World generator export is unavailable for this exact context.");
  const preset = resolved.kind === "single-biome"
    ? gameSingleBiomeWorldPreset(resolved.biome.id) : gameFlatWorldPreset(resolved.options);
  const presetName = resolved.kind === "single-biome" ? "single_biome_surface" : "flat";
  const packMetadata = { pack: { pack_format: resolved.profile.packFormat, description: copy.packDescription.trim() } };
  const files = [
    { path: "pack.mcmeta", data: `${JSON.stringify(packMetadata, null, 2)}\n` },
    { path: `data/minecraft/worldgen/world_preset/${presetName}.json`, data: `${JSON.stringify(preset, null, 2)}\n` },
    { path: "README.txt", data: `${copy.instructions.trim()}\n` },
  ] as const;
  return {
    bytes: createStoredZip(files),
    filename: `${safeName(world.name)}-${safeName(world.edition)}-${safeName(world.generation.version)}-${safeName(resolved.kind)}.zip`,
    biome: resolved.biome,
    profile: resolved.profile,
    kind: resolved.kind,
  };
};

export const downloadWorldGeneratorExport = (world: Pick<WorldRecord, "name" | "edition" | "generation">,
  copy: WorldGeneratorExportCopy) => {
  const output = createWorldGeneratorExport(world, copy);
  const blob = new Blob([output.bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url; link.download = output.filename; link.rel = "noopener";
    document.body.append(link); link.click(); link.remove();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  return { ...output, blob };
};
