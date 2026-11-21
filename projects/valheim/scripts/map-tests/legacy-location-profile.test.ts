import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { generateWorldLocations } from '../../src/lib/valheim/location-generator.ts'
import { getStableHashCode } from '../../src/lib/valheim/stable-hash.ts'
import { createWorldSeedState } from '../../src/lib/valheim/world-seed.ts'
import { ValheimWorldGenerator } from '../../src/lib/valheim/world-generator.ts'
import { pregenerateWorld } from '../../src/lib/valheim/world-pregeneration.ts'
import type { LocationRecord } from '../../src/types/game-data.ts'

test('legacy placement reproduces the AGALAR starting temple observed in game', () => {
  const catalog = JSON.parse(readFileSync('public/game-data/location-index.json', 'utf8')) as {
    locations: LocationRecord[]
  }
  const temple = catalog.locations.find((location) => location.prefabName === 'StartTemple')
  assert.ok(temple)
  const generator = new ValheimWorldGenerator(createWorldSeedState('FZE9RXJbNE'))
  pregenerateWorld(generator)
  const observed = [{ prefabHash: getStableHashCode('StartTemple'), x: 67.68444, y: 35.82919, z: -190.263687 }]
  const legacy = generateWorldLocations(generator, [temple], undefined, 'legacy')
  const current = generateWorldLocations(generator, [temple], undefined, 'current')
  assert.ok(Math.hypot(legacy[0].x - observed[0].x, legacy[0].y - observed[0].z) < 0.01)
  assert.ok(Math.hypot(current[0].x - observed[0].x, current[0].y - observed[0].z) > 5)
})

