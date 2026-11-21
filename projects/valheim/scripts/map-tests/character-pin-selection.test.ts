import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCharacterPins, type LoadedCharacter } from '../../src/lib/valheim/character-pin-selection.ts'
import { mergeClientPins, type ClientLocationsSnapshot } from '../../src/lib/live-tracking/client-locations.ts'

const pin = (name: string) => ({ name, type: 'icon0' as const, x: 1, z: 2, height: 0, checked: false, ownerId: '0' })
const character = (name: string, count: number, hasMapData = true, uid = '123'): LoadedCharacter => ({
  file: { id: name, fileName: name, path: `${name}.fch`, source: 'local' },
  save: { playerVersion: 47, playerName: name, playerId: name,
    worlds: new Map([[uid, { worldUid: uid, hasMapData, pins: Array.from({ length: count }, () => pin(name)) }]]) },
})
const live: ClientLocationsSnapshot = { payloadVersion: 1, source: 'client-observation', worldUid: '123', worldName: 'world',
  seedName: 'seed', characterName: 'B', isServer: false, updatedAt: 1, locations: [], pins: [pin('live-B')] }

test('an unreadable/missing active B cannot fall back to readable A, even with more pins', () => {
  const result = resolveCharacterPins([character('A', 90)], '123', 'B', null)
  assert.equal(result.selectedCharacterId, null)
  assert.equal(result.characterName, 'B')
  assert.deepEqual(result.pins, [])
  assert.equal(mergeClientPins(result.pins, live, result.characterName), live.pins)
  assert.deepEqual(mergeClientPins(result.pins, null, result.characterName), [])
})

test('first visit without a saved map still uses the active character live pins', () => {
  const result = resolveCharacterPins([character('A', 90), character('B', 0, false)], '123', 'B', null)
  assert.equal(result.selectedCharacterId, null)
  assert.equal(mergeClientPins(result.pins, live, result.characterName), live.pins)
})

test('matched active character wins regardless of pin count and live deletions replace saved pins', () => {
  const result = resolveCharacterPins([character('A', 90), character('B', 1)], '123', 'b', null)
  assert.equal(result.selectedCharacterId, 'B')
  assert.equal(result.pins[0].name, 'B')
  assert.deepEqual(mergeClientPins(result.pins, { ...live, pins: [] }, result.characterName), [])
})

test('offline selection defaults to a compatible save, while manual selection still wins', () => {
  assert.equal(resolveCharacterPins([character('A', 90)], '123', null, null).selectedCharacterId, 'A')
  const selected = resolveCharacterPins([character('A', 90), character('B', 1)], '123', null, 'B')
  assert.equal(selected.manualCharacterId, 'B')
  assert.equal(selected.pins[0].name, 'B')
})

test('offline default uses last-played time, never the pin count', () => {
  const a = character('A', 90)
  const b = character('B', 1)
  a.file.lastPlayedAt = 1000
  b.file.lastPlayedAt = 2000
  assert.equal(resolveCharacterPins([a, b], '123', null, null).selectedCharacterId, 'B')
  assert.equal(resolveCharacterPins([a, b], '123', null, null, { name: 'A', updatedAt: 3000 }).selectedCharacterId, 'A')
  assert.equal(resolveCharacterPins([a, b], '123', null, null, { name: 'A', updatedAt: 500 }).selectedCharacterId, 'B')
  assert.equal(resolveCharacterPins([a, b], '123', 'Missing', null, { name: 'B', updatedAt: 3000 }).selectedCharacterId, null)
  assert.equal(resolveCharacterPins([], '123', null, null).selectedCharacterId, null)
})

test('manual choice of another character is honored and cannot import active B pins', () => {
  const result = resolveCharacterPins([character('A', 90), character('B', 1)], '123', 'B', 'A')
  assert.equal(result.characterName, 'A')
  assert.equal(mergeClientPins(result.pins, live, result.characterName), result.pins)
})

test('missing manual choice and wrong-world maps never select a different character', () => {
  const result = resolveCharacterPins([character('A', 90), character('B', 1, true, '456')], '123', 'B', 'missing')
  assert.deepEqual(result.pins, [])
  assert.equal(result.manualCharacterId, null)
  assert.deepEqual(resolveCharacterPins([character('A', 90)], null, 'A', 'A').pins, [])
})

test('duplicate character names are ambiguous until a save is selected explicitly', () => {
  const first = character('B', 1)
  const second = { ...character('B', 90), file: { ...first.file, id: 'cloud-B', source: 'steam-cloud' as const } }
  const result = resolveCharacterPins([first, second], '123', 'B', null)
  assert.equal(result.selectedCharacterId, null)
  assert.equal(mergeClientPins(result.pins, live, result.characterName), live.pins)
  assert.equal(resolveCharacterPins([first, second], '123', 'B', 'cloud-B').pins.length, 90)
})

test('exploration belongs only to the selected character and selected world', () => {
  const a = character('A', 0), b = character('B', 0)
  const explorationA = { textureSize: 4, bits: new Uint8Array([1, 0]) }
  const explorationB = { textureSize: 4, bits: new Uint8Array([0, 1]) }
  a.save.worlds.get('123')!.exploration = explorationA
  b.save.worlds.get('123')!.exploration = explorationB
  assert.equal(resolveCharacterPins([a, b], '123', 'A', null).exploration, explorationA)
  assert.equal(resolveCharacterPins([a, b], '123', 'A', 'B').exploration, explorationB)
  assert.equal(resolveCharacterPins([a, b], '456', 'A', null).exploration, null)
  assert.equal(resolveCharacterPins([a, b], '123', 'Missing', null).exploration, null)
})
