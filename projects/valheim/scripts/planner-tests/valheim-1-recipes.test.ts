import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculatePlan } from '../../src/lib/crafting/calculate-plan.ts'
import { resourceAmountForQuality } from '../../src/lib/crafting/calculate-upgrades.ts'
import { graph, intelligence, makeTarget, materialAmount } from './fixtures.ts'

test('1.0 quality 4 doubles the level multiplier and later half steps round down', () => {
  const r = { prefabName: 'Bronze', amount: 8, amountPerLevel: 3, upgradeCostModel: '1.0' as const }
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(q => resourceAmountForQuality(r, q)), [8, 3, 6, 12, 13, 15])
  assert.equal(resourceAmountForQuality({ ...r, upgraderResource: true }, 4), 20)
})

test('ancient station upgrades consume only the matching upgrade token', () => {
  const plan = calculatePlan({ graph, stock: {}, targets: [makeTarget({ prefabName: 'SwordBronze', currentQuality: 1,
    targetQuality: 2, recipeId: 'Upgrader_Recipe_SwordBronze', expandIntermediates: false })] })
  assert.equal(materialAmount(plan.materials, 'Upgrader1Weapon'), 1)
  assert.equal(materialAmount(plan.materials, 'Bronze'), 0)
  assert.deepEqual(plan.targets[0].stations.map(s => [s.stationPrefab, s.level]), [['UpgradeStation', 1]])
})

test('Nord sword crafting uses the foundry, consumes five Liquid Frost and upgrades at the black forge', () => {
  const plan = calculatePlan({ graph, stock: {}, targets: [makeTarget({ prefabName: 'SwordGold', targetQuality: 2, expandIntermediates: false })] })
  assert.equal(plan.targets[0].recipe?.kind, 'conversion')
  assert.equal(materialAmount(plan.materials, 'SwordGoldUncooked'), 1)
  assert.equal(materialAmount(plan.materials, 'FrozenFuel'), 5)
  assert.equal(materialAmount(plan.materials, 'Gold'), 10)
  assert.equal(materialAmount(plan.materials, 'Frostwood'), 5)
  assert.deepEqual(plan.targets[0].steps.map(s => [s.kind, s.station?.stationPrefab, s.station?.level]),
    [['craft', 'piece_FrostFoundry', 1], ['upgrade', 'blackforge', 5]])
  assert.equal(intelligence.items.swordgold.craftedBy?.some(r => r.recipeId === 'Recipe_SwordGold'), false)
})

test('Frigid Kiln expands every Liquid Frost into five Ice', () => {
  const plan = calculatePlan({ graph, stock: {}, targets: [makeTarget({ prefabName: 'FrozenFuel', quantity: 5 })] })
  assert.equal(materialAmount(plan.materials, 'Ice'), 25)
})

test('Haldor services stay separate from ordinary items and Kall offering resolves', () => {
  assert.deepEqual(intelligence.traders.haldor.services?.map(s => [s.id, s.price]), [['invslot1', 1000], ['invslot2', 2000]])
  assert.ok(intelligence.traders.haldor.items.every(i => i.prefabName))
  assert.equal(intelligence.bossOfferings.frozenking.prefabName, 'HatefulBlood')
  assert.equal(intelligence.bossOfferings.frozenking.count, 3)
})
