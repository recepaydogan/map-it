import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculatePlan } from '../../src/lib/crafting/calculate-plan.ts'
import { mergeStock } from '../../src/lib/crafting/allocate-inventory.ts'
import {
  parseInventoryPayload,
  snapshotToStock,
} from '../../src/lib/live-tracking/inventory-payload.ts'
import {
  INVENTORY_FRESHNESS_MS,
  INVENTORY_PAYLOAD_VERSION,
  isAuthoritativeInventory,
  type LiveInventorySnapshot,
} from '../../src/lib/live-tracking/inventory-types.ts'
import { graph, makeTarget, materialAmount } from './fixtures.ts'

const payload = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  payloadVersion: INVENTORY_PAYLOAD_VERSION,
  sharing: true,
  updatedAt: 1_700_000_000_000,
  worldName: 'Midgard',
  worldUid: '42',
  seedName: 'Valheim',
  characterId: '7',
  characterName: 'Ylva',
  items: [
    { prefab: 'Bronze', amount: 8, quality: 1, equipped: false },
    { prefab: 'SwordBronze', amount: 1, quality: 2, equipped: true },
  ],
  ...overrides,
})

test('a valid payload becomes a typed snapshot', () => {
  const result = parseInventoryPayload(payload())
  assert.equal(result.kind, 'snapshot')
  if (result.kind !== 'snapshot') return
  assert.equal(result.snapshot.characterName, 'Ylva')
  assert.equal(result.snapshot.worldName, 'Midgard')
  assert.equal(result.snapshot.items.length, 2)
})

test('a missing or empty file is not an error', () => {
  assert.equal(parseInventoryPayload(null).kind, 'missing')
  assert.equal(parseInventoryPayload('   ').kind, 'missing')
})

test('malformed payloads never throw', () => {
  assert.equal(parseInventoryPayload('{not json').kind, 'invalid')
  assert.equal(parseInventoryPayload('[]').kind, 'invalid')
  assert.equal(parseInventoryPayload('{"payloadVersion":"x"}').kind, 'invalid')
  assert.equal(parseInventoryPayload('{"payloadVersion":1}').kind, 'invalid')
})

test('a newer payload version is refused instead of guessed at', () => {
  const result = parseInventoryPayload(payload({ payloadVersion: INVENTORY_PAYLOAD_VERSION + 1 }))
  assert.equal(result.kind, 'unsupported-payload')
})

test('revoked sharing is reported as its own state', () => {
  const result = parseInventoryPayload(payload({ sharing: false }))
  assert.equal(result.kind, 'sharing-off')
})

test('invalid item rows are dropped, not counted', () => {
  const result = parseInventoryPayload(payload({
    items: [
      { prefab: 'Bronze', amount: 8, quality: 1, equipped: false },
      { prefab: '', amount: 5 },
      { prefab: 'Wood', amount: -3 },
      { prefab: 'Stone', amount: 'many' },
      { amount: 4 },
      null,
    ],
  }))
  assert.equal(result.kind, 'snapshot')
  if (result.kind !== 'snapshot') return
  assert.deepEqual(result.snapshot.items.map((item) => item.prefab), ['Bronze'])
})

test('equipped items only count when the player allows it', () => {
  const result = parseInventoryPayload(payload())
  assert.equal(result.kind, 'snapshot')
  if (result.kind !== 'snapshot') return
  const withEquipped = snapshotToStock(result.snapshot, { characterInventory: true, equippedItems: true })
  const withoutEquipped = snapshotToStock(result.snapshot, { characterInventory: true, equippedItems: false })
  const onlyEquipped = snapshotToStock(result.snapshot, { characterInventory: false, equippedItems: true })
  assert.deepEqual(withEquipped, { bronze: 8, swordbronze: 1 })
  assert.deepEqual(withoutEquipped, { bronze: 8 })
  assert.deepEqual(onlyEquipped, { swordbronze: 1 })
})

test('only a fresh snapshot may be treated as the current inventory', () => {
  assert.equal(isAuthoritativeInventory('live'), true)
  assert.equal(isAuthoritativeInventory('stale'), false)
  assert.equal(isAuthoritativeInventory('disabled'), false)
  assert.ok(INVENTORY_FRESHNESS_MS > 15_000)
})

test('a snapshot from another character never mixes into the plan', () => {
  const snapshot = (characterId: string, bronze: number): LiveInventorySnapshot => ({
    payloadVersion: INVENTORY_PAYLOAD_VERSION,
    sharing: true,
    updatedAt: 1,
    worldName: 'Midgard',
    worldUid: '42',
    seedName: 'Valheim',
    characterId,
    characterName: `Character ${characterId}`,
    items: [{ prefab: 'Bronze', amount: bronze, quality: 1, equipped: false }],
  })
  const sources = { characterInventory: true, equippedItems: true }
  // Each read replaces the previous one, so switching characters swaps the
  // counts instead of adding them together.
  const first = snapshotToStock(snapshot('7', 8), sources)
  const second = snapshotToStock(snapshot('9', 2), sources)
  assert.deepEqual(first, { bronze: 8 })
  assert.deepEqual(second, { bronze: 2 })
})

test('live counts and manual amounts combine into one owned total', () => {
  const result = parseInventoryPayload(payload())
  assert.equal(result.kind, 'snapshot')
  if (result.kind !== 'snapshot') return
  const liveStock = snapshotToStock(result.snapshot, { characterInventory: true, equippedItems: false })
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'SwordBronze', expandIntermediates: false })],
    stock: mergeStock({ bronze: 2 }, liveStock),
  })
  const bronze = plan.materials.find((material) => material.prefabName === 'Bronze')
  assert.equal(bronze?.ownedTotal, 10)
  assert.equal(bronze?.missing, 0)
})

test('a stale snapshot can be excluded without losing manual progress', () => {
  const manualOnly = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'SwordBronze', expandIntermediates: false })],
    stock: mergeStock({ bronze: 3 }, {}),
  })
  assert.equal(materialAmount(manualOnly.materials, 'Bronze'), 5)
})
