import assert from 'node:assert/strict'
import test from 'node:test'
import { filterExploredPoints, isMapPointExplored, isMapPointVisible, packExploredMap } from '../../src/lib/valheim/explored-map.ts'
import { exploredLocationMarkers } from '../../src/lib/valheim/map-location-source.ts'
import type { GeneratedLocationMarker } from '../../src/lib/valheim/location-generator.ts'

test('personal exploration uses current game orientation and Utils.RoundToInt boundaries', () => {
  const own = new Uint8Array(16 * 16)
  own[10 * 16 + 9] = 1 // x=12, z=24
  const map = packExploredMap(16, own)
  assert.equal(map.bits.length, 32)
  assert.ok(isMapPointExplored(map, 12, 24))
  assert.equal(isMapPointExplored(map, -36, -24), false)
  assert.equal(isMapPointExplored(map, 12, -24), false)
  assert.equal(isMapPointExplored(map, 0, 0), false)
  assert.equal(isMapPointExplored(map, 10000, 0), false)
  assert.equal(isMapPointExplored(map, NaN, 0), false)
  assert.equal(isMapPointExplored(map, 17.9, 24), true)
  assert.equal(isMapPointExplored(map, 18, 24), false)
  assert.equal(isMapPointExplored(map, 6, 24), true)
  assert.equal(isMapPointExplored(map, 5.9, 24), false)
  assert.throws(() => packExploredMap(4097, own), /Invalid/)
  assert.throws(() => packExploredMap(16, own.subarray(1)), /Invalid/)
})

test('a missing restricted map hides every point, with no nearby exception; unrestricted views stay unchanged', () => {
  assert.equal(isMapPointVisible(null, 0, 0), false)
  assert.equal(isMapPointVisible(null, 200, 0), false)
  assert.ok(isMapPointVisible(undefined, 0, 0))
  const points = [{ x: 0, z: 0 }, { x: 200, z: 0 }]
  assert.deepEqual(filterExploredPoints(points, null), [])
  assert.deepEqual(filterExploredPoints(points, undefined), points)
})

test('old explored locations are visible without any tracker history, while unrelated observations stay hidden', () => {
  const own = new Uint8Array(256 * 256)
  own[128 * 256 + 228] = 1 // visited x=1200, z=0
  const map = packExploredMap(256, own)
  const marker = (id: string, x: number, y: number, source: 'save' | 'observed'): GeneratedLocationMarker => ({
    id, x, y, source, locationId: 'temple', prefabName: 'StartTemple', height: 0, zoneX: 0, zoneY: 0,
  })
  const markers = [marker('visited-before-tracker', 1200, 0, 'save'), marker('unvisited', 900, 0, 'save'),
    marker('another-character-observation', 0, 500, 'observed'), marker('nearby', -200, 0, 'save')]
  assert.deepEqual(exploredLocationMarkers(markers, map).map(m => m.id), ['visited-before-tracker'])
  assert.deepEqual(exploredLocationMarkers(markers, null), [])
})
