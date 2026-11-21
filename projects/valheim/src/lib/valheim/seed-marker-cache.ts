import { createIndexedKvStore } from '../storage/indexed-kv'
import type { GeneratedLocationMarker } from './location-generator'

/**
 * Bump when the world generator or location generator changes its output.
 * Cached marker sets from older versions are then simply not found.
 */
export const SEED_MARKER_CACHE_VERSION = 4

export interface SeedMarkerCacheEntry {
  schemaVersion: 1
  markers: GeneratedLocationMarker[]
  durationMs: number
}

const isEntry = (value: unknown): value is SeedMarkerCacheEntry =>
  typeof value === 'object' && value !== null &&
  (value as SeedMarkerCacheEntry).schemaVersion === 1 &&
  Array.isArray((value as SeedMarkerCacheEntry).markers)

const store = createIndexedKvStore<SeedMarkerCacheEntry>(
  'valheim-companion-seed-markers',
  'markers',
  isEntry,
  'Seed marker cache',
)

/** FNV-1a over a string; stable across sessions, cheap enough for a few hundred KB. */
export const fingerprintText = (text: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Cache key: generator version + seed + a fingerprint of the placement rules,
 * so a game-data update (new locations, changed quantities) never serves a
 * marker set generated from stale rules.
 */
export const seedMarkerCacheKey = (
  seedName: string,
  rulesFingerprint: string,
  profile: 'current' | 'legacy' = 'current',
): string => `v${SEED_MARKER_CACHE_VERSION}:${profile}:${rulesFingerprint}:${seedName}`

export const readSeedMarkers = (key: string) => store.get(key)
export const writeSeedMarkers = (key: string, entry: SeedMarkerCacheEntry) => store.put(key, entry)
