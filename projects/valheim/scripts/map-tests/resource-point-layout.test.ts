import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectVisibleResourcePoints } from '../../src/components/resource-point-layout.ts'

test('saved resource pins retain every world position across pan and zoom', () => {
  const points = [
    { x: 0, z: 0, nodePrefab: 'RaspberryBush' },
    { x: 100, z: 0, nodePrefab: 'RaspberryBush' },
  ]
  const view = {
    zoom: 1,
    mapSize: 1000,
    panY: 0,
    viewportWidth: 500,
    viewportHeight: 500,
  }

  assert.deepEqual(selectVisibleResourcePoints(points, { ...view, panX: 0 }), points)
  assert.deepEqual(selectVisibleResourcePoints(points, { ...view, panX: 8 }), points)
  assert.deepEqual(selectVisibleResourcePoints(points, { ...view, panX: 8, zoom: 6 }), points)
})

test('dense resource areas do not silently replace or cap actual pins', () => {
  const points = Array.from({ length: 300 }, (_, index) => ({
    x: index % 30,
    z: Math.floor(index / 30),
    nodePrefab: 'RaspberryBush',
  }))
  const visible = selectVisibleResourcePoints(points, {
    zoom: 8,
    mapSize: 1000,
    panX: 0,
    panY: 0,
    viewportWidth: 500,
    viewportHeight: 500,
  })
  assert.deepEqual(visible, points)
})
