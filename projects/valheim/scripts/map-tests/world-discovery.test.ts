import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { startWorldDiscovery } from '../../src/lib/valheim/world-discovery.ts'
import { mergeKnownWorlds } from '../../src/lib/valheim/known-worlds.ts'
import type { ValheimWorldSave } from '../../src/types/world-save.ts'

const world = mergeKnownWorlds([], [{ name: 'New', seedName: 'test' }])[0]

test('a live change during an in-flight scan queues exactly one new scan without overlap', async () => {
  const resolves: Array<(worlds: ValheimWorldSave[]) => void> = []
  const results: ValheimWorldSave[][] = []
  const monitor = startWorldDiscovery({
    discover: () => new Promise(resolve => resolves.push(resolve)),
    onWorlds: worlds => results.push(worlds), onError: error => assert.fail(String(error)), onBusy: () => {}, intervalMs: 60_000,
  })
  try {
    await nextTurn()
    assert.equal(resolves.length, 1)
    await monitor.request(); await monitor.request()
    assert.equal(resolves.length, 1)
    resolves[0]([])
    await nextTurn()
    assert.equal(resolves.length, 2)
    resolves[1]([world])
    await nextTurn()
    assert.deepEqual(results, [[], [world]])
  } finally { monitor.stop() }
})

test('background polling detects a new save without the bridge or a manual refresh', async () => {
  let calls = 0
  let complete!: () => void
  const found = new Promise<void>(resolve => { complete = resolve })
  const monitor = startWorldDiscovery({
    discover: async () => ++calls === 1 ? [] : [world],
    onWorlds: worlds => { if (worlds.length) complete() }, onError: error => assert.fail(String(error)), onBusy: () => {}, intervalMs: 10,
  })
  const timeout = setTimeout(() => complete(), 1000)
  try { await found; assert.ok(calls >= 2) } finally { clearTimeout(timeout); monitor.stop() }
})

test('transient read failures keep the last successful result and recover on the next scan', async () => {
  let calls = 0
  let latest: ValheimWorldSave[] = []
  let errors = 0
  const monitor = startWorldDiscovery({
    discover: async () => { if (++calls === 2) throw new Error('locked'); return [world] },
    onWorlds: worlds => { latest = worlds }, onError: () => { errors++ }, onBusy: () => {}, intervalMs: 60_000,
  })
  try {
    await nextTurn()
    await monitor.request()
    assert.equal(errors, 1)
    assert.deepEqual(latest, [world])
    await monitor.request()
    assert.equal(calls, 3)
    assert.deepEqual(latest, [world])
  } finally { monitor.stop() }
})

test('closing or remounting a window discards late scan results', async () => {
  let finish!: (worlds: ValheimWorldSave[]) => void
  let published = 0
  const monitor = startWorldDiscovery({
    discover: () => new Promise(resolve => { finish = resolve }),
    onWorlds: () => { published++ }, onError: error => assert.fail(String(error)), onBusy: () => {}, intervalMs: 60_000,
  })
  await nextTurn()
  monitor.stop()
  finish([world])
  await nextTurn()
  await monitor.request()
  assert.equal(published, 0)
})
