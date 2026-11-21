import assert from 'node:assert/strict'
import test from 'node:test'
import type { ClientLocationsSnapshot } from '../../src/lib/live-tracking/client-locations.ts'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} })
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: globalThis.localStorage } })
const { useClientLocationStore: store } = await import('../../src/store/client-location-store.ts')
const snapshot = (uid: string, x: number): ClientLocationsSnapshot => ({
  payloadVersion: 1, source: 'client-observation', worldUid: uid, worldName: 'Same named server',
  seedName: 'sameSeed', characterName: 'Test', isServer: false, updatedAt: 1,
  locations: [{ kind: 'loaded-proxy', prefabHash: -1544986047, x, z: -190.263687, height: 35 }], pins: [],
})
test('servers sharing a name and seed never share observed coordinates across UIDs', () => {
  store.setState({ worlds: {} })
  store.getState().apply(snapshot('101', 67))
  store.getState().apply(snapshot('202', 999))
  assert.deepEqual(Object.values(store.getState().worlds['101'].locations).map(location => location.x), [67])
  assert.deepEqual(Object.values(store.getState().worlds['202'].locations).map(location => location.x), [999])
  assert.equal(JSON.parse(storage.get('valheim-companion:client-locations')!).state.worlds['101'].worldUid, '101')
})
test('unloading a visited area retains its confirmed coordinates; a renamed identity resets old data', () => {
  store.setState({ worlds: {} })
  store.getState().apply(snapshot('101', 67))
  store.getState().apply({ ...snapshot('101', 67), locations: [] })
  assert.equal(Object.keys(store.getState().worlds['101'].locations).length, 1)
  store.getState().apply({ ...snapshot('101', 999), seedName: 'differentSeed' })
  assert.deepEqual(Object.values(store.getState().worlds['101'].locations).map(location => location.x), [999])
})
