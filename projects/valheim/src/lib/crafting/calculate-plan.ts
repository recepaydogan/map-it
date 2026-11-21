import { createStockPool, type StockPool } from './allocate-inventory.ts'
import { findItem, prefabKey, resolveRecipeChoice } from './build-recipe-graph.ts'
import { buildUpgradeSteps, collectStationRequirements } from './calculate-upgrades.ts'
import {
  MAX_EXPANSION_DEPTH,
  MAX_TARGET_QUANTITY,
  type PlanCalculation,
  type PlanCalculationInput,
  type PlanMaterial,
  type PlanRequirementNode,
  type PlanStationRequirement,
  type PlanTarget,
  type PlanTargetResult,
  type PlanWarning,
  type PlannerRecipe,
  type RecipeGraph,
} from './recipe-types.ts'

interface MaterialAccumulator {
  prefabName: string
  required: number
  applied: number
  missing: number
  craftable: boolean
  perTarget: Map<string, { gross: number; net: number }>
}

const emptyTotals = () => ({
  targets: 0,
  requiredUnits: 0,
  missingUnits: 0,
  completion: 1,
  readyTargets: 0,
  distinctMissingMaterials: 0,
})

const clampQuantity = (value: number) =>
  Math.min(MAX_TARGET_QUANTITY, Math.max(1, Math.floor(Number.isFinite(value) ? value : 1)))

const mergeStationRequirements = (
  into: Map<string, PlanStationRequirement>,
  stations: PlanStationRequirement[],
) => {
  for (const station of stations) {
    const existing = into.get(station.stationPrefab)
    if (!existing || station.level > existing.level) into.set(station.stationPrefab, station)
  }
}

/**
 * Expands one requirement, consuming owned materials before deciding what still
 * has to be crafted. Owned intermediates therefore remove their own ingredients
 * from the plan instead of being counted twice.
 */
function expandRequirement(options: {
  graph: RecipeGraph
  pool: StockPool
  prefabName: string
  gross: number
  depth: number
  maxDepth: number
  ancestors: ReadonlySet<string>
  expand: boolean
  recipeChoices: Record<string, string>
  keyPrefix: string
  warnings: PlanWarning[]
  targetId: string
  onNode: (node: PlanRequirementNode) => void
}): PlanRequirementNode {
  const {
    graph, pool, prefabName, gross, depth, maxDepth, ancestors,
    expand, recipeChoices, keyPrefix, warnings, targetId, onNode,
  } = options
  const key = prefabKey(prefabName)
  const item = findItem(graph, prefabName)
  const fromStock = pool.take(prefabName, gross)
  const net = gross - fromStock
  const { recipe } = resolveRecipeChoice(graph, prefabName, recipeChoices[key] ?? null)

  const node: PlanRequirementNode = {
    key: keyPrefix,
    prefabName: item?.prefabName ?? prefabName,
    item,
    gross,
    fromStock,
    net,
    craftBatches: 0,
    surplus: 0,
    // Recorded even when the node is not expanded so the checklist can offer to
    // craft an intermediate instead of collecting it.
    recipe,
    station: null,
    children: [],
    expanded: false,
    leafReason: null,
  }

  if (!item) {
    warnings.push({ code: 'unknown-item', targetId, prefabName })
  }
  if (net <= 0) {
    node.leafReason = 'covered-by-stock'
    onNode(node)
    return node
  }
  if (!recipe) {
    node.leafReason = 'no-recipe'
    onNode(node)
    return node
  }
  if (!expand) {
    node.leafReason = 'expansion-disabled'
    onNode(node)
    return node
  }
  if (ancestors.has(key)) {
    node.leafReason = 'cycle'
    warnings.push({ code: 'cycle', targetId, prefabName: node.prefabName })
    onNode(node)
    return node
  }
  if (depth >= maxDepth) {
    node.leafReason = 'depth-limit'
    warnings.push({ code: 'depth-limit', targetId, prefabName: node.prefabName })
    onNode(node)
    return node
  }

  const batches = Math.ceil(net / recipe.outputAmount)
  node.craftBatches = batches
  node.surplus = batches * recipe.outputAmount - net
  node.expanded = true
  node.station = recipe.stationPrefab
    ? {
      stationPrefab: recipe.stationPrefab,
      name: graph.stations.get(prefabKey(recipe.stationPrefab))?.name ?? recipe.stationPrefab,
      level: Math.max(1, recipe.stationLevel),
    }
    : null

  const nextAncestors = new Set(ancestors)
  nextAncestors.add(key)
  const resources = recipe.requireOnlyOneIngredient ? recipe.resources.slice(0, 1) : recipe.resources
  node.children = resources.map((resource, index) => expandRequirement({
    ...options,
    prefabName: resource.prefabName,
    gross: resource.amount * batches,
    depth: depth + 1,
    ancestors: nextAncestors,
    keyPrefix: `${keyPrefix}/${prefabKey(resource.prefabName)}#${index}`,
  }))

  onNode(node)
  return node
}

function calculateTarget(options: {
  graph: RecipeGraph
  pool: StockPool
  target: PlanTarget
  honorManualCompletion: boolean
  recipeChoices: Record<string, string>
  maxDepth: number
  onNode: (node: PlanRequirementNode) => void
}): PlanTargetResult {
  const { graph, pool, target, honorManualCompletion, recipeChoices, maxDepth, onNode } = options
  const warnings: PlanWarning[] = []
  const item = findItem(graph, target.prefabName)
  const requestedQuantity = clampQuantity(target.quantity)
  if (requestedQuantity !== target.quantity) {
    warnings.push({ code: 'quantity-capped', targetId: target.id, prefabName: target.prefabName })
  }

  const base: PlanTargetResult = {
    targetId: target.id,
    prefabName: item?.prefabName ?? target.prefabName,
    item,
    quantity: requestedQuantity,
    currentQuality: Math.max(0, Math.round(target.currentQuality)),
    targetQuality: Math.max(1, Math.round(target.targetQuality)),
    maxQuality: item?.maxQuality ?? 1,
    recipe: null,
    alternateRecipeIds: (graph.recipesByOutput.get(prefabKey(target.prefabName)) ?? []).map((recipe) => recipe.id),
    steps: [],
    stations: [],
    requirements: [],
    warnings,
    unresolved: false,
    ready: false,
    requiredUnits: 0,
    missingUnits: 0,
    manuallyCompleted: false,
    ownedOutput: 0,
    surplus: 0,
  }

  if (!item) {
    warnings.push({ code: 'unknown-item', targetId: target.id, prefabName: target.prefabName })
    return { ...base, unresolved: true }
  }

  if (target.completed && honorManualCompletion) {
    return { ...base, manuallyCompleted: true, ready: true }
  }

  const { recipe, choiceMissing } = resolveRecipeChoice(graph, target.prefabName, target.recipeId, target.currentQuality > 0)
  if (choiceMissing) {
    warnings.push({
      code: 'recipe-unavailable',
      targetId: target.id,
      prefabName: target.prefabName,
      detail: target.recipeId ?? undefined,
    })
  }

  // Target quantity is what the player intends to craft. Calculate recipe materials
  // for the full requested quantity so the required materials list is always visible.
  const ownedOutput = 0
  const remainingQuantity = requestedQuantity

  if (!recipe) {
    // No recipe means the item has to be found, not built. Treating it as free
    // output would silently drop it from the collection list.
    warnings.push({ code: 'no-recipe', targetId: target.id, prefabName: target.prefabName })
    if (remainingQuantity <= 0) {
      return { ...base, ownedOutput, ready: true }
    }
    const node = expandRequirement({
      graph,
      pool,
      prefabName: target.prefabName,
      gross: remainingQuantity,
      depth: 0,
      maxDepth,
      ancestors: new Set(),
      expand: false,
      recipeChoices,
      keyPrefix: `${target.id}/${prefabKey(target.prefabName)}`,
      warnings,
      targetId: target.id,
      onNode,
    })
    return {
      ...base,
      ownedOutput,
      requirements: [node],
      requiredUnits: node.gross,
      missingUnits: node.net,
      ready: node.net === 0,
    }
  }

  const upgrade = buildUpgradeSteps({
    graph,
    recipe,
    currentQuality: base.currentQuality,
    targetQuality: base.targetQuality,
    maxQuality: item.maxQuality,
    targetId: target.id,
  })
  warnings.push(...upgrade.warnings)
  if (upgrade.warnings.some((warning) => warning.code === 'recipe-unavailable')) {
    return { ...base, recipe, steps: upgrade.steps, unresolved: true, ready: false }
  }

  if (upgrade.steps.length === 0) {
    warnings.push({ code: 'nothing-to-do', targetId: target.id, prefabName: target.prefabName })
    return {
      ...base,
      recipe,
      ownedOutput,
      currentQuality: upgrade.currentQuality,
      targetQuality: upgrade.targetQuality,
      steps: upgrade.steps,
      ready: true,
    }
  }

  if (remainingQuantity <= 0) {
    return {
      ...base,
      recipe,
      ownedOutput,
      currentQuality: upgrade.currentQuality,
      targetQuality: upgrade.targetQuality,
      steps: upgrade.steps,
      stations: collectStationRequirements(upgrade.steps),
      ready: true,
    }
  }

  const craftsFromScratch = upgrade.steps.some((step) => step.kind === 'craft')
  const batches = craftsFromScratch ? Math.ceil(remainingQuantity / recipe.outputAmount) : 0
  const surplus = craftsFromScratch ? batches * recipe.outputAmount - remainingQuantity : 0

  const directTotals = new Map<string, { prefabName: string; amount: number }>()
  for (const step of upgrade.steps) {
    const multiplier = step.kind === 'craft' ? batches : remainingQuantity
    for (const resource of step.resources) {
      const key = prefabKey(resource.prefabName)
      const existing = directTotals.get(key)
      const amount = resource.amount * multiplier
      if (existing) existing.amount += amount
      else directTotals.set(key, { prefabName: resource.prefabName, amount })
    }
  }

  const requirements = [...directTotals.values()].map((entry, index) => expandRequirement({
    graph,
    pool,
    prefabName: entry.prefabName,
    gross: entry.amount,
    depth: 0,
    maxDepth,
    ancestors: new Set([prefabKey(target.prefabName)]),
    expand: target.expandIntermediates,
    recipeChoices,
    keyPrefix: `${target.id}/${prefabKey(entry.prefabName)}#${index}`,
    warnings,
    targetId: target.id,
    onNode,
  }))

  const requiredUnits = requirements.reduce((sum, node) => sum + node.gross, 0)
  const missingUnits = requirements.reduce((sum, node) => sum + node.net, 0)

  return {
    ...base,
    recipe,
    ownedOutput,
    surplus,
    currentQuality: upgrade.currentQuality,
    targetQuality: upgrade.targetQuality,
    steps: upgrade.steps,
    stations: collectStationRequirements(upgrade.steps),
    requirements,
    requiredUnits,
    missingUnits,
    ready: missingUnits === 0,
  }
}

const toMaterial = (
  accumulator: MaterialAccumulator,
  graph: RecipeGraph,
  ownedTotals: Record<string, number>,
): PlanMaterial => {
  const item = findItem(graph, accumulator.prefabName)
  const ownedTotal = ownedTotals[prefabKey(accumulator.prefabName)] ?? 0
  const perTarget = [...accumulator.perTarget.entries()].map(([targetId, share]) => ({
    targetId,
    gross: share.gross,
    net: share.net,
  }))
  return {
    prefabName: item?.prefabName ?? accumulator.prefabName,
    item,
    required: accumulator.required,
    applied: accumulator.applied,
    missing: accumulator.missing,
    ownedTotal,
    reserved: accumulator.applied,
    completion: accumulator.required === 0
      ? 1
      : Math.min(1, accumulator.applied / accumulator.required),
    craftable: accumulator.craftable,
    teleportable: item?.teleportable ?? null,
    perTarget,
    contended: accumulator.missing > 0 && accumulator.perTarget.size > 1,
  }
}

const sortMaterials = (first: PlanMaterial, second: PlanMaterial) =>
  second.missing - first.missing ||
  (first.item?.name ?? first.prefabName).localeCompare(second.item?.name ?? second.prefabName)

/**
 * Pure entry point for every planner surface. The same result feeds the
 * checklist, the breakdown tree, the map handoff, and the overlay widget.
 */
export function calculatePlan(input: PlanCalculationInput): PlanCalculation {
  const {
    graph,
    targets,
    stock,
    ignoreStock = false,
    honorManualCompletion = true,
    recipeChoices = {},
    maxDepth = MAX_EXPANSION_DEPTH,
  } = input

  const pool = createStockPool(ignoreStock ? {} : stock)
  const ownedTotals = pool.initial()
  const warnings: PlanWarning[] = []
  const stations = new Map<string, PlanStationRequirement>()
  const leaves = new Map<string, MaterialAccumulator>()
  const intermediates = new Map<string, MaterialAccumulator>()

  const results: PlanTargetResult[] = []
  for (const target of targets) {
    const currentTargetId = target.id
    const collect = (node: PlanRequirementNode) => {
      const bucket = node.expanded ? intermediates : leaves
      const key = prefabKey(node.prefabName)
      const accumulator = bucket.get(key) ?? {
        prefabName: node.prefabName,
        required: 0,
        applied: 0,
        missing: 0,
        craftable: node.expanded || node.recipe !== null,
        perTarget: new Map<string, { gross: number; net: number }>(),
      }
      accumulator.required += node.gross
      accumulator.applied += node.fromStock
      accumulator.missing += node.net
      accumulator.craftable = accumulator.craftable || node.expanded || node.recipe !== null
      const share = accumulator.perTarget.get(currentTargetId) ?? { gross: 0, net: 0 }
      share.gross += node.gross
      share.net += node.net
      accumulator.perTarget.set(currentTargetId, share)
      bucket.set(key, accumulator)
      if (node.station) mergeStationRequirements(stations, [node.station])
    }
    const result = calculateTarget({
      graph,
      pool,
      target,
      honorManualCompletion,
      recipeChoices,
      maxDepth,
      onNode: collect,
    })
    mergeStationRequirements(stations, result.stations)
    warnings.push(...result.warnings)
    results.push(result)
  }

  const materials = [...leaves.values()]
    .map((accumulator) => toMaterial(accumulator, graph, ownedTotals))
    .sort(sortMaterials)
  const intermediateMaterials = [...intermediates.values()]
    .map((accumulator) => toMaterial(accumulator, graph, ownedTotals))
    .sort(sortMaterials)

  const requiredUnits = materials.reduce((sum, material) => sum + material.required, 0)
  const missingUnits = materials.reduce((sum, material) => sum + material.missing, 0)

  return {
    version: graph.version,
    targets: results,
    materials,
    intermediates: intermediateMaterials,
    stations: [...stations.values()].sort((first, second) => first.name.localeCompare(second.name)),
    warnings,
    totals: {
      ...emptyTotals(),
      targets: results.length,
      requiredUnits,
      missingUnits,
      completion: requiredUnits === 0 ? 1 : (requiredUnits - missingUnits) / requiredUnits,
      readyTargets: results.filter((result) => result.ready).length,
      distinctMissingMaterials: materials.filter((material) => material.missing > 0).length,
    },
  }
}

export const planRecipeById = (graph: RecipeGraph, recipeId: string): PlannerRecipe | null =>
  graph.recipesById.get(recipeId) ?? null
