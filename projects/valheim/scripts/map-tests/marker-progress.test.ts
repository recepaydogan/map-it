import assert from 'node:assert/strict'
import test from 'node:test'
import { countLocationProgress, isProgressMarkerVisible, locationProgressId } from '../../src/lib/marker-progress.ts'
import type { GeneratedLocationMarker } from '../../src/lib/valheim/location-generator.ts'
import type { LocationRecord } from '../../src/types/game-data.ts'

const marker = (id: string, x: number, prefabName = 'Crypt2'): GeneratedLocationMarker => ({
  id, x, y: 20, height: 30, zoneX: 0, zoneY: 0, locationId: prefabName, prefabName,
})

test('progress follows the physical spot across save reordering and observed-marker IDs', () => {
  const original = marker('save-Crypt2-1', 123.12345)
  const refreshed = { ...original, id: 'save-Crypt2-99', source: 'observed' as const, x: 123.123 }
  assert.equal(locationProgressId(original), locationProgressId(refreshed))
  assert.notEqual(locationProgressId(original), locationProgressId(marker('same-id', 124)))
  assert.notEqual(locationProgressId(original), locationProgressId(marker('same-id', original.x, 'Crypt3')))
})

test('hide switches intersect, including a marker that is both found and favorite', () => {
  const found = new Set(['found', 'both'])
  const favorites = new Set(['favorite', 'both'])
  const ids = ['plain', 'found', 'favorite', 'both']
  const visible = (hideFound: boolean, hideFavorites: boolean) => ids.filter(id =>
    isProgressMarkerVisible(id, found, favorites, hideFound, hideFavorites))
  assert.deepEqual(visible(false, false), ids)
  assert.deepEqual(visible(true, false), ['plain', 'favorite'])
  assert.deepEqual(visible(false, true), ['plain', 'found'])
  assert.deepEqual(visible(true, true), ['plain'])
})

test('found/total counts each spot and deduplicates overlapping enemy groups', () => {
  const crypt: LocationRecord = {
    id: 'Crypt2', prefabName: 'Crypt2', enabled: true, placement: {},
    contents: { hierarchyObjectCount: 2, componentKindCounts: { 'creature-spawner': 2 }, referencedAssets: [], semanticComponents: [
      { kind: 'creature-spawner', objectName: 'Skeleton spawner', objectPath: 'Skeleton spawner', data: { creaturePrefab: { name: 'Skeleton' } } },
      { kind: 'creature-spawner', objectName: 'Troll spawner', objectPath: 'Troll spawner', data: { creaturePrefab: { name: 'Troll' } } },
    ] },
  }
  const markers = [marker('first', 100), marker('second', 200)]
  const counts = countLocationProgress(markers, [crypt], new Set([locationProgressId(markers[0]), 'stale-marker']))
  for (const key of ['type:dungeons', 'group:dungeons', 'creature:skeleton', 'creature:troll', 'group:enemies']) {
    assert.equal(counts.totals.get(key), 2, key)
    assert.equal(counts.completed.get(key), 1, key)
  }
  assert.equal(counts.completed.has('stale-marker'), false)
  assert.equal(countLocationProgress([], [crypt], new Set()).totals.size, 0, 'Observed-only empty worlds stay empty')
  const fallback = countLocationProgress([], [crypt, { ...crypt, id: 'disabled', enabled: false }], new Set(), true)
  assert.equal(fallback.totals.get('type:dungeons'), 1)
  assert.equal(fallback.completed.size, 0, 'Catalog entries without physical positions cannot be found')
})

test('progress persists per world, toggles off, and synchronizes desktop and overlay without echo writes', async () => {
  const saved = new Map<string, string>()
  const windows: EventTarget[] = []
  let writes = 0
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const loadWindow = async (name: string) => {
    const events = new EventTarget()
    windows.push(events)
    const localStorage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value)
        writes++
        for (const other of windows) if (other !== events) {
          queueMicrotask(() => other.dispatchEvent(Object.assign(new Event('storage'), { key })))
        }
      },
    }
    Object.assign(globalThis, { window: { localStorage, addEventListener: events.addEventListener.bind(events) } })
    const url = new URL('../../src/store/marker-progress-store.ts', import.meta.url)
    url.searchParams.set('window', name)
    const { useMarkerProgressStore: store } = await import(url.href) as typeof import('../../src/store/marker-progress-store.ts')
    return store
  }
  try {
    const main = await loadWindow('main')
    const overlay = await loadWindow('overlay')
    main.getState().toggleFound('world:1', 'spot')
    main.getState().toggleFavorite('world:1', 'spot')
    main.getState().setHideFound(true)
    main.getState().setHideFavorites(true)
    await Promise.resolve()
    assert.deepEqual(overlay.getState().worlds['world:1'], { found: ['spot'], favorites: ['spot'] })
    assert.equal(overlay.getState().hideFound, true)
    assert.equal(overlay.getState().hideFavorites, true)
    assert.equal(overlay.getState().worlds['world:2'], undefined)
    assert.equal(writes, 4)

    overlay.getState().toggleFound('world:2', 'spot')
    overlay.getState().toggleFound('world:1', 'spot')
    overlay.getState().toggleFavorite('world:1', 'spot')
    await Promise.resolve()
    assert.deepEqual(main.getState().worlds['world:1'], { found: [], favorites: [] })
    assert.deepEqual(main.getState().worlds['world:2'], { found: ['spot'], favorites: [] })
    const reopened = await loadWindow('reopened')
    assert.deepEqual(reopened.getState().worlds, main.getState().worlds)
    assert.equal(reopened.getState().hideFound, true)
    assert.equal(writes, 7)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
