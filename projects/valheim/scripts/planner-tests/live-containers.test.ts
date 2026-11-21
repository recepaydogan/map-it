import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  containersToStock,
  holdingsFor,
  mergeContainerSnapshot,
  parseContainersPayload,
} from '../../src/lib/live-tracking/container-payload.ts'
import {
  CONTAINERS_PAYLOAD_VERSION,
  type LiveContainersSnapshot,
  type RememberedContainer,
} from '../../src/lib/live-tracking/container-types.ts'

const chest = (overrides: Record<string, unknown> = {}) => ({
  id: '1:100',
  prefab: 'piece_chest_wood',
  name: '$piece_chest_wood',
  owner: 'own',
  creator: '7',
  x: 10,
  y: 30,
  z: -20,
  private: false,
  loaded: true,
  items: [{ prefab: 'Iron', amount: 20, quality: 1 }],
  ...overrides,
})

const payload = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  payloadVersion: CONTAINERS_PAYLOAD_VERSION,
  sharing: true,
  updatedAt: 1_700_000_000_000,
  worldName: 'Midgard',
  worldUid: '42',
  seedName: 'Valheim',
  characterId: '7',
  containers: [chest(), chest({ id: '1:101', owner: 'other', creator: '9', x: 500, items: [{ prefab: 'Iron', amount: 5, quality: 1 }] })],
  removed: [],
  ...overrides,
})

const snapshotOf = (raw: string): LiveContainersSnapshot => {
  const result = parseContainersPayload(raw)
  assert.equal(result.kind, 'snapshot')
  if (result.kind !== 'snapshot') throw new Error('unreachable')
  return result.snapshot
}

test('parses containers and rejects malformed entries without throwing', () => {
  const snapshot = snapshotOf(payload({
    containers: [chest(), { id: '', x: 1, y: 1, z: 1 }, chest({ id: '1:102', items: [{ prefab: '', amount: 3 }, { prefab: 'Wood', amount: 0 }] })],
  }))
  assert.equal(snapshot.containers.length, 2)
  assert.deepEqual(snapshot.containers[1].items, [])
  assert.equal(parseContainersPayload('{not json').kind, 'invalid')
  assert.equal(parseContainersPayload(payload({ sharing: false })).kind, 'sharing-off')
  assert.equal(parseContainersPayload(payload({ payloadVersion: 99 })).kind, 'unsupported-payload')
  assert.equal(parseContainersPayload('').kind, 'missing')
})

test('own chests count by default, friend chests only when allowed', () => {
  const snapshot = snapshotOf(payload())
  assert.deepEqual(containersToStock(snapshot.containers, { ownContainers: true, friendContainers: false }), { iron: 20 })
  assert.deepEqual(containersToStock(snapshot.containers, { ownContainers: true, friendContainers: true }), { iron: 25 })
  assert.deepEqual(containersToStock(snapshot.containers, { ownContainers: false, friendContainers: false }), {})
})

test('holdings list the chests that hold a material, nearest first', () => {
  const remembered: RememberedContainer[] = snapshotOf(payload()).containers.map((container) => ({ ...container, lastSeenAt: 1 }))
  const own = holdingsFor(remembered, 'iron', { ownContainers: true, friendContainers: false }, { x: 480, z: -20 })
  assert.equal(own.length, 1)
  assert.equal(own[0].container.id, '1:100')
  const all = holdingsFor(remembered, 'IRON', { ownContainers: true, friendContainers: true }, { x: 480, z: -20 })
  assert.deepEqual(all.map((holding) => holding.container.id), ['1:101', '1:100'])
  assert.deepEqual(all.map((holding) => holding.amount), [5, 20])
})

test('merging upserts reported chests, drops removed ones, keeps unseen ones', () => {
  const first = snapshotOf(payload())
  let memory = mergeContainerSnapshot({}, first, 1)
  assert.equal(Object.keys(memory).length, 2)
  // Next session: mod only knows one chest so far, and reports the other destroyed.
  const second = snapshotOf(payload({
    containers: [chest({ id: '1:103', items: [{ prefab: 'Wood', amount: 40, quality: 1 }] })],
    removed: ['1:101'],
  }))
  memory = mergeContainerSnapshot(memory, second, 2)
  assert.deepEqual(Object.keys(memory).sort(), ['1:100', '1:103'])
  assert.equal(memory['1:100'].lastSeenAt, 1)
  assert.equal(memory['1:103'].lastSeenAt, 2)
})
