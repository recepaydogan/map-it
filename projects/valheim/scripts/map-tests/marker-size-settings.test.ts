import assert from 'node:assert/strict'
import test from 'node:test'

const storage = new Map<string, string>()
const fakeWindow = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
  },
  addEventListener: () => {},
}
Object.assign(globalThis, { window: fakeWindow })

const sizes = await import('../../src/lib/map-marker-sizes.ts')

test('group sizes inherit across marker types, while a type override remains independent', () => {
  sizes.resetMarkerSizes()
  sizes.setMarkerGroupSize('structures', 170)
  assert.equal(sizes.markerScale('type:camps', sizes.getMarkerSizes()), 1.7)
  assert.equal(sizes.markerScale('type:ruins', sizes.getMarkerSizes()), 1.7)
  sizes.setMarkerCategorySize('type:ruins', 60)
  assert.equal(sizes.markerScale('type:ruins', sizes.getMarkerSizes()), 0.6)
  assert.equal(sizes.markerScale('type:camps', sizes.getMarkerSizes()), 1.7)
  sizes.clearMarkerCategorySize('type:ruins')
  assert.equal(sizes.markerScale('type:ruins', sizes.getMarkerSizes()), 1.7)
})

test('saved values stay within 50–200% in ten percent steps', () => {
  sizes.resetMarkerSizes()
  sizes.setMarkerGroupSize('personal', 215)
  sizes.setMarkerCategorySize('custom', 54)
  assert.equal(sizes.getMarkerSizes().groups.personal, 200)
  assert.equal(sizes.getMarkerSizes().categories.custom, 50)
  assert.deepEqual(JSON.parse(storage.get('valheim-companion:marker-group-sizes') ?? '{}'), sizes.getMarkerSizes())
  sizes.resetMarkerSizes()
  assert.equal(sizes.markerScale('custom', sizes.getMarkerSizes()), 1)
})

test('background colors inherit from a group and a marker type can override or clear them', () => {
  sizes.resetMarkerSizes()
  sizes.setMarkerGroupColor('structures', '#abcdef')
  assert.equal(sizes.markerBackgroundColor('type:camps', sizes.getMarkerSizes()), '#ABCDEF')
  sizes.setMarkerCategoryColor('type:ruins', '#123456')
  assert.equal(sizes.markerBackgroundColor('type:ruins', sizes.getMarkerSizes()), '#123456')
  sizes.setMarkerCategoryColor('type:ruins', 'red')
  assert.equal(sizes.markerBackgroundColor('type:ruins', sizes.getMarkerSizes()), '#123456')
  sizes.setMarkerCategoryColor('type:ruins', null)
  assert.equal(sizes.markerBackgroundColor('type:ruins', sizes.getMarkerSizes()), '#ABCDEF')
  sizes.setMarkerGroupColor('structures', null)
  assert.equal(sizes.markerBackgroundColor('type:ruins', sizes.getMarkerSizes()), undefined)
})
