import assert from 'node:assert/strict'
import test from 'node:test'
import { readMapCamera, writeMapCamera } from '../../src/lib/map-camera-persistence.ts'

const storage = new Map<string, string>()
Object.assign(globalThis, { window: {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
  },
} })

test('the main map restores the last camera separately for each world seed', () => {
  const first = { zoom: 3.25, panX: -340, panY: 185 }
  const second = { zoom: 9, panX: 700, panY: -42 }
  writeMapCamera('main-map:seed:Ashlands', first)
  writeMapCamera('main-map:seed:Meadows', second)
  assert.deepEqual(readMapCamera('main-map:seed:Ashlands'), first)
  assert.deepEqual(readMapCamera('main-map:seed:Meadows'), second)
  assert.equal(readMapCamera('main-map:seed:NewWorld'), null)
})

test('invalid stored camera values fall back to the opening view', () => {
  const key = 'valheim-companion:map-camera:v1:main-map%3Aseed%3ABroken'
  storage.set(key, '{bad json')
  assert.equal(readMapCamera('main-map:seed:Broken'), null)
  storage.set(key, JSON.stringify({ zoom: 0.85, panX: 'NaN', panY: 0 }))
  assert.equal(readMapCamera('main-map:seed:Broken'), null)
  storage.set(key, JSON.stringify({ zoom: 1, panX: 0, panY: Infinity }))
  assert.equal(readMapCamera('main-map:seed:Broken'), null)
})
