import assert from 'node:assert/strict'
import test from 'node:test'
import { boundBaseWorlds, fallbackOperations, mergeBaseSnapshot, parseBaseSnapshot, shouldUseBaseFallback } from '../../src/lib/live-tracking/base-fallback.ts'
import { buildPortalRoutes, summarizeStations } from '../../src/features/base-operations/operations-model.ts'

const station = { prefabName: 'fermenter', x: 1, y: 2, height: 3, creator: '1', fuel: 0, queued: 0,
  level: 0, productProgress: 0, processedOutputPrefab: '', processedOutputAmount: 0, content: 'MeadBaseHealthMinor',
  bakeTimer: 0, startTimeTicks: 10_000_000, lastTimeTicks: 0, queueItems: [], slotStatuses: [], slotCookTimes: [] }
const piece = (id: string) => ({ id, prefabName: 'wood_floor', x: 1, z: 2, yaw: 90 })
const raw = (overrides: object = {}) => ({ payloadVersion: 1, worldUid: '-329361684', worldName: 'AGALAR', seedName: 'Seed',
  updatedAt: 1000, worldTimeTicks: 20_000_000, truncated: false, pieces: [piece('a')], removed: [], ...overrides })
const snapshot = (overrides: object = {}) => parseBaseSnapshot(JSON.stringify(raw(overrides)))!

test('full world data always wins, even when there are zero structures and stations', () => {
  for (const database of [{ structures: [], baseOperations: { stations: [], portals: [] } }, { structures: [piece('distant')] }]) {
    for (const discovering of [true, false]) for (const loading of [true, false]) {
      assert.equal(shouldUseBaseFallback(database, discovering, loading), false)
    }
  }
})
test('fallback starts only after normal discovery and reading finish without data', () => {
  assert.equal(shouldUseBaseFallback(null, true, false), false)
  assert.equal(shouldUseBaseFallback(null, false, true), false)
  assert.equal(shouldUseBaseFallback(null, false, false), true)
  assert.equal(shouldUseBaseFallback({ structures: [] }, false, false), false)
})
test('unloaded pieces remain remembered; only explicit removals delete them', () => {
  const first = mergeBaseSnapshot(undefined, snapshot())
  const next = mergeBaseSnapshot(first, snapshot({ updatedAt: 2000, pieces: [piece('b')] }))
  assert.deepEqual(Object.keys(next.pieces).sort(), ['a', 'b'])
  const deleted = mergeBaseSnapshot(next, snapshot({ updatedAt: 3000, pieces: [], removed: ['a'] }))
  assert.deepEqual(Object.keys(deleted.pieces), ['b'])
  assert.ok(first.pieces.a)
})
test('new worlds and conflicting seed identities never inherit old observations', () => {
  const first = mergeBaseSnapshot(undefined, snapshot())
  for (const identity of [{ worldUid: '12' }, { seedName: 'Different' }, { worldName: 'Other' }]) {
    const next = mergeBaseSnapshot(first, snapshot({ ...identity, updatedAt: 2000, pieces: [] }))
    assert.equal(Object.keys(next.pieces).length, 0)
  }
})
test('old snapshots cannot overwrite newer production states', () => {
  const first = mergeBaseSnapshot(undefined, snapshot({ updatedAt: 2000 }))
  assert.equal(mergeBaseSnapshot(first, snapshot()), first)
})
test('malformed, partial and unsupported payloads are rejected as a whole', () => {
  assert.equal(parseBaseSnapshot('{'), null)
  for (const overrides of [{ payloadVersion: 2 }, { worldUid: '' }, { worldUid: '0' },
    { pieces: [piece('a'), piece('a')] }, { pieces: [{ ...piece('a'), x: null }] },
    { pieces: [{ ...piece('a'), station: { ...station, queueItems: 'bad' } }] }, { removed: [42] }]) {
    assert.equal(parseBaseSnapshot(JSON.stringify(raw(overrides))), null)
  }
})
test('observation time is assigned from the snapshot, not from untrusted piece fields', () => {
  const parsed = snapshot({ pieces: [{ ...piece('a'), observedAt: 999999, worldTimeTicks: 999999 }] })
  assert.equal(parsed.pieces[0].observedAt, 1000)
  assert.equal(parsed.pieces[0].worldTimeTicks, 20_000_000)
})
test('remembered production remains at its observation clock instead of simulating unseen progress', () => {
  const first = mergeBaseSnapshot(undefined, snapshot({ pieces: [{ ...piece('a'), station }] }))
  const next = mergeBaseSnapshot(first, snapshot({ updatedAt: 2000, worldTimeTicks: 999_000_000_000, pieces: [piece('b')] }))
  const operations = fallbackOperations(next)
  const summaries = summarizeStations(operations.baseOperations.stations, 999_000_000_000)
  assert.equal(summaries[0].readyOutputAmount, 0)
  assert.equal(summaries[0].remainingSeconds, 2399)
})
test('live portals pair only confirmed matching endpoints; an unseen endpoint stays unlinked', () => {
  const portal = { prefabName: 'portal_wood', x: 0, y: 0, height: 0, yaw: 0, creator: '1', tag: 'Home', author: '',
    connectionType: null, connectionHash: null, connectionKey: '0:0:0|100:0:0' }
  assert.equal(buildPortalRoutes([portal])[0].connected, false)
  assert.equal(buildPortalRoutes([portal, { ...portal, x: 100 }])[0].connected, true)
  assert.equal(buildPortalRoutes([portal, { ...portal, connectionKey: 'other' }]).length, 2)
})
test('memory bounds retain newest pieces and flag partial coverage', () => {
  const first = mergeBaseSnapshot(undefined, snapshot({ pieces: Array.from({ length: 10000 }, (_, i) => piece(String(i))) }))
  const next = mergeBaseSnapshot(first, snapshot({ updatedAt: 2000, pieces: [piece('new')] }))
  assert.equal(Object.keys(next.pieces).length, 10000)
  assert.ok(next.pieces.new)
  assert.equal(next.truncated, true)
})

test('persisted memory stays bounded across multiple large worlds', () => {
  const worlds = Object.fromEntries(Array.from({ length: 5 }, (_, i) => {
    const world = mergeBaseSnapshot(undefined, snapshot({ worldUid: String(i + 1), updatedAt: i + 1,
      pieces: Array.from({ length: 10000 }, (_, n) => ({ ...piece(`${i}-${n}`), station })) }))
    return [world.worldUid, world]
  }))
  const bounded = boundBaseWorlds(worlds)
  assert.ok(JSON.stringify(bounded).length < 1_500_000)
  assert.ok(bounded['5'])
  assert.ok(Object.values(bounded).some(world => world.truncated))
  assert.ok(Object.keys(bounded).length <= 4)
})
