import assert from 'node:assert/strict'
import test from 'node:test'

test('open map windows immediately share custom pin changes without echo writes', async () => {
  const saved = new Map<string, string>()
  const windows: EventTarget[] = []
  let writes = 0
  const loadWindow = async (name: string) => {
    const events = new EventTarget()
    windows.push(events)
    const localStorage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value)
        writes++
        for (const other of windows) {
          if (other === events) continue
          queueMicrotask(() => other.dispatchEvent(Object.assign(new Event('storage'), { key })))
        }
      },
    }
    Object.assign(globalThis, { window: {
      localStorage,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    } })
    const url = new URL('../../src/store/custom-marker-store.ts', import.meta.url)
    url.searchParams.set('window', name)
    const { useCustomMarkerStore: store } = await import(url.href) as typeof import('../../src/store/custom-marker-store.ts')
    return { store, events }
  }
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    const main = await loadWindow('main')
    const mini = await loadWindow('mini')
    const marker = { worldKey: 'world:42', name: 'Custom test pin', category: 'type:traders', x: 125, z: -200 }
    let miniUpdates = 0
    mini.store.subscribe(() => { miniUpdates++ })

    const id = main.store.getState().add(marker)
    await Promise.resolve()
    assert.equal(mini.store.getState().markers[0].id, id)
    assert.equal(miniUpdates, 1)
    assert.equal(writes, 1, 'receiving a change must not write it back')

    main.store.getState().update(id, { category: marker.category, name: 'Renamed pin' })
    main.store.getState().move(id, 350, -500)
    await Promise.resolve()
    assert.equal(mini.store.getState().markers[0].name, 'Renamed pin')
    assert.equal(mini.store.getState().markers[0].x, 350)
    assert.equal(mini.store.getState().markers[0].z, -500)

    main.store.getState().setCategoryVisible(marker.category, false)
    await Promise.resolve()
    assert.deepEqual(mini.store.getState().hiddenCategories, [marker.category])
    main.store.getState().add({ ...marker, name: 'Second pin', worldKey: 'seed:OtherWorld' })
    await Promise.resolve()
    assert.deepEqual(mini.store.getState().hiddenCategories, [])
    assert.equal(mini.store.getState().markers.filter(pin => pin.worldKey === 'world:42').length, 1)

    mini.store.getState().remove(id)
    await Promise.resolve()
    assert.equal(main.store.getState().markers.some(pin => pin.id === id), false)
    assert.equal(writes, 6)

    const reopened = await loadWindow('reopened')
    assert.deepEqual(reopened.store.getState().markers, main.store.getState().markers)

    // A suspended window catches up when it receives focus again.
    const key = 'valheim-companion:custom-markers'
    const snapshot = JSON.parse(saved.get(key)!)
    snapshot.state.markers = []
    saved.set(key, JSON.stringify(snapshot))
    mini.events.dispatchEvent(new Event('focus'))
    assert.deepEqual(mini.store.getState().markers, [])
    assert.equal(writes, 6)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
