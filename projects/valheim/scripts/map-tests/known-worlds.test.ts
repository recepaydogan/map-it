import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseNewLiveWorld, findLiveWorld, mergeKnownWorlds, parseKnownWorlds, rememberWorlds, rememberedWorldId, resolveSelectedWorld, worldIdentityKey } from '../../src/lib/valheim/known-worlds.ts'

const north = { name: 'New world', seedName: 'NorthSeed' }
const south = { name: 'New world', seedName: 'SouthSeed' }

test('a new live world appears before its first save, survives restart and never invents a database or UID', () => {
  const known = rememberWorlds([], [north])
  const restarted = parseKnownWorlds(JSON.stringify(known))
  const worlds = mergeKnownWorlds([], restarted)
  assert.equal(worlds.length, 1)
  assert.equal(worlds[0].seedName, north.seedName)
  assert.equal(worlds[0].databasePath, null)
  assert.equal(worlds[0].uid, '')
  assert.equal(resolveSelectedWorld(worlds, restarted, rememberedWorldId(north)), worlds[0])
})

test('the first committed save replaces the remembered row and preserves its selected identity', () => {
  const known = rememberWorlds([], [north])
  const liveId = rememberedWorldId(north)
  const save = { ...mergeKnownWorlds([], known)[0], id: 'north/_main', uid: '42', databasePath: 'north/_main.1.db2', source: 'local' as const }
  const updated = rememberWorlds(known, [{ ...north, saveId: save.id }])
  const worlds = mergeKnownWorlds([save], updated)
  assert.equal(worlds.length, 1)
  assert.equal(resolveSelectedWorld(worlds, updated, liveId), save)
  assert.equal(resolveSelectedWorld(mergeKnownWorlds([], updated), updated, save.id)?.seedName, north.seedName)
})

test('equal world names with different seeds never select or overwrite each other', () => {
  const known = rememberWorlds([], [north, south])
  const worlds = mergeKnownWorlds([], known)
  assert.equal(worlds.length, 2)
  assert.equal(findLiveWorld(worlds, south)?.seedName, south.seedName)
  assert.equal(findLiveWorld(worlds, { ...north, seedName: 'northseed' }), null)
})

test('only a new live identity switches maps; rescans preserve manual choice, and returning to the old world works', () => {
  const worlds = mergeKnownWorlds([], [north, south])
  assert.equal(chooseNewLiveWorld(worlds, north, null)?.seedName, north.seedName)
  assert.equal(chooseNewLiveWorld([...worlds], north, worldIdentityKey(north)), null)
  assert.equal(chooseNewLiveWorld(worlds, south, worldIdentityKey(north))?.seedName, south.seedName)
  assert.equal(chooseNewLiveWorld(worlds, north, worldIdentityKey(south))?.seedName, north.seedName)
})

test('ambiguous duplicate saves cannot attach the wrong database', () => {
  const a = mergeKnownWorlds([], [north])[0]
  assert.equal(findLiveWorld([a, { ...a, id: 'another-save', uid: '99' }], north), null)
})

test('repeat live samples preserve saved identity and avoid persistence writes', () => {
  const known = rememberWorlds([], [{ ...north, saveId: 'real-save' }])
  assert.equal(rememberWorlds(known, [north]), known)
  assert.deepEqual(parseKnownWorlds('broken JSON'), [])
  assert.deepEqual(parseKnownWorlds('[null,{}, {"name":"New","seedName":""}]'), [])
})
