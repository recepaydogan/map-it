import assert from 'node:assert/strict'
import test from 'node:test'
import { clusterMapPoints } from '../../src/lib/container-clustering.ts'

const point = (id: string, x: number, z = 0) => ({ id, x, z })

test('keeps transitively overlapping chest markers in one cluster', () => {
  const groups = clusterMapPoints([
    point('first', 0),
    point('middle', 20),
    point('last', 40),
  ], 22)

  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].members.map(({ id }) => id), ['first', 'middle', 'last'])
  assert.equal(groups[0].x, 20)
})

test('never separates chests at the same map position', () => {
  const groups = clusterMapPoints([
    point('lower', 12, -8),
    point('upper', 12, -8),
  ], 0)

  assert.equal(groups.length, 1)
  assert.equal(groups[0].members.length, 2)
})

test('leaves genuinely separated chest markers in different clusters', () => {
  const groups = clusterMapPoints([
    point('near-a', 0),
    point('near-b', 10),
    point('far', 50),
  ], 12)

  assert.deepEqual(groups.map(({ members }) => members.length), [2, 1])
})
