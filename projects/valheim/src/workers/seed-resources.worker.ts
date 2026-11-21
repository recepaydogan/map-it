import { BiomeWorld, type AltBiomeRule } from '../lib/valheim/biome-world.ts'
import { generateSeedResources, type ResourceVegetationRule, type SeedResourcePoints } from '../lib/valheim/seed-resources.ts'
import { pregenerateWorld } from '../lib/valheim/world-pregeneration.ts'
import { ValheimWorldGenerator } from '../lib/valheim/world-generator.ts'
import { createWorldSeedState } from '../lib/valheim/world-seed.ts'
import { createIndexedKvStore } from '../lib/storage/indexed-kv.ts'

interface CacheEntry { version: 1; points: SeedResourcePoints }
const cache = createIndexedKvStore<CacheEntry>('valheim-companion-seed-resources', 'resources',
  (value): value is CacheEntry => typeof value === 'object' && value !== null &&
    (value as CacheEntry).version === 1 && (value as CacheEntry).points !== null &&
    typeof (value as CacheEntry).points === 'object' && Object.values((value as CacheEntry).points)
      .every((points) => points instanceof Float32Array && points.length % 2 === 0), 'Seed resources')

function complete(points: SeedResourcePoints) {
  self.postMessage({ type: 'complete', points }, { transfer: Object.values(points).map((coordinates) => coordinates.buffer as ArrayBuffer) })
}

self.onmessage = async (event: MessageEvent<{ seedName: string; profile: 'current' | 'legacy' }>) => {
  try {
    const responses = await Promise.all([fetch('/game-data/seed-resource-rules.json'), fetch('/game-data/biome-rules.json')])
    if (responses.some((response) => !response.ok)) throw new Error('Could not load resource generation rules')
    const [{ rules }, { altBiomes }] = await Promise.all(responses.map((response) => response.json())) as [
      { rules: ResourceVegetationRule[] }, { altBiomes: AltBiomeRule[] },
    ]
    const { seedName, profile } = event.data
    // Include exact rule data, profile and algorithm version to reject stale caches.
    const serializedRules = JSON.stringify([rules, altBiomes])
    // Overwolf schemes may lack SubtleCrypto; an exact rules key is a safe fallback.
    const ruleHash = globalThis.crypto?.subtle
      ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializedRules)) : null
    const fingerprint = ruleHash
      ? Array.from(new Uint8Array(ruleHash), (byte) => byte.toString(16).padStart(2, '0')).join('') : serializedRules
    const key = JSON.stringify([3, seedName, profile, fingerprint])
    const cached = await cache.get(key)
    if (cached) { complete(cached.points); return }
    const generator = new ValheimWorldGenerator(createWorldSeedState(seedName))
    pregenerateWorld(generator)
    if (profile !== 'legacy') generator.biomeWorld = new BiomeWorld(generator, altBiomes)
    const points = generateSeedResources(generator, rules)
    await cache.put(key, { version: 1, points })
    // Bound persistent world caches; changing seeds must not grow storage forever.
    const keys = await cache.keys()
    for (const old of keys.filter((entry) => entry !== key).slice(0, Math.max(0, keys.length - 3))) await cache.delete(old)
    complete(points)
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
