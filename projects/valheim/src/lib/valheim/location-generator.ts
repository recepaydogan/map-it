import { BIOME_FLAGS } from './biome-world.ts'
import type { LocationRecord } from '../../types/game-data.ts'
import { getStableHashCode } from './stable-hash.ts'
import { UnityRandom } from './unity-random.ts'
import { ValheimWorldGenerator, type ValheimBiome } from './world-generator.ts'

export interface GeneratedLocationMarker {
  id: string
  locationId: string
  prefabName: string
  x: number
  y: number
  height: number
  zoneX: number
  zoneY: number
  source?: 'seed' | 'save' | 'observed'
  placed?: boolean
}

export type LocationGenerationProfile = 'current' | 'legacy'

const BIOME_NAMES: Record<string, ValheimBiome> = {
  Ashlands: 'ashlands',
  'Black Forest': 'black-forest',
  'Deep North': 'deep-north',
  Meadows: 'meadows',
  Mistlands: 'mistlands',
  Mountain: 'mountain',
  Ocean: 'ocean',
  Plains: 'plains',
  Swamp: 'swamp',
}

const numberRule = (value: number | undefined, fallback = 0) => value ?? fallback
const enabledRule = (value: number | undefined) => value === 1
const zoneKey = (x: number, y: number) => `${x},${y}`
const vector2Magnitude = (x: number, y: number) => Math.fround(Math.sqrt(
  Math.fround(Math.fround(x * x) + Math.fround(y * y)),
))
const vector3Magnitude = (x: number, y: number, z: number) => Math.fround(Math.sqrt(
  Math.fround(Math.fround(Math.fround(x * x) + Math.fround(y * y)) + Math.fround(z * z)),
))
const distance = (first: GeneratedLocationMarker, x: number, y: number, height: number) =>
  vector3Magnitude(first.x - x, first.height - height, first.y - y)

function randomZone(random: UnityRandom, range: number): { x: number; y: number } {
  const zoneRange = Math.trunc(range) / 64 | 0
  while (true) {
    const zone = {
      x: random.intRange(-zoneRange, zoneRange),
      y: random.intRange(-zoneRange, zoneRange),
    }
    if (vector2Magnitude(zone.x * 64, zone.y * 64) < 10_000) return zone
  }
}

function hasLocationInRange(
  markers: readonly GeneratedLocationMarker[],
  locationsById: ReadonlyMap<string, LocationRecord>,
  current: LocationRecord,
  x: number,
  y: number,
  height: number,
  radius: number,
  maximumGroup: boolean,
): boolean {
  const currentGroup = maximumGroup
    ? current.placement.groupMax ?? ''
    : current.placement.group ?? ''

  return markers.some((marker) => {
    const existing = locationsById.get(marker.locationId)
    if (!existing) return false
    const existingGroup = maximumGroup
      ? existing.placement.groupMax ?? ''
      : existing.placement.group ?? ''
    const matches =
      marker.prefabName === current.prefabName ||
      (currentGroup.length > 0 && currentGroup === existingGroup)
    return matches && distance(marker, x, y, height) < radius
  })
}

function surroundingVegetation(
  generator: ValheimWorldGenerator,
  x: number,
  y: number,
  location: LocationRecord,
): number {
  const layers = numberRule(location.placement.surroundCheckLayers, 2)
  const maxDistance = numberRule(location.placement.surroundCheckDistance, 20)
  let total = 0
  for (let layer = 0; layer < layers; layer += 1) {
    const ringDistance = ((layer + 1) / layers) * maxDistance
    for (let sample = 0; sample < 6; sample += 1) {
      const angle = Math.fround((sample / 6) * Math.fround(Math.PI * 2))
      const sampleX = Math.fround(x + Math.fround(Math.sin(angle)) * ringDistance)
      const sampleY = Math.fround(y + Math.fround(Math.cos(angle)) * ringDistance)
      const weight = (maxDistance - ringDistance) / (maxDistance * 2)
      total += generator.getHeightAndVegetation(sampleX, sampleY).vegetation * weight
    }
  }
  return Math.fround(total)
}

export function generateWorldLocations(
  generator: ValheimWorldGenerator,
  sourceLocations: readonly LocationRecord[],
  onLocationGenerated?: (
    location: LocationRecord,
    placed: number,
    requested: number,
    markers: GeneratedLocationMarker[],
  ) => void,
  profile: LocationGenerationProfile = 'current',
): GeneratedLocationMarker[] {
  const locations = sourceLocations
    .filter((location) => location.enabled && numberRule(location.placement.quantity) > 0)
    .map((location, index) => ({ location, index }))
    .sort((first, second) =>
      numberRule(second.location.placement.prioritized) -
        numberRule(first.location.placement.prioritized) ||
      first.index - second.index)
    .map(({ location }) => location)
  const locationsById = new Map(sourceLocations.map((location) => [location.id, location]))
  const markers: GeneratedLocationMarker[] = []
  const occupiedZones = new Map<string, GeneratedLocationMarker>()

  for (const location of locations) {
    const markerStart = markers.length
    const requested = numberRule(location.placement.quantity)
    const attempts = enabledRule(location.placement.prioritized)
      ? (profile === 'legacy' ? 200_000 : 60_000)
      : (profile === 'legacy' ? 100_000 : 12_000)
    const random = new UnityRandom(
      (generator.seed.seed + getStableHashCode(location.prefabName)) | 0,
    )
    const maxRadius = Math.max(
      numberRule(location.placement.exteriorRadius),
      numberRule(location.placement.interiorRadius),
    )
    const mask = location.placement.biome ?? (location.placement.biomes ?? []).reduce(
      (value, name) => value | (BIOME_FLAGS[BIOME_NAMES[name]] ?? 0), 0)
    const allowedBiomes = (location.placement.biomes ?? [])
      .map((name) => BIOME_NAMES[name])
      .filter(Boolean)
    const surroundValues: number[] = []
    let placed = markers.filter((marker) => marker.prefabName === location.prefabName).length
    let maxRange = enabledRule(location.placement.centerFirst)
      ? numberRule(location.placement.minDistance)
      : 10_000

    if (!enabledRule(location.placement.unique) || placed === 0) {
      for (let attempt = 0; attempt < attempts && placed < requested; attempt += 1) {
        const selectedZone = profile === 'legacy' || enabledRule(location.placement.centerFirst)
          ? randomZone(random, maxRange)
          : generator.biomeWorld?.randomZone(random, mask, numberRule(location.placement.minAltitude) >= 0)
        if (!selectedZone) continue
        if (enabledRule(location.placement.centerFirst)) maxRange += 1
        if (occupiedZones.has(zoneKey(selectedZone.x, selectedZone.y))) continue

        const zoneX = selectedZone.x * 64
        const zoneY = selectedZone.y * 64
        const area = generator.getBiomeArea(zoneX, zoneY)
        const areaFlag = area === 'median' ? 2 : 1
        if ((numberRule(location.placement.biomeArea, 3) & areaFlag) === 0) continue

        for (let pointAttempt = 0; pointAttempt < (profile === 'legacy' ? 100 : 6); pointAttempt += 1) {
          const x = Math.fround(
            zoneX + random.floatRange(-32 + maxRadius, 32 - maxRadius),
          )
          const y = Math.fround(
            zoneY + random.floatRange(-32 + maxRadius, 32 - maxRadius),
          )
          const centerDistance = vector2Magnitude(x, y)
          const minimumDistance = numberRule(location.placement.minDistance)
          const maximumDistance = numberRule(location.placement.maxDistance)
          if (minimumDistance !== 0 && centerDistance < minimumDistance) continue
          if (maximumDistance !== 0 && centerDistance > maximumDistance) continue

          const biome = generator.getBiome(x, y)
          if (allowedBiomes.length > 0 && !allowedBiomes.includes(biome)) continue

          const terrain = generator.getHeightAndVegetation(x, y)
          const altitude = terrain.height - 30
          if (
            altitude < numberRule(location.placement.minAltitude, -1_000) ||
            altitude > numberRule(location.placement.maxAltitude, 1_000)
          ) continue

          if (enabledRule(location.placement.inForest)) {
            const forest = generator.getForestFactor(x, y)
            if (
              forest < numberRule(location.placement.forestTresholdMin) ||
              forest > numberRule(location.placement.forestTresholdMax, 1)
            ) continue
          }

          const minimumCenterDistance = numberRule(location.placement.minDistanceFromCenter)
          const maximumCenterDistance = numberRule(location.placement.maxDistanceFromCenter)
          if (minimumCenterDistance > 0 && centerDistance < minimumCenterDistance) continue
          if (maximumCenterDistance > 0 && centerDistance > maximumCenterDistance) continue

          const terrainDelta = generator.getTerrainDelta(
            x,
            y,
            numberRule(location.placement.exteriorRadius),
            random,
          )
          if (
            terrainDelta > numberRule(location.placement.maxTerrainDelta, 2) ||
            terrainDelta < numberRule(location.placement.minTerrainDelta)
          ) continue

          const minimumSimilarDistance = numberRule(location.placement.minDistanceFromSimilar)
          if (
            minimumSimilarDistance > 0 &&
            hasLocationInRange(
              markers,
              locationsById,
              location,
              x,
              y,
              terrain.height,
              minimumSimilarDistance,
              false,
            )
          ) continue

          const maximumSimilarDistance = numberRule(location.placement.maxDistanceFromSimilar)
          if (
            maximumSimilarDistance > 0 &&
            !hasLocationInRange(
              markers,
              locationsById,
              location,
              x,
              y,
              terrain.height,
              maximumSimilarDistance,
              true,
            )
          ) continue

          if (
            numberRule(location.placement.minimumVegetation) > 0 &&
            terrain.vegetation <= numberRule(location.placement.minimumVegetation)
          ) continue
          if (
            numberRule(location.placement.maximumVegetation, 1) < 1 &&
            terrain.vegetation >= numberRule(location.placement.maximumVegetation, 1)
          ) continue

          if (profile === 'current') {
            const alts = generator.biomeWorld?.altBiomesAt(x, y) ?? []
            if (location.placement.altBiomeParent && !alts.some((alt) => alt.name === location.placement.altBiomeParent)) continue
            if (alts.some((alt) => alt.blockLocationNames.includes(location.placement.name ?? ''))) continue
          }
          if (enabledRule(location.placement.surroundCheckVegetation)) {
            const value = surroundingVegetation(generator, x, y, location)
            surroundValues.push(value)
            if (surroundValues.length < 10) continue
            const maximum = Math.max(...surroundValues)
            const average = surroundValues.reduce((sum, entry) => sum + entry, 0) /
              surroundValues.length
            const cutoff = average +
              (maximum - average) *
                numberRule(location.placement.surroundBetterThanAverage)
            if (value < cutoff) continue
          }

          const registeredZoneX = Math.floor((x + 32) / 64)
          const registeredZoneY = Math.floor((y + 32) / 64)
          const marker: GeneratedLocationMarker = {
            id: `${location.id}-${placed}`,
            locationId: location.id,
            prefabName: location.prefabName,
            x,
            y,
            height: terrain.height,
            zoneX: registeredZoneX,
            zoneY: registeredZoneY,
          }
          const registeredKey = zoneKey(registeredZoneX, registeredZoneY)
          if (!occupiedZones.has(registeredKey)) {
            occupiedZones.set(registeredKey, marker)
            markers.push(marker)
          }
          placed += 1
          break
        }
      }
    }
    onLocationGenerated?.(
      location,
      placed,
      requested,
      markers.slice(markerStart),
    )
  }

  return markers
}
