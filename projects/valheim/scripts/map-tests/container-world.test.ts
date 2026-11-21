import assert from 'node:assert/strict'
import test from 'node:test'
import { selectContainerWorld } from '../../src/lib/live-tracking/container-world.ts'

const worlds = {
  '111': { containers: { oldChest: { items: [{ prefab: 'Wood', amount: 50 }] } } },
  '222': { containers: { cloudChest: { items: [{ prefab: 'Stone', amount: 10 }] } } },
}

test('unresolved cloud world cannot expose the previous live world or its stock', () => {
  for (const uid of [null, '', '0']) {
    const result = selectContainerWorld(worlds, uid, '111')
    assert.equal(result.world, undefined)
    assert.equal(result.worldUid, null)
    assert.equal(result.matchesLiveWorld, false)
  }
})

test('switching worlds selects only that world memory even while the old snapshot remains fresh', () => {
  const result = selectContainerWorld(worlds, '222', '111')
  assert.equal(result.world, worlds['222'])
  assert.equal(result.matchesLiveWorld, false)
})

test('a new world without remembered chests stays empty', () => {
  assert.equal(selectContainerWorld(worlds, '333', '111').world, undefined)
})

test('matching live world is live and offline selection retains only its own memory', () => {
  assert.equal(selectContainerWorld(worlds, '222', '222').matchesLiveWorld, true)
  const offline = selectContainerWorld(worlds, '111', null)
  assert.equal(offline.world, worlds['111'])
  assert.equal(offline.matchesLiveWorld, false)
})
