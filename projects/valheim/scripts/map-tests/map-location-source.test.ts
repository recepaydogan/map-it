import assert from 'node:assert/strict'
import test from 'node:test'
import { locationsFromSaveOrObservations, mapLocationVisibility } from '../../src/lib/valheim/map-location-source.ts'
import type { GeneratedLocationMarker } from '../../src/lib/valheim/location-generator.ts'

const marker = (id: string, locationId: string, zoneX: number, source: 'save' | 'observed'): GeneratedLocationMarker => ({
  id, locationId, prefabName: locationId, x: zoneX * 64, y: 0, height: 0, zoneX, zoneY: 0, source,
})

test('local and Steam Cloud saves reveal all locations only with spoilers enabled', () => {
  for (const source of ['local', 'steam-cloud'] as const) {
    const world = { source, databasePath: 'world.db' }
    for (const isServer of [true, undefined]) {
      assert.deepEqual(mapLocationVisibility(world, isServer, true), { canToggleSpoilers: true, observedOnly: false })
      assert.deepEqual(mapLocationVisibility(world, isServer, false), { canToggleSpoilers: true, observedOnly: true })
    }
  }
})

test('remote sessions cannot enable spoilers even if a local save copy exists', () => {
  for (const databasePath of [null, 'world.db']) {
    for (const showSpoilers of [true, false]) {
      assert.deepEqual(mapLocationVisibility({ source: 'local', databasePath }, false, showSpoilers),
        { canToggleSpoilers: false, observedOnly: true })
    }
  }
})

test('new local worlds expose the setting but still need a save before revealing all locations', () => {
  const world = { source: 'remembered' as const, databasePath: null }
  for (const showSpoilers of [true, false]) {
    assert.deepEqual(mapLocationVisibility(world, true, showSpoilers), { canToggleSpoilers: true, observedOnly: true })
    assert.deepEqual(mapLocationVisibility(world, undefined, showSpoilers), { canToggleSpoilers: false, observedOnly: true })
  }
})

test('manual seeds and unresolved selections do not expose a local-world switch', () => {
  for (const showSpoilers of [true, false]) {
    assert.deepEqual(mapLocationVisibility(null, undefined, showSpoilers), { canToggleSpoilers: false, observedOnly: false })
  }
})

test('observations remain visible during save loading and when the save has no locations yet', () => {
  const observed = [marker('client-temple', 'temple', 1, 'observed')]
  assert.equal(locationsFromSaveOrObservations([], observed), observed)
})

test('a loaded save supplies the full map and preserves observations absent from that save', () => {
  const saved = [marker('save-temple', 'temple', 1, 'save'), marker('save-boss', 'boss', 10, 'save')]
  const observed = [marker('client-temple', 'temple', 1, 'observed'), marker('client-cave', 'cave', 4, 'observed')]
  assert.deepEqual(locationsFromSaveOrObservations(saved, observed).map((entry) => entry.id),
    ['save-temple', 'save-boss', 'client-cave'])
  assert.equal(locationsFromSaveOrObservations(saved, []), saved)
})
