import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeStock, normalizeStock } from '../../src/lib/crafting/allocate-inventory.ts'
import { calculatePlan } from '../../src/lib/crafting/calculate-plan.ts'
import {
  buildUpgradeSteps,
  requiredStationLevel,
  resourceAmountForQuality,
} from '../../src/lib/crafting/calculate-upgrades.ts'
import { defaultRecipeFor, recipesFor } from '../../src/lib/crafting/build-recipe-graph.ts'
import { resolveAcquisitionSources } from '../../src/lib/crafting/resolve-acquisition-sources.ts'
import { graph, intelligence, makeTarget, materialAmount, requiredAmount } from './fixtures.ts'

test('quality math follows Piece.Requirement.GetAmount', () => {
  const resource = { prefabName: 'Bronze', amount: 8, amountPerLevel: 4 }
  assert.equal(resourceAmountForQuality(resource, 0), 8)
  assert.equal(resourceAmountForQuality(resource, 1), 8)
  assert.equal(resourceAmountForQuality(resource, 2), 4)
  assert.equal(resourceAmountForQuality(resource, 3), 8)
  assert.equal(resourceAmountForQuality(resource, 4), 12)
})

test('station level follows Recipe.GetRequiredStationLevel', () => {
  const recipe = defaultRecipeFor(graph, 'SwordBronze')
  assert.ok(recipe)
  assert.equal(requiredStationLevel(recipe, 1), 1)
  assert.equal(requiredStationLevel(recipe, 2), 2)
  assert.equal(requiredStationLevel(recipe, 4), 4)
})

test('a hand-crafted item resolves without a crafting station', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'Hammer', expandIntermediates: false })],
    stock: {},
  })
  const [target] = plan.targets
  assert.equal(target.unresolved, false)
  assert.equal(target.recipe?.stationPrefab, '')
  assert.equal(target.steps[0]?.station, null)
  assert.ok(target.requirements.length > 0)
})

test('a forge weapon expands into its full material chain', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'SwordBronze' })],
    stock: {},
  })
  assert.equal(materialAmount(plan.materials, 'LeatherScraps'), 2)
  // 8 Bronze needs 16 Copper and 8 Tin, each bar smelted with 2 Coal, and every
  // Coal burned from one Wood: 2 for the sword itself plus 48 for the fuel.
  assert.equal(materialAmount(plan.materials, 'CopperOre'), 16)
  assert.equal(materialAmount(plan.materials, 'TinOre'), 8)
  assert.equal(materialAmount(plan.materials, 'Wood'), 2 + 24 * 2)
  assert.equal(requiredAmount(plan.intermediates, 'Bronze'), 8)
  assert.ok(plan.stations.some((station) => station.name === 'Forge'))
})

test('upgrading only charges for the levels that are missing', () => {
  const fresh = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'SwordBronze', targetQuality: 2, expandIntermediates: false })],
    stock: {},
  })
  const upgradeOnly = calculatePlan({
    graph,
    targets: [makeTarget({
      prefabName: 'SwordBronze',
      currentQuality: 1,
      targetQuality: 2,
      expandIntermediates: false,
    })],
    stock: {},
  })
  // Craft (8 Bronze) plus the level 2 upgrade (4 Bronze).
  assert.equal(materialAmount(fresh.materials, 'Bronze'), 12)
  assert.equal(materialAmount(upgradeOnly.materials, 'Bronze'), 4)
  assert.equal(upgradeOnly.targets[0]?.steps.length, 1)
  assert.equal(upgradeOnly.targets[0]?.steps[0]?.kind, 'upgrade')
  assert.equal(upgradeOnly.targets[0]?.stations[0]?.level, 2)
})

test('armor upgraded to max quality matches level-by-level costs', () => {
  const recipe = defaultRecipeFor(graph, 'ArmorBronzeChest')
  assert.ok(recipe)
  const item = graph.items.get('armorbronzechest')
  assert.ok(item)
  const { steps } = buildUpgradeSteps({
    graph,
    recipe,
    currentQuality: 0,
    targetQuality: item.maxQuality,
    maxQuality: item.maxQuality,
  })
  assert.equal(steps.length, item.maxQuality)
  assert.equal(steps[0]?.kind, 'craft')
  const bronzeByStep = steps.map((step) =>
    step.resources.find((resource) => resource.prefabName === 'Bronze')?.amount ?? 0)
  const perLevel = recipe.resources.find((resource) => resource.prefabName === 'Bronze')?.amountPerLevel ?? 0
  assert.deepEqual(bronzeByStep.slice(1), [perLevel, perLevel * 2, perLevel * 4])
})

test('batch output rounds up and reports the surplus', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'ArrowBronze', quantity: 5, expandIntermediates: false })],
    stock: {},
  })
  const recipe = plan.targets[0]?.recipe
  assert.ok(recipe)
  assert.ok(recipe.outputAmount > 1)
  const batches = Math.ceil(5 / recipe.outputAmount)
  assert.equal(plan.targets[0]?.surplus, batches * recipe.outputAmount - 5)
  const wood = recipe.resources.find((resource) => resource.prefabName === 'Wood')
  if (wood) assert.equal(materialAmount(plan.materials, 'Wood'), wood.amount * batches)
})

test('shared ingredients merge into one consolidated row', () => {
  const plan = calculatePlan({
    graph,
    targets: [
      makeTarget({ prefabName: 'SwordBronze', expandIntermediates: false }),
      makeTarget({ prefabName: 'AtgeirBronze', expandIntermediates: false }),
    ],
    stock: {},
  })
  const bronzeRows = plan.materials.filter((material) => material.prefabName === 'Bronze')
  assert.equal(bronzeRows.length, 1)
  assert.equal(bronzeRows[0]?.perTarget.length, 2)
})

test('owned intermediates remove their own ingredients from the plan', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'SwordBronze' })],
    stock: normalizeStock({ Bronze: 8 }),
  })
  assert.equal(materialAmount(plan.materials, 'CopperOre'), 0)
  assert.equal(materialAmount(plan.materials, 'TinOre'), 0)
  // Fully owned Bronze becomes a completed checklist row instead of a crafting step.
  assert.equal(requiredAmount(plan.materials, 'Bronze'), 8)
  assert.equal(materialAmount(plan.materials, 'Bronze'), 0)
  assert.equal(plan.intermediates.length, 0)
})

test('target quantity remains the requested craft amount even with owned copies', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'ArrowBronze', quantity: 40, expandIntermediates: false })],
    stock: normalizeStock({ ArrowBronze: 40 }),
  })
  assert.equal(plan.targets[0]?.ownedOutput, 0)
  assert.equal(plan.targets[0]?.ready, false)
  assert.ok(plan.totals.missingUnits > 0)
  assert.equal(materialAmount(plan.materials, 'Bronze'), 2)
})

test('owned stock is handed out once, in target order', () => {
  const plan = calculatePlan({
    graph,
    targets: [
      makeTarget({ prefabName: 'SwordBronze', expandIntermediates: false }),
      makeTarget({ prefabName: 'AtgeirBronze', expandIntermediates: false }),
    ],
    stock: normalizeStock({ Bronze: 8 }),
  })
  const bronze = plan.materials.find((material) => material.prefabName === 'Bronze')
  assert.ok(bronze)
  assert.equal(bronze.applied, 8)
  assert.equal(bronze.ownedTotal, 8)
  assert.equal(bronze.missing, bronze.required - 8)
  assert.equal(bronze.contended, true)
  // The first target consumed every owned bar; the second gets none.
  assert.equal(bronze.perTarget[0]?.net, 0)
  assert.ok((bronze.perTarget[1]?.net ?? 0) > 0)
})

test('ignoring stock reproduces the offline plan exactly', () => {
  const targets = [makeTarget({ prefabName: 'SwordBronze' })]
  const withStock = calculatePlan({ graph, targets, stock: normalizeStock({ Bronze: 8 }), ignoreStock: true })
  const withoutStock = calculatePlan({ graph, targets, stock: {} })
  assert.deepEqual(
    withStock.materials.map((material) => [material.prefabName, material.missing]),
    withoutStock.materials.map((material) => [material.prefabName, material.missing]),
  )
})

test('an item with no recipe stays an acquisition leaf', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'TrophyEikthyr', quantity: 2 })],
    stock: {},
  })
  assert.equal(plan.targets[0]?.recipe, null)
  assert.equal(plan.materials.length, 1)
  assert.equal(materialAmount(plan.materials, 'TrophyEikthyr'), 2)
  assert.ok(plan.warnings.some((warning) => warning.code === 'no-recipe'))
})

test('an unknown prefab is reported instead of silently dropped', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'NotARealPrefab' })],
    stock: {},
  })
  assert.equal(plan.targets[0]?.unresolved, true)
  assert.ok(plan.warnings.some((warning) => warning.code === 'unknown-item'))
  assert.equal(plan.materials.length, 0)
})

test('a removed recipe choice falls back and warns', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'Bronze', recipeId: 'Recipe_ThatNoLongerExists' })],
    stock: {},
  })
  assert.ok(plan.targets[0]?.recipe)
  assert.ok(plan.warnings.some((warning) => warning.code === 'recipe-unavailable'))
})

test('alternate recipes are exposed and selectable', () => {
  const bronzeRecipes = recipesFor(graph, 'Bronze')
  assert.ok(bronzeRecipes.length >= 2)
  const batched = bronzeRecipes.find((recipe) => recipe.outputAmount === 5)
  assert.ok(batched)
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'Bronze', quantity: 5, recipeId: batched.id, expandIntermediates: false })],
    stock: {},
  })
  assert.equal(plan.targets[0]?.recipe?.id, batched.id)
  assert.equal(plan.targets[0]?.surplus, 0)
})

test('equal-cost recipes default to the ingredient the game uses most', () => {
  // Coal burns from Wood, Fine Wood, or Round Log at the same rate.
  assert.equal(defaultRecipeFor(graph, 'Coal')?.resources[0]?.prefabName, 'Wood')
})

test('an intermediate recipe choice changes the whole material chain', () => {
  const target = makeTarget({ prefabName: 'SwordIron' })
  const scrapRecipe = recipesFor(graph, 'Iron').find((recipe) => recipe.id.includes('IronScrap'))
  assert.ok(scrapRecipe)
  const byDefault = calculatePlan({ graph, targets: [target], stock: {} })
  const bySrap = calculatePlan({
    graph,
    targets: [target],
    stock: {},
    recipeChoices: { iron: scrapRecipe.id },
  })
  assert.ok(materialAmount(byDefault.materials, 'IronOre') > 0)
  assert.equal(materialAmount(byDefault.materials, 'IronScrap'), 0)
  assert.equal(materialAmount(bySrap.materials, 'IronOre'), 0)
  assert.equal(
    materialAmount(bySrap.materials, 'IronScrap'),
    materialAmount(byDefault.materials, 'IronOre'),
  )
})

test('smelting fuel is expanded down to the raw wood', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'Iron', quantity: 6 })],
    stock: {},
  })
  assert.equal(materialAmount(plan.materials, 'IronOre'), 6)
  // 2 Coal per bar, and one Wood burns down to one Coal.
  assert.equal(materialAmount(plan.materials, 'Wood'), 12)
})

test('quantities are capped and quality is clamped at the domain boundary', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'SwordBronze', quantity: 100_000, targetQuality: 99, expandIntermediates: false })],
    stock: {},
  })
  assert.equal(plan.targets[0]?.quantity, 999)
  assert.equal(plan.targets[0]?.targetQuality, plan.targets[0]?.maxQuality)
  assert.ok(plan.warnings.some((warning) => warning.code === 'quantity-capped'))
})

test('negative and fractional owned amounts are rejected', () => {
  const stock = normalizeStock({ Bronze: -5, Wood: 3.7, Coal: Number.NaN, Iron: 4 })
  assert.deepEqual(stock, { wood: 3, iron: 4 })
  assert.deepEqual(mergeStock({ Wood: 2 }, { wood: 3 }, null), { wood: 5 })
})

test('manual completion only counts while live inventory is unavailable', () => {
  const targets = [makeTarget({ prefabName: 'SwordBronze', completed: true })]
  const offline = calculatePlan({ graph, targets, stock: {}, honorManualCompletion: true })
  const live = calculatePlan({ graph, targets, stock: {}, honorManualCompletion: false })
  assert.equal(offline.targets[0]?.manuallyCompleted, true)
  assert.equal(offline.materials.length, 0)
  assert.equal(live.targets[0]?.manuallyCompleted, false)
  assert.ok(live.materials.length > 0)
})

test('expansion can be switched off per target', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'SwordBronze', expandIntermediates: false })],
    stock: {},
  })
  assert.equal(materialAmount(plan.materials, 'Bronze'), 8)
  assert.equal(plan.intermediates.length, 0)
  assert.equal(plan.materials.find((material) => material.prefabName === 'Bronze')?.craftable, true)
})

test('a build piece can be planned like any other target', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'piece_workbench', expandIntermediates: false })],
    stock: {},
  })
  assert.equal(plan.targets[0]?.unresolved, false)
  assert.equal(plan.targets[0]?.item?.isPiece, true)
  assert.equal(materialAmount(plan.materials, 'Wood'), 10)
})

test('a conversion station recipe carries its fuel cost', () => {
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'Iron', quantity: 3, expandIntermediates: false })],
    stock: {},
  })
  assert.equal(plan.targets[0]?.recipe?.kind, 'conversion')
  assert.equal(materialAmount(plan.materials, 'Coal'), 6)
  assert.ok(plan.stations.some((station) => station.name === 'Smelter'))
})

test('food with a batch output is planned per batch', () => {
  const recipe = defaultRecipeFor(graph, 'CookedMeat')
  assert.ok(recipe)
  const plan = calculatePlan({
    graph,
    targets: [makeTarget({ prefabName: 'CookedMeat', quantity: 4, expandIntermediates: false })],
    stock: {},
  })
  assert.equal(materialAmount(plan.materials, 'RawMeat'), 4 / recipe.outputAmount)
})

test('trader-only stock resolves to a trader source', () => {
  const result = resolveAcquisitionSources(graph, intelligence, 'FishingRod')
  assert.ok(result.hasKnownSource)
  assert.ok(result.sources.some((source) => source.kind === 'trader'))
})

test('a boss drop keeps its chance and one-per-player flag', () => {
  const result = resolveAcquisitionSources(graph, intelligence, 'TrophyEikthyr')
  const boss = result.sources.find((source) => source.kind === 'boss')
  assert.ok(boss)
  assert.equal(typeof boss.chance, 'number')
  assert.notEqual(boss.certainty, 'unknown')
})

test('materials without extracted sources report an explicit unknown state', () => {
  const result = resolveAcquisitionSources(graph, intelligence, 'Obsidian')
  assert.equal(result.hasKnownSource, false)
  assert.equal(result.sources.length, 0)
})

test('recipe expansion never loops on a self-referencing chain', () => {
  const cyclicGraph = {
    ...graph,
    recipesByOutput: new Map(graph.recipesByOutput),
    recipesById: new Map(graph.recipesById),
  }
  cyclicGraph.recipesByOutput.set('wood', [{
    id: 'Test_WoodLoop',
    kind: 'item' as const,
    outputPrefab: 'Wood',
    outputAmount: 1,
    stationPrefab: '',
    repairStationPrefab: '',
    stationLevel: 1,
    requireOnlyOneIngredient: false,
    qualityResultAmountMultiplier: 1,
    resources: [{ prefabName: 'FineWood', amount: 1, amountPerLevel: 0 }],
  }])
  cyclicGraph.recipesByOutput.set('finewood', [{
    id: 'Test_FineWoodLoop',
    kind: 'item' as const,
    outputPrefab: 'FineWood',
    outputAmount: 1,
    stationPrefab: '',
    repairStationPrefab: '',
    stationLevel: 1,
    requireOnlyOneIngredient: false,
    qualityResultAmountMultiplier: 1,
    resources: [{ prefabName: 'Wood', amount: 1, amountPerLevel: 0 }],
  }])
  const plan = calculatePlan({
    graph: cyclicGraph,
    targets: [makeTarget({ prefabName: 'Wood', quantity: 1 })],
    stock: {},
  })
  assert.ok(plan.warnings.some((warning) => warning.code === 'cycle'))
})

test('a large plan stays inside the interaction budget', () => {
  const targets = [
    'SwordBronze', 'AtgeirBronze', 'ArmorBronzeChest', 'ArmorBronzeLegs', 'HelmetBronze',
    'SwordIron', 'ArmorIronChest', 'ArmorIronLegs', 'HelmetIron', 'ShieldIronTower',
  ].map((prefabName) => makeTarget({ prefabName, targetQuality: 4, quantity: 2 }))
  const started = process.hrtime.bigint()
  const plan = calculatePlan({ graph, targets, stock: {} })
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(plan.materials.length > 0)
  assert.ok(elapsedMs < 50, `plan calculation took ${elapsedMs.toFixed(1)}ms`)
})
