import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createClientLocationMarkers, parseClientLocations, mergeClientPins } from '../../src/lib/live-tracking/client-locations.ts'
import type { LocationRecord } from '../../src/types/game-data.ts'

const catalog = JSON.parse(readFileSync(new URL('../../public/game-data/location-index.json', import.meta.url), 'utf8')).locations as LocationRecord[]
const observation = { kind: 'loaded-proxy', prefabHash: -1544986047, x: 67.68444, height: 35.82919, z: -190.263687 }
const raw = { payloadVersion: 1, source: 'client-observation', worldUid: '-329361684', worldName: 'Valheim World AGALAR',
  seedName: 'FZE9RXJbNE', characterName: 'Test', isServer: false, updatedAt: 1,
  locations: [observation], pins: [] }

test('AGALAR observed temple retains its actual coordinates, independently of seed generation', () => {
  const snapshot = parseClientLocations(JSON.stringify(raw))
  assert.ok(snapshot)
  const markers = createClientLocationMarkers(snapshot.locations, catalog)
  assert.equal(markers.length, 1)
  assert.equal(markers[0].prefabName, 'StartTemple')
  assert.equal(markers[0].x, observation.x)
  assert.equal(markers[0].y, observation.z)
  assert.equal(markers[0].height, observation.height)
  assert.equal(markers[0].source, 'observed')
})
test('query results and malformed client records cannot enter the observation layer', () => {
  assert.equal(parseClientLocations(JSON.stringify({ ...raw, source: 'server-rpc' })), null)
  assert.equal(parseClientLocations(JSON.stringify({ ...raw, worldUid: '0' })), null)
  assert.equal(parseClientLocations(JSON.stringify({ ...raw, locations: [{ ...observation, x: null }] })), null)
})
test('known icons deduplicate loaded proxies; unrelated and unidentified structures are never guessed', () => {
  const markers = createClientLocationMarkers([
    { ...observation, kind: 'loaded-proxy' },
    { kind: 'known-icon', prefabName: 'StartTemple', x: observation.x, z: observation.z, height: 100 },
    { ...observation, kind: 'loaded-proxy', prefabHash: 123456789, x: 10 },
  ], catalog)
  assert.equal(markers.length, 1)
  assert.equal(markers[0].height, observation.height)
  assert.deepEqual(createClientLocationMarkers([], catalog), [])
})
test('live pin deletions replace the character save; game/probe temporary pins are excluded', () => {
  const pin = { name: '$enemy_eikthyr', type: 'boss' as const, x: 118.953674, z: 560.9706, height: 47.4309, checked: false, ownerId: '0' }
  const snapshot = parseClientLocations(JSON.stringify({ ...raw, pins: [pin,
    { ...pin, name: '__vc_server_probe__:obsolete' }, { ...pin, type: 'ping' }] }))
  assert.ok(snapshot)
  assert.deepEqual(snapshot.pins, [pin])
  assert.deepEqual(mergeClientPins([pin], { ...snapshot, pins: [] }), [])
  assert.deepEqual(mergeClientPins([pin], { ...snapshot, pins: [] }, 'Another character'), [pin])
  assert.deepEqual(mergeClientPins([pin], null), [pin])
})
