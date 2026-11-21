import assert from 'node:assert/strict'
import { test } from 'node:test'
import { followMapMirror, serveMapMirror, type MapMirrorState } from '../../src/lib/map-mirror.ts'

function channels(t: test.TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  const opened: FakeChannel[] = []
  class FakeChannel {
    onmessage: ((event: { data: unknown }) => void) | null = null
    closed = false
    constructor() { opened.push(this) }
    postMessage(data: unknown) { for (const channel of opened) if (channel !== this && !channel.closed) channel.onmessage?.({ data }) }
    close() { this.closed = true }
  }
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: FakeChannel })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'BroadcastChannel', previous)
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
  })
}
const state: MapMirrorState = {
  seedName: 'seed', worldUid: '123', customMarkerWorldKey: 'world:123', markers: [], visibleLocationIds: [],
  playerPins: [], visiblePinTypes: [], containers: [], containersLive: false, structurePaths: [], nearbyCreatures: [],
}

test('personal fog stays leased while desktop responds; closing it lets the overlay resume its own live reader', t => {
  channels(t)
  let received = 0
  let expired = 0
  const server = serveMapMirror(() => ({ ...state, exploration: null }))
  const stop = followMapMirror(() => { received++ }, () => { expired++ })
  assert.equal(received, 1)
  t.mock.timers.tick(5000)
  t.mock.timers.tick(5000)
  assert.equal(received, 3)
  assert.equal(expired, 0)
  server.close()
  t.mock.timers.tick(12_000)
  assert.equal(expired, 1)
  stop()
})

test('unrestricted and remote mirrors retain their original message behavior, without leases or heartbeats', t => {
  channels(t)
  let received = 0
  let expired = 0
  const server = serveMapMirror(() => state)
  const stop = followMapMirror(() => { received++ }, () => { expired++ })
  assert.equal(received, 1)
  t.mock.timers.tick(20_000)
  assert.equal(received, 1)
  assert.equal(expired, 0)
  server.close()
  stop()
})
