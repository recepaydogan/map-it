import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { parseNearbyCreaturesPayload } from '../../src/lib/live-tracking/creature-payload.ts'
import { NEARBY_CREATURES_FRESHNESS_MS } from '../../src/lib/live-tracking/creature-types.ts'

const payload = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  payloadVersion: 1,
  updatedAt: 1_700_000_000_000,
  worldName: 'Midgard',
  worldUid: '42',
  seedName: 'Valheim',
  radius: 200,
  creatures: [{ id: '10:20', prefab: 'Bjorn', name: '$enemy_bjorn', x: 12, y: 31, z: -8, level: 2, tamed: false }],
  ...overrides,
})

test('parses nearby creatures and rejects malformed rows', () => {
  const result = parseNearbyCreaturesPayload(payload({
    creatures: [
      { id: '10:20', prefab: 'Bjorn', name: '$enemy_bjorn', x: 12, y: 31, z: -8, level: 2, tamed: false },
      { id: '', prefab: 'Boar', x: 1, y: 2, z: 3 },
    ],
  }))
  assert.equal(result.kind, 'snapshot')
  if (result.kind !== 'snapshot') throw new Error('unreachable')
  assert.equal(result.snapshot.creatures.length, 1)
  assert.equal(result.snapshot.creatures[0].prefab, 'Bjorn')
  assert.equal(result.snapshot.radius, 200)
})

test('does not guess unsupported or corrupt creature payloads', () => {
  assert.equal(parseNearbyCreaturesPayload('').kind, 'missing')
  assert.equal(parseNearbyCreaturesPayload('{bad').kind, 'invalid')
  assert.equal(parseNearbyCreaturesPayload(payload({ payloadVersion: 99 })).kind, 'unsupported-payload')
})

test('freshness tolerance spans more than two three-minute refresh windows', () => {
  assert.ok(NEARBY_CREATURES_FRESHNESS_MS > 6 * 60_000)
})

test('the shipped nearby catalog contains ambient creatures, not fixed bosses or summons', () => {
  const catalog = JSON.parse(fs.readFileSync('public/game-data/nearby-creature-catalog.json', 'utf8')) as {
    schemaVersion: number
    creatures: Array<{ prefab: string }>
  }
  const prefabs = new Set(catalog.creatures.map((entry) => entry.prefab.toLowerCase()))

  assert.equal(catalog.schemaVersion, 2)
  assert.ok(prefabs.has('bjorn'))
  assert.ok(prefabs.has('abomination'))
  for (const excluded of ['eikthyr', 'bonemass', 'dragon', 'goblinking', 'seekerqueen', 'fader', 'troll_summoned']) {
    assert.equal(prefabs.has(excluded), false, `${excluded} must not be offered as an ambient creature`)
  }
})
