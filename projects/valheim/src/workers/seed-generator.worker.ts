import { BiomeWorld, type AltBiomeRule } from '../lib/valheim/biome-world.ts'
import type { LocationRecord } from '../types/game-data.ts'
import { generateWorldLocations, type LocationGenerationProfile } from '../lib/valheim/location-generator.ts'
import { pregenerateWorld } from '../lib/valheim/world-pregeneration.ts'
import { ValheimWorldGenerator } from '../lib/valheim/world-generator.ts'
import { createWorldSeedState } from '../lib/valheim/world-seed.ts'
import {
  fingerprintText,
  readSeedMarkers,
  seedMarkerCacheKey,
  writeSeedMarkers,
} from '../lib/valheim/seed-marker-cache.ts'

interface SeedGeneratorRequest {
  seedName: string
  locations: LocationRecord[]
  profile: LocationGenerationProfile
}

interface ShippedSeedFile {
  schemaVersion: number
  generatorVersion: number
  rulesFingerprint: string
  markers: unknown
}

/**
 * Markers precomputed at build time and shipped in the package (only a few
 * seeds). Under a packaged app a missing file makes fetch REJECT rather than
 * return 404, so this must never throw: absence just means "generate".
 */
const readShippedSeed = async (seedName: string): Promise<ShippedSeedFile | null> => {
  const response = await fetch(`/game-data/seeds/${encodeURIComponent(seedName)}.json`).catch(() => null)
  if (!response?.ok) return null
  if (!response.headers.get('content-type')?.includes('application/json')) return null
  return response.json().catch(() => null)
}

self.onmessage = async (event: MessageEvent<SeedGeneratorRequest>) => {
  const { seedName, locations } = event.data
  const profile = event.data.profile === 'legacy' ? 'legacy' : 'current'
  try {
    const rulesResponse = await fetch('/game-data/biome-rules.json')
    if (!rulesResponse.ok) throw new Error('Could not load biome generation rules')
    const { altBiomes } = await rulesResponse.json() as { altBiomes: AltBiomeRule[] }
    const rulesFingerprint = fingerprintText(JSON.stringify({ locations, altBiomes }))
    self.postMessage({ type: 'pregenerated' })
    const cacheKey = seedMarkerCacheKey(seedName, rulesFingerprint, profile)
    const cached = await readSeedMarkers(cacheKey)
    if (cached) {
      self.postMessage({ type: 'complete', markers: cached.markers, profile, source: 'cache' })
      return
    }
    const shipped = profile === 'current' ? await readShippedSeed(seedName) : null
    if (shipped && shipped.schemaVersion === 1 && shipped.generatorVersion === 2 && shipped.rulesFingerprint === rulesFingerprint && Array.isArray(shipped.markers)) {
      self.postMessage({ type: 'complete', markers: shipped.markers, profile: 'current', source: 'shipped' })
      return
    }

    const startedAt = performance.now()
    const generator = new ValheimWorldGenerator(createWorldSeedState(seedName))
    pregenerateWorld(generator)
    if (profile === 'current') generator.biomeWorld = new BiomeWorld(generator, altBiomes)
    let completed = 0
    const total = locations.filter((entry) => (
      entry.enabled && (entry.placement.quantity ?? 0) > 0
    )).length
    const markers = generateWorldLocations(
      generator,
      locations,
      (location, placed, requested) => {
        completed += 1
        self.postMessage({
          type: 'progress',
          completed,
          total,
          prefabName: location.prefabName,
          placed,
          requested,
        })
      },
      profile,
    )
    // Persist before reporting so a window that closes right after still
    // benefits next launch; the write is best-effort and never throws.
    await writeSeedMarkers(cacheKey, {
      schemaVersion: 1,
      markers,
      durationMs: Math.round(performance.now() - startedAt),
    })
    self.postMessage({ type: 'complete', markers, profile, source: 'generated' })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
