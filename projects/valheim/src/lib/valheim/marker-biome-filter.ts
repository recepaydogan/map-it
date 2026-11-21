import type { GeneratedLocationMarker } from './location-generator.ts'
import { ValheimWorldGenerator, type ValheimBiome } from './world-generator.ts'
import { createWorldSeedState } from './world-seed.ts'

export const BIOME_FILTER_OPTIONS: readonly { key: ValheimBiome; label: string }[] = [
  { key: 'meadows', label: 'Meadows' },
  { key: 'black-forest', label: 'Black Forest' },
  { key: 'swamp', label: 'Swamp' },
  { key: 'mountain', label: 'Mountain' },
  { key: 'plains', label: 'Plains' },
  { key: 'mistlands', label: 'Mistlands' },
  { key: 'ashlands', label: 'Ashlands' },
  { key: 'deep-north', label: 'Deep North' },
  { key: 'ocean', label: 'Ocean' },
]
export const ALL_BIOME_KEYS = BIOME_FILTER_OPTIONS.map((biome) => biome.key)

/** Filter each placed marker by the biome at its coordinates, not every biome
 * allowed for its location type. An empty selection hides location markers. */
export function filterMarkersByBiomes(
  markers: readonly GeneratedLocationMarker[],
  seedName: string,
  selectedBiomes: readonly string[],
): GeneratedLocationMarker[] {
  if (selectedBiomes.length === 0) return []
  if (ALL_BIOME_KEYS.every((key) => selectedBiomes.includes(key)) || !seedName) return markers as GeneratedLocationMarker[]
  const selected = new Set(selectedBiomes)
  const generator = new ValheimWorldGenerator(createWorldSeedState(seedName))
  return markers.filter((marker) => selected.has(generator.getBiome(marker.x, marker.y)))
}
