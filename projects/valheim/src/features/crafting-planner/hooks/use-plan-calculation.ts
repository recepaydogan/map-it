import { useMemo } from 'react'
import { mergeStock } from '../../../lib/crafting/allocate-inventory.ts'
import { calculatePlan } from '../../../lib/crafting/calculate-plan.ts'
import type { PlanCalculation, RecipeGraph } from '../../../lib/crafting/recipe-types.ts'
import type { CraftingPlan } from '../../../store/crafting-planner-store.ts'

export interface PlanCalculationOptions {
  graph: RecipeGraph | null
  plan: CraftingPlan | null
  /** Owned amounts from the tracking mod; empty when it is not usable. */
  liveStock: Record<string, number>
  /** True when live counts may override manual "done" ticks. */
  liveAuthoritative: boolean
}

const fingerprintStock = (stock: Record<string, number>) =>
  Object.keys(stock).sort().map((key) => `${key}:${stock[key]}`).join('|')

const fingerprintPlan = (plan: CraftingPlan | null) => {
  if (!plan) return ''
  const targets = plan.targets
    .map((target) => [
      target.id,
      target.prefabName,
      target.quantity,
      target.currentQuality,
      target.targetQuality,
      target.recipeId ?? '',
      target.expandIntermediates ? 1 : 0,
      target.completed ? 1 : 0,
    ].join(':'))
    .join('|')
  const choices = Object.entries(plan.recipeChoices).sort().map((entry) => entry.join(':')).join('|')
  return `${plan.id}#${targets}#${choices}#${fingerprintStock(plan.manualOwned)}`
}

/**
 * Recomputes only when the catalog, the plan, or the owned amounts actually
 * change, so live inventory polling never re-runs the graph for identical data.
 */
export function usePlanCalculation({
  graph,
  plan,
  liveStock,
  liveAuthoritative,
}: PlanCalculationOptions): PlanCalculation | null {
  const planFingerprint = fingerprintPlan(plan)
  const stockFingerprint = fingerprintStock(liveStock)

  return useMemo(() => {
    if (!graph || !plan) return null
    return calculatePlan({
      graph,
      targets: plan.targets,
      stock: mergeStock(plan.manualOwned, liveStock),
      honorManualCompletion: !liveAuthoritative,
      recipeChoices: plan.recipeChoices,
    })
    // The fingerprints stand in for the deeply nested plan and stock objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, planFingerprint, stockFingerprint, liveAuthoritative])
}
