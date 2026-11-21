import assert from 'node:assert/strict'
import test from 'node:test'
import { ALL_BIOME_KEYS, filterMarkersByBiomes } from '../../src/lib/valheim/marker-biome-filter.ts'
import { ValheimWorldGenerator } from '../../src/lib/valheim/world-generator.ts'
import { createWorldSeedState } from '../../src/lib/valheim/world-seed.ts'
import type { GeneratedLocationMarker } from '../../src/lib/valheim/location-generator.ts'

test('biome selection filters individual placements of the same dungeon type', () => {
  const seed = 'biome-filter-test'
  const generator = new ValheimWorldGenerator(createWorldSeedState(seed))
  const positions = new Map<string, { x: number; y: number }>()
  for (let x = -8000; x <= 8000 && positions.size < 2; x += 500) {
    for (let y = -8000; y <= 8000 && positions.size < 2; y += 500) {
      const biome = generator.getBiome(x, y)
      if (!positions.has(biome)) positions.set(biome, { x, y })
    }
  }
  assert.equal(positions.size, 2)
  const [first, second] = [...positions]
  const marker = (id: string, position: { x: number; y: number }): GeneratedLocationMarker => ({
    id, locationId: 'dungeon', prefabName: 'Dungeon', x: position.x, y: position.y,
    height: 0, zoneX: 0, zoneY: 0,
  })
  const markers = [marker('first', first[1]), marker('second', second[1])]
  assert.deepEqual(filterMarkersByBiomes(markers, seed, [first[0]]).map((entry) => entry.id), ['first'])
  assert.deepEqual(filterMarkersByBiomes(markers, seed, []), [])
  assert.equal(filterMarkersByBiomes(markers, seed, ALL_BIOME_KEYS), markers)
})
