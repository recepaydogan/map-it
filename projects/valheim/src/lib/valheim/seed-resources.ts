import { BIOME_FLAGS } from './biome-world.ts'
import { getStableHashCode } from './stable-hash.ts'
import { UnityRandom } from './unity-random.ts'
import type { ValheimWorldGenerator } from './world-generator.ts'
import type { ResourceStateIndex } from './resource-state.ts'

export interface SeedResourcePoint { x: number; z: number }
/** Packed x,z pairs avoid millions of JS objects crossing the worker boundary. */
export type SeedResourcePoints = Record<string, Float32Array>

export function packResourcePoints(points: readonly SeedResourcePoint[]): Float32Array {
  const result = new Float32Array(points.length * 2)
  points.forEach((point, index) => { result[index * 2] = point.x; result[index * 2 + 1] = point.z })
  return result
}

export function unpackResourcePoints(points: Float32Array): SeedResourcePoint[] {
  const result: SeedResourcePoint[] = []
  for (let index = 0; index < points.length; index += 2) result.push({ x: points[index], z: points[index + 1] })
  return result
}

export interface ResourceVegetationRule {
  name: string
  prefabName: string
  materials: string[]
  enable: number
  biome: number
  biomeArea: number
  min: number
  max: number
  forcePlacement: number
  groupSizeMin: number
  groupSizeMax: number
  groupRadius: number
  scaleMin: number
  scaleMax: number
  randTilt: number
  chanceToUseGroundTilt: number
  minAltitude: number
  maxAltitude: number
  minTilt: number
  maxTilt: number
  terrainDeltaRadius: number
  minTerrainDelta: number
  maxTerrainDelta: number
  minVegetation: number
  maxVegetation: number
  minOceanDepth: number
  maxOceanDepth: number
  minDistanceFromCenter: number
  maxDistanceFromCenter: number
  inForest: number
  forestTresholdMin: number
  forestTresholdMax: number
  altBiomeParent?: string
}

const f32 = Math.fround
const ZONE_SIZE = 64

/** ZoneSystem seeds by the GameObject prefab name, never the vegetation label. */
export const resourceZoneSeed = (seed: number, zoneX: number, zoneZ: number, prefabName: string): number =>
  (seed + Math.imul(zoneX, 4271) + Math.imul(zoneZ, 9187) + getStableHashCode(prefabName)) | 0

/**
 * Terrain-based outdoor predictions, not a replay of Unity physics. Colliders,
 * location clear areas and player changes can remove these candidate sources.
 * Keep RNG rolls in PlaceVegetation order, including successful ground tilt.
 */
export function generateSeedResources(
  generator: ValheimWorldGenerator,
  rules: readonly ResourceVegetationRule[],
  options: { radius?: number; onProgress?: (completed: number, total: number) => void } = {},
): SeedResourcePoints {
  const radius = options.radius ?? 10_000
  const zoneLimit = Math.ceil(radius / ZONE_SIZE)
  const active = rules.filter((rule) => rule.enable === 1)
  const byPrefab = new Map<string, { materials: Set<string>; points: Map<string, SeedResourcePoint> }>()
  const prepared = active.map((rule) => {
    let target = byPrefab.get(rule.prefabName)
    if (!target) {
      target = { materials: new Set(), points: new Map() }
      byPrefab.set(rule.prefabName, target)
    }
    for (const key of rule.materials) target.materials.add(key.toLowerCase())
    return { rule, target, minNormal: Math.cos(rule.maxTilt * Math.PI / 180), maxNormal: Math.cos(rule.minTilt * Math.PI / 180) }
  })
  const width = zoneLimit * 2 + 1
  for (let zoneZ = -zoneLimit; zoneZ <= zoneLimit; zoneZ++) {
    const centerZ = zoneZ * ZONE_SIZE
    for (let zoneX = -zoneLimit; zoneX <= zoneLimit; zoneX++) {
      const centerX = zoneX * ZONE_SIZE
      if (Math.hypot(centerX, centerZ) > radius + ZONE_SIZE) continue
      // Heightmap.HaveBiome and GetBiomeArea use the four heightmap corners.
      const corners = [[-32, -32], [32, -32], [-32, 32], [32, 32]].map(([dx, dz]) => ({
        x: centerX + dx, z: centerZ + dz,
        biome: generator.getBiome(centerX + dx, centerZ + dz),
      }))
      const zoneMask = corners.reduce((mask, corner) => mask | BIOME_FLAGS[corner.biome], 0)
      const areaFlag = corners.every((corner) => corner.biome === corners[0].biome) ? 2 : 1
      const flags = [...new Set(corners.map((corner) => BIOME_FLAGS[corner.biome]))].sort((a, b) => a - b)
      const pointBiome = (x: number, z: number) => {
        if (areaFlag === 2) return zoneMask
        // Heightmap.GetBiome chooses the largest accumulated corner weight.
        const tx = f32((x - centerX + 32) / 64), tz = f32((z - centerZ + 32) / 64)
        const weights = flags.map(() => 0)
        corners.forEach((corner, index) => {
          const dx = f32(tx - (index % 2)), dz = f32(tz - Math.floor(index / 2))
          const distance = f32(Math.sqrt(f32(dx * dx + dz * dz)))
          const weight = f32(1.4140000343322754 - distance)
          const slot = flags.indexOf(BIOME_FLAGS[corner.biome])
          weights[slot] = f32(weights[slot] + f32(weight * weight * weight))
        })
        return flags[weights.indexOf(Math.max(...weights))]
      }
      // Ocean depth is interpolated across the zone's corner depths by Heightmap.
      let depths: number[] | null = null
      const oceanDepth = (x: number, z: number) => {
        depths ??= corners.map((corner) => Math.max(0, 30 - generator.getHeightAndVegetation(corner.x, corner.z).height))
        const tx = (x - centerX + 32) / 64, tz = (z - centerZ + 32) / 64
        return (depths[0] * (1 - tx) + depths[1] * tx) * (1 - tz) + (depths[2] * (1 - tx) + depths[3] * tx) * tz
      }
      for (const { rule, target, minNormal, maxNormal } of prepared) {
        if (!(zoneMask & rule.biome) || !(areaFlag & rule.biomeArea)) continue
        const random = new UnityRandom(resourceZoneSeed(generator.seed.seed, zoneX, zoneZ, rule.prefabName))
        const requested = rule.max < 1 ? (random.value() <= rule.max ? 1 : 0) : random.intRange(Math.trunc(rule.min), Math.trunc(rule.max) + 1)
        const attempts = requested * (rule.forcePlacement ? 50 : 1)
        let placed = 0
        const surround = 32 - rule.groupRadius
        for (let attempt = 0; attempt < attempts && placed < requested; attempt++) {
          const gx = random.floatRange(centerX - surround, centerX + surround)
          const gz = random.floatRange(centerZ - surround, centerZ + surround)
          const alts = generator.biomeWorld?.altBiomesAt(gx, gz) ?? []
          if ((rule.altBiomeParent && !alts.some((alt) => alt.name === rule.altBiomeParent)) ||
            alts.some((alt) => alt.blockVegetationNames.includes(rule.name))) continue
          const size = random.intRange(rule.groupSizeMin, rule.groupSizeMax + 1)
          let groupPlaced = false
          for (let member = 0; member < size; member++) {
            let x = gx, z = gz
            if (member > 0) {
              const angle = f32(f32(random.value() * f32(Math.PI)) * 2)
              const distance = random.floatRange(0, rule.groupRadius)
              x = f32(gx + f32(f32(Math.sin(angle)) * distance))
              z = f32(gz + f32(f32(Math.cos(angle)) * distance))
            }
            random.intRange(0, 360)
            random.floatRange(rule.scaleMin, rule.scaleMax)
            random.floatRange(-rule.randTilt, rule.randTilt)
            random.floatRange(-rule.randTilt, rule.randTilt)
            if (!(pointBiome(x, z) & rule.biome)) continue
            const terrain = generator.getHeightAndVegetation(x, z)
            const altitude = terrain.height - 30
            if (altitude < rule.minAltitude || altitude > rule.maxAltitude) continue
            if (rule.minVegetation !== rule.maxVegetation &&
              (terrain.vegetation < rule.minVegetation || terrain.vegetation > rule.maxVegetation)) continue
            if (rule.minOceanDepth !== rule.maxOceanDepth) {
              const depth = oceanDepth(x, z)
              if (depth < rule.minOceanDepth || depth > rule.maxOceanDepth) continue
            }
            if (rule.minTilt > 0 || rule.maxTilt < 90) {
              const dx = (generator.getHeightAndVegetation(x + 1, z).height - generator.getHeightAndVegetation(x - 1, z).height) / 2
              const dz = (generator.getHeightAndVegetation(x, z + 1).height - generator.getHeightAndVegetation(x, z - 1).height) / 2
              const normalY = 1 / Math.hypot(dx, dz, 1)
              if (normalY < minNormal || normalY > maxNormal) continue
            }
            if (rule.terrainDeltaRadius > 0) {
              const delta = generator.getTerrainDelta(x, z, rule.terrainDeltaRadius, random)
              if (delta < rule.minTerrainDelta || delta > rule.maxTerrainDelta) continue
            }
            const distance = Math.hypot(x, z)
            if ((rule.minDistanceFromCenter > 0 && distance < rule.minDistanceFromCenter) ||
              (rule.maxDistanceFromCenter > 0 && distance > rule.maxDistanceFromCenter)) continue
            if (rule.inForest) {
              const forest = generator.getForestFactor(x, z)
              if (forest < rule.forestTresholdMin || forest > rule.forestTresholdMax) continue
            }
            if (rule.chanceToUseGroundTilt > 0) random.value()
            target.points.set(`${x}:${z}`, { x, z })
            groupPlaced = true
          }
          if (groupPlaced) placed++
        }
      }
    }
    options.onProgress?.(zoneZ + zoneLimit + 1, width)
  }
  const sourcesByMaterial = new Map<string, Array<Map<string, SeedResourcePoint>>>()
  for (const { materials, points } of byPrefab.values()) {
    for (const material of materials) {
      const sources = sourcesByMaterial.get(material) ?? []
      sources.push(points)
      sourcesByMaterial.set(material, sources)
    }
  }
  const result: SeedResourcePoints = {}
  for (const [material, sources] of sourcesByMaterial) {
    const packed = new Float32Array(sources.reduce((total, source) => total + source.size * 2, 0))
    let offset = 0
    for (const source of sources) for (const point of source.values()) {
      packed[offset++] = point.x
      packed[offset++] = point.z
    }
    result[material] = packed
  }
  return result
}

export interface MapResourceSources {
  options: Array<{ itemPrefab: string; count: number; predictedCount: number }>
  pointsForItem(itemPrefab: string): SeedResourcePoint[]
}

/** Seed predictions belong to remote worlds without a readable local save. */
export function shouldPredictServerResources(
  world: { databasePath: string | null } | null,
  isServer: boolean | null | undefined,
): boolean {
  return world?.databasePath === null && isServer === false
}

/** Generated save zones are authoritative, including picked or destroyed nodes. */
export function mergeResourceSources(saved: ResourceStateIndex | null, predicted: SeedResourcePoints): MapResourceSources {
  const predictedByKey = new Map<string, Float32Array>()
  for (const [key, points] of Object.entries(predicted)) {
    if (!saved) { predictedByKey.set(key.toLowerCase(), points); continue }
    const kept: number[] = []
    for (let index = 0; index < points.length; index += 2) {
      if (!saved.zoneGenerated(points[index], points[index + 1])) kept.push(points[index], points[index + 1])
    }
    predictedByKey.set(key.toLowerCase(), Float32Array.from(kept))
  }
  const counts = new Map((saved?.availableMaterials() ?? []).map((entry) => [entry.itemPrefab.toLowerCase(), entry.count]))
  for (const [key, points] of predictedByKey) counts.set(key, (counts.get(key) ?? 0) + points.length / 2)
  return {
    options: [...counts].filter(([, count]) => count > 0).map(([itemPrefab, count]) => ({
      itemPrefab, count, predictedCount: (predictedByKey.get(itemPrefab)?.length ?? 0) / 2,
    })),
    pointsForItem: (key) => [
      ...(saved?.nodesForItem(key) ?? []).filter((point) => point.status === 'present' || point.status === 'partial')
        .map((point) => ({ x: point.x, z: point.z })),
      ...unpackResourcePoints(predictedByKey.get(key.toLowerCase()) ?? new Float32Array()),
    ],
  }
}
