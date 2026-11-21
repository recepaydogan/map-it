import { requireNumericSeed } from "../worlds/seed-value.ts";
import { createWasmBiomeEngine, type WasmBiomeEngine } from "./wasm-biome-engine.ts";
import type { SeedSearchPoint, SeedSearchRequirement, SeedSearchWork, SeedSearchWorkResult } from "./seed-search-types.ts";

const MAX_CANDIDATES = 256;
const MAX_REQUIREMENTS = 4;
const MAX_QUERIES = 65_536;
const MAX_BIOME_SAMPLES = 65_536;

const integer = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;

export const validateSeedSearchRequest = (candidates: readonly string[], requirements: readonly SeedSearchRequirement[]) => {
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > MAX_CANDIDATES ||
    candidates.some(seed => { try { return requireNumericSeed(seed) !== seed; } catch { return true; } }) || new Set(candidates).size !== candidates.length)
    throw new Error("Invalid seed search candidates");
  if (!Array.isArray(requirements) || !requirements.length || requirements.length > MAX_REQUIREMENTS ||
    requirements.some(entry => !entry || typeof entry.type !== "string" || !entry.type || entry.type.length > 128 || !integer(entry.radius, 128, 4096)
      || (entry.kind === "biome" && (!Array.isArray(entry.biomeIds) || !entry.biomeIds.length || entry.biomeIds.length > 32
        || entry.biomeIds.some((id: number) => !integer(id, 0, 65_535)) || new Set(entry.biomeIds).size !== entry.biomeIds.length
        || ![16, 64, 256].includes(entry.scale) || !integer(entry.blockY, -2048, 2048)
        || !integer(entry.innerRadius, 0, entry.radius - 1) || !integer(entry.minSectors, 1, 8)))
      || (entry.kind !== undefined && entry.kind !== "structure" && entry.kind !== "biome")) ||
    new Set(requirements.map(entry => entry.type)).size !== requirements.length) throw new Error("Invalid seed search requirements");
};

export const planSeedSearchRegions = (radius: number, regionSize: number) => {
  if (!integer(radius, 128, 4096) || !integer(regionSize, 1, 1024)) throw new Error("Invalid seed search region plan");
  const span = regionSize * 16, first = Math.floor(-radius / span), last = Math.floor(radius / span);
  if ((last - first + 1) ** 2 > MAX_QUERIES) throw new Error("Seed search region plan exceeds its query budget");
  const regions: { regionX: number; regionZ: number; distance: number }[] = [];
  for (let regionZ = first; regionZ <= last; regionZ++) for (let regionX = first; regionX <= last; regionX++) {
    const centerX = (regionX + .5) * span, centerZ = (regionZ + .5) * span;
    regions.push({ regionX, regionZ, distance: centerX * centerX + centerZ * centerZ });
  }
  return regions.sort((left, right) => left.distance - right.distance || left.regionZ - right.regionZ || left.regionX - right.regionX)
    .map(({ regionX, regionZ }) => ({ regionX, regionZ }));
};

type SearchEngine = Pick<WasmBiomeEngine, "seed" | "regionSize" | "structure" | "generate">;

const biomeRequirementPoint = (engine: SearchEngine, requirement: Extract<SeedSearchRequirement, { kind: "biome" }>) => {
  const first = Math.floor(-requirement.radius / requirement.scale);
  const last = Math.ceil(requirement.radius / requirement.scale);
  const side = last - first + 1;
  const accepted = new Set(requirement.biomeIds), sectors = new Set<number>();
  let nearest: { x: number; z: number; biomeId: number } | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let rowStart = 0; rowStart < side; rowStart += 128) for (let columnStart = 0; columnStart < side; columnStart += 128) {
    const width = Math.min(128, side - columnStart), height = Math.min(128, side - rowStart);
    const ids = engine.generate({ scale: requirement.scale, cellX: first + columnStart, cellZ: first + rowStart,
      width, height, blockY: requirement.blockY });
    if (ids.length !== width * height) throw new Error("Biome engine returned an invalid seed-search sample grid");
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
      const biomeId = ids[row * width + column];
      if (!accepted.has(biomeId)) continue;
      const x = (first + columnStart + column) * requirement.scale;
      const z = (first + rowStart + row) * requirement.scale;
      const distance = x * x + z * z;
      if (distance > requirement.radius ** 2 || distance < requirement.innerRadius ** 2) continue;
      const angle = Math.atan2(z, x) + Math.PI;
      sectors.add(Math.min(7, Math.floor(angle / (Math.PI * 2) * 8)));
      if (distance < nearestDistance) { nearestDistance = distance; nearest = { x, z, biomeId }; }
    }
  }
  return nearest && sectors.size >= requirement.minSectors ? {
    kind: "biome" as const, type: requirement.type, x: nearest.x, y: null, z: nearest.z,
    biomeViable: true as const, terrainVerified: false as const, biomeId: nearest.biomeId,
    matchedSectors: sectors.size,
  } : null;
};

export const evaluateSeedCandidates = (engine: SearchEngine, profile: string, candidates: readonly string[], dimension: -1 | 0 | 1,
  requirements: readonly SeedSearchRequirement[]): SeedSearchWorkResult => {
  validateSeedSearchRequest(candidates, requirements);
  engine.seed(profile, candidates[0], dimension);
  const capabilities = requirements.filter(requirement => requirement.kind !== "biome")
    .map(requirement => ({ requirement, regionSize: engine.regionSize(requirement.type) }));
  const unsupported = capabilities.filter(entry => entry.regionSize === null).map(entry => entry.requirement.type);
  if (unsupported.length) return { kind: "seed-search", status: "unsupported", evaluated: 0, unsupported, match: null };
  let queriesPerSeed = 0;
  const structurePlans = new Map(capabilities.map(({ requirement, regionSize }) => {
    const span = regionSize! * 16, side = Math.floor(requirement.radius / span) - Math.floor(-requirement.radius / span) + 1;
    queriesPerSeed += side * side;
    if (queriesPerSeed * candidates.length > MAX_QUERIES) throw new Error("Seed search exceeds the bounded query budget");
    return [requirement.type, planSeedSearchRegions(requirement.radius, regionSize!)] as const;
  }));
  const biomeSamplesPerSeed = requirements.filter((requirement): requirement is Extract<SeedSearchRequirement, { kind: "biome" }> => requirement.kind === "biome")
    .reduce((total, requirement) => total + (Math.ceil(requirement.radius / requirement.scale) - Math.floor(-requirement.radius / requirement.scale) + 1) ** 2, 0);
  if (biomeSamplesPerSeed * candidates.length > MAX_BIOME_SAMPLES) throw new Error("Seed search exceeds the bounded biome sample budget");
  for (let index = 0; index < candidates.length; index++) {
    const seed = candidates[index]; engine.seed(profile, seed, dimension);
    const points: SeedSearchPoint[] = [];
    for (const requirement of requirements) {
      if (requirement.kind === "biome") {
        const point = biomeRequirementPoint(engine, requirement);
        if (!point) break;
        points.push(point);
        continue;
      }
      const regions = structurePlans.get(requirement.type)!;
      let nearest: SeedSearchPoint | null = null, nearestDistance = Number.POSITIVE_INFINITY;
      for (const region of regions) {
        const candidate = engine.structure(requirement.type, region.regionX, region.regionZ);
        if (!candidate?.biomeViable) continue;
        const distance = candidate.x * candidate.x + candidate.z * candidate.z;
        if (distance > requirement.radius * requirement.radius || distance >= nearestDistance) continue;
        nearestDistance = distance; nearest = { kind: "structure", type: requirement.type, ...candidate, biomeViable: true };
      }
      if (!nearest) break;
      points.push(nearest);
    }
    if (points.length === requirements.length) return { kind: "seed-search", status: "match", evaluated: index + 1,
      unsupported: [], match: { seed, points } };
  }
  return { kind: "seed-search", status: "none", evaluated: candidates.length, unsupported: [], match: null };
};

/** Searches verified engine candidates around coordinate origin; it does not calculate player spawn or terrain geometry. */
export const runSeedSearchWork = async (work: SeedSearchWork): Promise<SeedSearchWorkResult> => {
  if (!work || work.kind !== "seed-search" || !Array.isArray(work.artifact?.config?.structures) || !work.artifact.config.structures.length ||
    !work.artifact.config.profiles.includes(work.profile) || ![-1, 0, 1].includes(work.dimension)) throw new Error("Invalid seed search work");
  validateSeedSearchRequest(work.candidates, work.requirements);
  if (work.requirements.some(entry => entry.kind !== "biome" && !work.artifact.config.structures.includes(entry.type)))
    throw new Error("Unknown seed search structure type");
  const engine = await createWasmBiomeEngine(work.artifact.bytes, work.artifact.config);
  try { return evaluateSeedCandidates(engine, work.profile, work.candidates, work.dimension, work.requirements); }
  finally { engine.dispose(); }
};
