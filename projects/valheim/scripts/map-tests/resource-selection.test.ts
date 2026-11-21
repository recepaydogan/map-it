import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isResourceFilterMaterial, normalizeResourceSelection, toggleResourceSelection } from '../../src/lib/valheim/resource-selection.ts'

test('resource selection keeps at most three materials from saved selections', () => {
  const saved = ['Acorn', 'Amber', 'Blueberries', 'BeechSeeds', 'CarrotSeeds', 'Amber']
  assert.deepEqual(normalizeResourceSelection(saved), ['Acorn', 'Amber', 'Blueberries'])
  assert.deepEqual(normalizeResourceSelection(['AmberPearl']), [])
  assert.deepEqual(normalizeResourceSelection(null), [])
})

test('common bulk materials are absent from the resource-node filter', () => {
  for (const prefab of ['Wood', 'Resin', 'Stone', 'Feathers', 'AmberPearl', 'SeekerBrood', 'IceShoreShard']) {
    assert.equal(isResourceFilterMaterial(prefab), false)
  }
  assert.equal(isResourceFilterMaterial('FineWood'), true)
})

test('a fourth selection replaces the oldest while existing selections can be turned off', () => {
  const selected = ['Acorn', 'Amber', 'Blueberries']
  assert.deepEqual(toggleResourceSelection(selected, 'CarrotSeeds'), ['Amber', 'Blueberries', 'CarrotSeeds'])
  assert.deepEqual(toggleResourceSelection(selected, 'Amber'), ['Acorn', 'Blueberries'])
})
