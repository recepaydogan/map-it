import { stationName, resolveRecipeChoice } from './build-recipe-graph.ts'
import type {
  PlanStationRequirement,
  PlanStep,
  PlanWarning,
  PlannerRecipe,
  PlannerRecipeResource,
  RecipeGraph,
} from './recipe-types.ts'

/**
 * Valheim's `Piece.Requirement.GetAmount`: the base recipe covers quality 1 and
 * legacy upgrades scale linearly. Version 1.0 doubles that multiplier at quality
 * 4, then adds half a step per quality; upgrader resources also include base cost.
 */
export const resourceAmountForQuality = (resource: PlannerRecipeResource, quality: number): number => (
  quality <= 1 ? resource.amount : resource.upgradeCostModel === '1.0'
    ? Math.floor((quality >= 4 ? 4 + (quality - 4) / 2 : quality - 1) * resource.amountPerLevel + (resource.upgraderResource ? resource.amount : 0))
    : Math.max(0, quality - 1) * resource.amountPerLevel
)

/** Valheim's `Recipe.GetRequiredStationLevel`. */
export const requiredStationLevel = (recipe: PlannerRecipe, quality: number): number =>
  recipe.isUpgrader ? 1 : Math.max(1, recipe.stationLevel) + Math.max(0, quality - 1)

/** Valheim's `Recipe.GetRequiredStation`: upgrades fall back to the repair station. */
export const requiredStationPrefab = (recipe: PlannerRecipe, quality: number): string => {
  if (recipe.stationPrefab) return recipe.stationPrefab
  if (quality > 1) return recipe.repairStationPrefab
  return ''
}

export function stationRequirement(
  graph: RecipeGraph,
  recipe: PlannerRecipe,
  quality: number,
): PlanStationRequirement | null {
  const prefab = requiredStationPrefab(recipe, quality)
  if (!prefab) return null
  return {
    stationPrefab: prefab,
    name: stationName(graph, prefab),
    level: requiredStationLevel(recipe, quality),
  }
}

export interface UpgradeStepsInput {
  graph: RecipeGraph
  recipe: PlannerRecipe
  /** 0 means the item still has to be crafted. */
  currentQuality: number
  targetQuality: number
  maxQuality: number
  targetId?: string
}

export interface UpgradeStepsResult {
  steps: PlanStep[]
  warnings: PlanWarning[]
  currentQuality: number
  targetQuality: number
}

/**
 * Expands a target into the exact craft and upgrade steps between the quality
 * the player owns and the quality they want. Nothing is included for quality
 * levels the player already has.
 */
export function buildUpgradeSteps({
  graph,
  recipe,
  currentQuality,
  targetQuality,
  maxQuality,
  targetId,
}: UpgradeStepsInput): UpgradeStepsResult {
  const warnings: PlanWarning[] = []
  const ceiling = Math.max(1, Math.round(maxQuality))
  const safeCurrent = Math.min(Math.max(0, Math.round(currentQuality)), ceiling)
  const requestedTarget = Math.round(targetQuality)
  const safeTarget = Math.min(Math.max(requestedTarget, Math.max(1, safeCurrent)), ceiling)
  if (safeCurrent !== Math.round(currentQuality) || safeTarget !== requestedTarget) {
    warnings.push({
      code: 'quality-clamped',
      targetId,
      prefabName: recipe.outputPrefab,
      detail: `${safeCurrent}->${safeTarget}`,
    })
  }
  if (recipe.requireOnlyOneIngredient && recipe.resources.length > 1) {
    warnings.push({
      code: 'require-one-ingredient',
      targetId,
      prefabName: recipe.outputPrefab,
      detail: recipe.resources.map((resource) => resource.prefabName).join(','),
    })
  }

  // `requireOnlyOneIngredient` recipes accept any single listed ingredient. The
  // planner picks the first and tells the user the choice exists.
  const usableResources = recipe.requireOnlyOneIngredient
    ? recipe.resources.slice(0, 1)
    : recipe.resources

  const steps: PlanStep[] = []
  if (safeCurrent === 0) {
    steps.push({
      kind: 'craft',
      quality: 1,
      station: stationRequirement(graph, recipe, 1),
      resources: usableResources
        .map((resource) => ({
          prefabName: resource.prefabName,
          amount: resourceAmountForQuality(resource, 1),
        }))
        .filter((resource) => resource.amount > 0),
    })
  }
  for (let quality = Math.max(2, safeCurrent + 1); quality <= safeTarget; quality += 1) {
    const upgradeRecipe = recipe.kind === 'conversion'
      ? resolveRecipeChoice(graph, recipe.outputPrefab, null, true).recipe : recipe
    if (!upgradeRecipe) {
      warnings.push({ code: 'recipe-unavailable', targetId, prefabName: recipe.outputPrefab })
      break
    }
    const upgradeResources = upgradeRecipe.requireOnlyOneIngredient ? upgradeRecipe.resources.slice(0, 1) : upgradeRecipe.resources
    const resources = upgradeResources
      .map((resource) => ({
        prefabName: resource.prefabName,
        amount: resourceAmountForQuality(resource, quality),
      }))
      .filter((resource) => resource.amount > 0)
    steps.push({
      kind: 'upgrade',
      quality,
      station: stationRequirement(graph, upgradeRecipe, quality),
      resources,
    })
  }

  return { steps, warnings, currentQuality: safeCurrent, targetQuality: safeTarget }
}

/** Highest level needed per station across a set of steps. */
export function collectStationRequirements(steps: PlanStep[]): PlanStationRequirement[] {
  const byPrefab = new Map<string, PlanStationRequirement>()
  for (const step of steps) {
    if (!step.station) continue
    const existing = byPrefab.get(step.station.stationPrefab)
    if (!existing || step.station.level > existing.level) {
      byPrefab.set(step.station.stationPrefab, step.station)
    }
  }
  return [...byPrefab.values()].sort((first, second) => first.name.localeCompare(second.name))
}
